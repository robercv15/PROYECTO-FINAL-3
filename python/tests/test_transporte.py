import json
from pathlib import Path

import pytest

from src.transporte import ErrorNegocio, ServicioTransporte, cargar_json


DIRECTORIO_PROYECTO = Path(__file__).resolve().parents[2]
CASOS = json.loads((DIRECTORIO_PROYECTO / "datos" / "casos_prueba.json").read_text(encoding="utf-8"))["casos"]
VEHICULOS = cargar_json("vehiculos.json")
RED = cargar_json("red_transporte.json")


def crear_servicio(red=None):
    return ServicioTransporte(red or RED, VEHICULOS)


def entrada(caso):
    return caso["solicitud"]


def test_caso_1_ruta_mas_corta_en_grafo_basico():
    caso = CASOS[0]
    with crear_servicio(caso["redPrueba"]) as servicio:
        resultado = servicio.procesar_solicitud(entrada(caso))

    esperado = caso["resultadoEsperado"]
    assert resultado["rutaIds"] == esperado["rutaIds"]
    assert resultado["distanciaTotalKm"] == esperado["distanciaTotalKm"]
    assert resultado["tiempoTotalMin"] == esperado["tiempoTotalMin"]
    assert resultado["costoTotal"] == esperado["costoTotal"]


def test_caso_2_ruta_mas_rapida_evadiendo_trafico_alto():
    caso = CASOS[1]
    with crear_servicio() as servicio:
        resultado = servicio.procesar_solicitud(entrada(caso))

    esperado = caso["resultadoEsperado"]
    assert resultado["rutaIds"] == esperado["rutaIds"]
    assert resultado["tiempoTotalMin"] == esperado["tiempoTotalMin"]
    assert resultado["distanciaTotalKm"] == esperado["distanciaTotalKm"]
    assert resultado["costoTotal"] == esperado["costoTotal"]


def test_caso_3_ruta_mas_barata():
    caso = CASOS[2]
    with crear_servicio() as servicio:
        resultado = servicio.procesar_solicitud(entrada(caso))

    esperado = caso["resultadoEsperado"]
    assert resultado["rutaIds"] == esperado["rutaIds"]
    assert resultado["costoTotal"] == esperado["costoTotal"]
    assert resultado["distanciaTotalKm"] == esperado["distanciaTotalKm"]
    assert resultado["tiempoTotalMin"] == esperado["tiempoTotalMin"]


def test_caso_4_asigna_vehiculo_con_capacidad_y_lo_libera_al_finalizar():
    caso = CASOS[3]
    with crear_servicio() as servicio:
        resultado = servicio.procesar_solicitud(entrada(caso))
        esperado = caso["resultadoEsperado"]
        assert resultado["rutaIds"] == esperado["rutaIds"]
        assert resultado["distanciaTotalKm"] == esperado["distanciaTotalKm"]
        assert resultado["vehiculoAsignadoId"] == esperado["vehiculoAsignadoId"]
        vehiculos = {vehiculo["id"]: vehiculo for vehiculo in servicio.obtener_datos()["vehiculos"]}
        assert vehiculos[esperado["vehiculoAsignadoId"]]["estado"] == esperado["vehiculoEstadoDespuesDeAsignar"]

        finalizada = servicio.finalizar_solicitud(entrada(caso)["id"])
        vehiculos = {vehiculo["id"]: vehiculo for vehiculo in servicio.obtener_datos()["vehiculos"]}
        assert finalizada["estado"] == "finalizado"
        assert vehiculos[esperado["vehiculoAsignadoId"]]["estado"] == "disponible"


def test_caso_5_error_controlado_cuando_no_hay_ruta():
    caso = CASOS[4]
    with crear_servicio() as servicio:
        with pytest.raises(ErrorNegocio) as capturado:
            servicio.procesar_solicitud(entrada(caso))

        esperado = caso["resultadoEsperado"]["error"]
        assert capturado.value.codigo == esperado["codigo"]
        assert str(capturado.value) == esperado["mensaje"]
        assert servicio.obtener_datos()["solicitudes"] == []


def test_lote_paralelo_conserva_el_orden_y_asigna_sin_reutilizar_vehiculos_ocupados():
    entradas = [entrada(CASOS[1]), entrada(CASOS[2])]
    with crear_servicio() as servicio:
        resultados = servicio.procesar_lote(entradas)

    assert len(resultados) == 2
    assert [resultado["solicitud"]["id"] for resultado in resultados] == ["S-002", "S-003"]
    assert [resultado["rutaIds"] for resultado in resultados] == [["A", "D", "C"], ["A", "B", "C"]]
    assert [resultado["vehiculoAsignadoId"] for resultado in resultados] == ["V-MOTO-01", "V-AUTO-01"]


def test_lote_devuelve_error_controlado_por_solicitud_sin_ruta_o_capacidad():
    solicitudes = [
        {
            "id": "S-ERR-RUTA",
            "cliente": "Cliente",
            "origenId": "A",
            "destinoId": "E",
            "criterio": "distancia",
            "fecha": "2026-01-15T10:00:00Z",
            "pasajeros": 1,
        },
        {
            "id": "S-ERR-CAP",
            "cliente": "Cliente",
            "origenId": "A",
            "destinoId": "C",
            "criterio": "distancia",
            "fecha": "2026-01-15T10:00:00Z",
            "pasajeros": 99,
        },
    ]
    with crear_servicio() as servicio:
        resultados = servicio.procesar_lote(solicitudes)

    assert [resultado["exitoso"] for resultado in resultados] == [False, False]
    assert [resultado["codigoError"] for resultado in resultados] == [
        "RUTA_NO_DISPONIBLE",
        "VEHICULO_NO_DISPONIBLE",
    ]


def test_rechaza_capacidad_no_positiva():
    solicitud = {**entrada(CASOS[0]), "pasajeros": 0}
    with crear_servicio(CASOS[0]["redPrueba"]) as servicio:
        with pytest.raises(ErrorNegocio) as capturado:
            servicio.procesar_solicitud(solicitud)

    assert capturado.value.codigo == "CAPACIDAD_INVALIDA"
