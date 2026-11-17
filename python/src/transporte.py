"""Reglas de negocio, Dijkstra y procesamiento concurrente de solicitudes."""

from concurrent.futures import ThreadPoolExecutor
from heapq import heappop, heappush
from pathlib import Path
from threading import RLock
from typing import Any
import json


DIRECTORIO_PROYECTO = Path(__file__).resolve().parents[2]
MULTIPLICADORES_TRAFICO = {"bajo": 1.0, "medio": 1.2, "alto": 1.5}


class ErrorNegocio(Exception):
    """Error de validación o regla de negocio con código controlado."""

    def __init__(self, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.codigo = codigo


def cargar_json(nombre: str) -> dict[str, Any]:
    """Carga los archivos de datos comunes del proyecto."""
    ruta = DIRECTORIO_PROYECTO / "datos" / nombre
    try:
        with ruta.open(encoding="utf-8") as archivo:
            return json.load(archivo)
    except OSError as error:
        raise RuntimeError(f"No se pudo leer el archivo de datos: {ruta}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(f"El archivo de datos no contiene JSON válido: {ruta}") from error


def crear_servicio_desde_datos() -> "ServicioTransporte":
    return ServicioTransporte(cargar_json("red_transporte.json"), cargar_json("vehiculos.json"))


class ServicioTransporte:
    """Mantiene la red y el estado compartido de vehículos y solicitudes."""

    def __init__(self, red: dict[str, Any], catalogo_vehiculos: dict[str, Any]):
        self.red = red
        self.ubicaciones = {ubicacion["id"]: ubicacion for ubicacion in red["ubicaciones"]}
        if len(self.ubicaciones) != len(red["ubicaciones"]):
            raise ValueError("La red contiene identificadores de ubicación duplicados.")

        self.adyacencias: dict[str, list[dict[str, Any]]] = {
            identificador: [] for identificador in self.ubicaciones
        }
        for conexion in red["conexiones"]:
            if conexion["origenId"] not in self.ubicaciones or conexion["destinoId"] not in self.ubicaciones:
                raise ValueError("Una conexión referencia una ubicación inexistente.")
            self.adyacencias[conexion["origenId"]].append(conexion)

        self.vehiculos = [dict(vehiculo) for vehiculo in catalogo_vehiculos["vehiculos"]]
        self.solicitudes: dict[str, dict[str, Any]] = {}
        self._bloqueo = RLock()
        self._ejecutor = ThreadPoolExecutor(thread_name_prefix="rutas")

    def procesar_solicitud(self, entrada: dict[str, Any]) -> dict[str, Any]:
        solicitud_validada = self._validar_entrada(entrada)
        ruta = self._calcular_ruta(solicitud_validada)
        return self._asignar_y_registrar(solicitud_validada, ruta)

    def procesar_lote(self, entradas: list[dict[str, Any]]) -> list[dict[str, Any]]:
        entradas_validadas = [self._validar_entrada(entrada) for entrada in entradas]
        ids = [entrada["id"] for entrada in entradas_validadas]
        if len(set(ids)) != len(ids):
            raise ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.")
        with self._bloqueo:
            if any(identificador in self.solicitudes for identificador in ids):
                raise ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.")

        calculos = list(self._ejecutor.map(self._calcular_elemento_lote, entradas_validadas))
        resultados = []
        for entrada, (ruta, error) in zip(entradas_validadas, calculos):
            if error is not None:
                resultados.append(self._resultado_error(error))
                continue
            try:
                resultados.append(self._asignar_y_registrar(entrada, ruta))
            except ErrorNegocio as error_asignacion:
                resultados.append(self._resultado_error(error_asignacion))
        return resultados

    def finalizar_solicitud(self, identificador: str) -> dict[str, Any]:
        with self._bloqueo:
            solicitud = self.solicitudes.get(identificador)
            if solicitud is None:
                raise ErrorNegocio("SOLICITUD_NO_ENCONTRADA", "No existe la solicitud indicada.")
            if solicitud["estado"] != "finalizado" and solicitud["vehiculoAsignadoId"] is not None:
                vehiculo = next(
                    (actual for actual in self.vehiculos if actual["id"] == solicitud["vehiculoAsignadoId"]),
                    None,
                )
                if vehiculo is None:
                    raise RuntimeError("El vehículo asignado no existe.")
                vehiculo["estado"] = "disponible"
            solicitud["estado"] = "finalizado"
            return dict(solicitud)

    def obtener_datos(self) -> dict[str, Any]:
        with self._bloqueo:
            return {
                "red": self.red,
                "vehiculos": [dict(vehiculo) for vehiculo in self.vehiculos],
                "solicitudes": [dict(solicitud) for solicitud in self.solicitudes.values()],
            }

    def cerrar(self) -> None:
        self._ejecutor.shutdown(wait=True)

    def __enter__(self) -> "ServicioTransporte":
        return self

    def __exit__(self, tipo: Any, valor: Any, traza: Any) -> None:
        self.cerrar()

    def _validar_entrada(self, entrada: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(entrada, dict):
            raise ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud debe ser un objeto JSON.")
        campos = ("id", "cliente", "origenId", "destinoId", "criterio", "fecha")
        if any(not isinstance(entrada.get(campo), str) or not entrada[campo].strip() for campo in campos):
            raise ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud debe incluir sus campos obligatorios.")
        pasajeros = entrada.get("pasajeros")
        if isinstance(pasajeros, bool) or not isinstance(pasajeros, int) or pasajeros < 1:
            raise ErrorNegocio("CAPACIDAD_INVALIDA", "La cantidad de pasajeros debe ser mayor que cero.")
        if entrada["criterio"] not in {"distancia", "tiempo", "costo"}:
            raise ErrorNegocio("CRITERIO_INVALIDO", "El criterio debe ser distancia, tiempo o costo.")
        nivel_trafico = entrada.get("nivelTrafico") or None
        if nivel_trafico is not None and nivel_trafico not in MULTIPLICADORES_TRAFICO:
            raise ErrorNegocio("TRAFICO_INVALIDO", "El nivel de tráfico debe ser bajo, medio o alto.")
        if entrada["origenId"] not in self.ubicaciones or entrada["destinoId"] not in self.ubicaciones:
            raise ErrorNegocio("UBICACION_NO_ENCONTRADA", "El origen o el destino no existe en la red.")
        return {**entrada, "nivelTrafico": nivel_trafico}

    def _calcular_elemento_lote(
        self, entrada: dict[str, Any]
    ) -> tuple[dict[str, Any] | None, ErrorNegocio | None]:
        try:
            return self._calcular_ruta(entrada), None
        except ErrorNegocio as error:
            return None, error

    def _calcular_ruta(self, entrada: dict[str, Any]) -> dict[str, Any]:
        origen = entrada["origenId"]
        destino = entrada["destinoId"]
        criterio = entrada["criterio"]
        distancias = {origen: 0.0}
        predecesores: dict[str, dict[str, Any]] = {}
        pendientes = [(0.0, origen)]

        while pendientes:
            distancia_actual, ubicacion_actual = heappop(pendientes)
            if distancia_actual > distancias.get(ubicacion_actual, float("inf")):
                continue
            if ubicacion_actual == destino:
                break
            for conexion in self.adyacencias[ubicacion_actual]:
                alternativa = distancia_actual + self._peso(conexion, criterio, entrada["nivelTrafico"])
                if alternativa < distancias.get(conexion["destinoId"], float("inf")):
                    distancias[conexion["destinoId"]] = alternativa
                    predecesores[conexion["destinoId"]] = conexion
                    heappush(pendientes, (alternativa, conexion["destinoId"]))

        if destino not in distancias:
            raise ErrorNegocio("RUTA_NO_DISPONIBLE", "No existe una ruta entre el origen y el destino.")

        ruta_ids = [destino]
        while ruta_ids[-1] != origen:
            conexion = predecesores.get(ruta_ids[-1])
            if conexion is None:
                raise RuntimeError("No se pudo reconstruir la ruta calculada.")
            ruta_ids.append(conexion["origenId"])
        ruta_ids.reverse()

        distancia_total = 0.0
        tiempo_total = 0.0
        costo_total = 0.0
        for destino_arista in ruta_ids[1:]:
            conexion = predecesores[destino_arista]
            distancia_total += conexion["distanciaKm"]
            tiempo_total += self._tiempo(conexion, entrada["nivelTrafico"])
            costo_total += conexion["costoBase"]
        return {
            "rutaIds": ruta_ids,
            "distanciaTotalKm": distancia_total,
            "tiempoTotalMin": tiempo_total,
            "costoTotal": costo_total,
        }

    def _peso(self, conexion: dict[str, Any], criterio: str, nivel_trafico: str | None) -> float:
        if criterio == "distancia":
            return conexion["distanciaKm"]
        if criterio == "tiempo":
            return self._tiempo(conexion, nivel_trafico)
        return conexion["costoBase"]

    def _tiempo(self, conexion: dict[str, Any], nivel_trafico: str | None) -> float:
        nivel = nivel_trafico or conexion["nivelTrafico"]
        multiplicadores = self.red.get("multiplicadoresTrafico", MULTIPLICADORES_TRAFICO)
        return conexion["tiempoBaseMin"] * multiplicadores[nivel]

    def _asignar_y_registrar(
        self, entrada: dict[str, Any], ruta: dict[str, Any]
    ) -> dict[str, Any]:
        with self._bloqueo:
            if entrada["id"] in self.solicitudes:
                raise ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.")
            vehiculo = next(
                (
                    candidato
                    for candidato in self.vehiculos
                    if candidato["estado"] == "disponible"
                    and candidato["capacidad"] >= entrada["pasajeros"]
                ),
                None,
            )
            if vehiculo is None:
                raise ErrorNegocio(
                    "VEHICULO_NO_DISPONIBLE",
                    "No hay un vehículo disponible con capacidad suficiente.",
                )
            vehiculo["estado"] = "ocupado"
            solicitud = {
                "id": entrada["id"],
                "cliente": entrada["cliente"],
                "origenId": entrada["origenId"],
                "destinoId": entrada["destinoId"],
                "criterio": entrada["criterio"],
                "fecha": entrada["fecha"],
                "estado": "en curso",
                "pasajeros": entrada["pasajeros"],
                "nivelTrafico": entrada["nivelTrafico"],
                "vehiculoAsignadoId": vehiculo["id"],
            }
            self.solicitudes[solicitud["id"]] = solicitud
            return {
                "exitoso": True,
                "solicitud": dict(solicitud),
                **ruta,
                "vehiculoAsignadoId": vehiculo["id"],
                "codigoError": None,
                "mensajeError": None,
            }

    @staticmethod
    def _resultado_error(error: ErrorNegocio) -> dict[str, Any]:
        return {
            "exitoso": False,
            "solicitud": None,
            "rutaIds": [],
            "distanciaTotalKm": 0,
            "tiempoTotalMin": 0,
            "costoTotal": 0,
            "vehiculoAsignadoId": None,
            "codigoError": error.codigo,
            "mensajeError": str(error),
        }
