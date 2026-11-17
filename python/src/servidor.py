"""Servidor HTTP estándar y entrega de la interfaz web de Python."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from typing import Any
import json
import logging

from transporte import ErrorNegocio, ServicioTransporte, crear_servicio_desde_datos


PUERTO = 8082
DIRECTORIO_PYTHON = Path(__file__).resolve().parents[1]
DIRECTORIO_ESTATICO = (DIRECTORIO_PYTHON / "static").resolve()
TAMANO_MAXIMO_CUERPO = 1_000_000
logger = logging.getLogger("servidor_transporte")


def crear_manejador(servicio: ServicioTransporte) -> type[BaseHTTPRequestHandler]:
    class ManejadorHTTP(BaseHTTPRequestHandler):
        server_version = "TransportePython/1.0"

        def do_GET(self) -> None:
            ruta = urlsplit(self.path).path
            if ruta.startswith("/api/"):
                if ruta == "/api/datos":
                    self._responder_json(200, servicio.obtener_datos())
                else:
                    self._responder_error(
                        404, "ENDPOINT_NO_ENCONTRADO", "No existe el endpoint solicitado."
                    )
                return
            self._servir_estatico(ruta)

        def do_POST(self) -> None:
            ruta = urlsplit(self.path).path
            try:
                if ruta == "/api/rutas":
                    solicitud = self._leer_json()
                    resultado = servicio.procesar_solicitud(solicitud)
                    self._responder_json(201, resultado)
                    return
                if ruta == "/api/lote":
                    cuerpo = self._leer_json()
                    solicitudes = (
                        cuerpo
                        if isinstance(cuerpo, list)
                        else cuerpo.get("solicitudes") if isinstance(cuerpo, dict) else None
                    )
                    if not isinstance(solicitudes, list):
                        raise ErrorNegocio(
                            "SOLICITUD_INVALIDA", "Se esperaba un arreglo de solicitudes."
                        )
                    self._responder_json(200, {"resultados": servicio.procesar_lote(solicitudes)})
                    return
                prefijo = "/api/solicitudes/"
                sufijo = "/finalizar"
                if ruta.startswith(prefijo) and ruta.endswith(sufijo):
                    identificador = unquote(ruta[len(prefijo):-len(sufijo)])
                    if not identificador:
                        raise ErrorNegocio(
                            "SOLICITUD_NO_ENCONTRADA", "No existe la solicitud indicada."
                        )
                    solicitud = servicio.finalizar_solicitud(identificador)
                    self._responder_json(200, {"solicitud": solicitud})
                    return
                self._responder_error(
                    404, "ENDPOINT_NO_ENCONTRADO", "No existe el endpoint solicitado."
                )
            except ErrorNegocio as error:
                self._responder_error(400, error.codigo, str(error))
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self._responder_error(
                    400,
                    "SOLICITUD_INVALIDA",
                    "El cuerpo de la solicitud no tiene un formato JSON válido.",
                )
            except Exception:
                logger.exception("Error interno al atender una solicitud.")
                self._responder_error(
                    500,
                    "ERROR_INTERNO",
                    "Ocurrió un error interno al procesar la solicitud.",
                )

        def do_PUT(self) -> None:
            self._metodo_no_permitido()

        def do_DELETE(self) -> None:
            self._metodo_no_permitido()

        def _leer_json(self) -> Any:
            try:
                longitud = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise ValueError("Longitud de contenido inválida.") from error
            if longitud <= 0 or longitud > TAMANO_MAXIMO_CUERPO:
                raise ValueError("Longitud de contenido inválida.")
            cuerpo = self.rfile.read(longitud)
            return json.loads(cuerpo.decode("utf-8"))

        def _servir_estatico(self, ruta: str) -> None:
            nombre = "index.html" if ruta == "/" else ruta.lstrip("/")
            archivo = (DIRECTORIO_ESTATICO / nombre).resolve()
            if not archivo.is_relative_to(DIRECTORIO_ESTATICO) or not archivo.is_file():
                self._responder_error(
                    404, "ARCHIVO_NO_ENCONTRADO", "No se encontró el recurso solicitado."
                )
                return
            tipos = {
                ".html": "text/html; charset=utf-8",
                ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
            }
            contenido = archivo.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", tipos.get(archivo.suffix.lower(), "application/octet-stream"))
            self.send_header("Content-Length", str(len(contenido)))
            self.end_headers()
            self.wfile.write(contenido)

        def _responder_json(self, estado: int, cuerpo: Any) -> None:
            contenido = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            self.send_response(estado)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(contenido)))
            self.end_headers()
            self.wfile.write(contenido)

        def _responder_error(self, estado: int, codigo: str, mensaje: str) -> None:
            self._responder_json(estado, {"codigo": codigo, "mensaje": mensaje})

        def _metodo_no_permitido(self) -> None:
            self._responder_error(
                405, "METODO_NO_PERMITIDO", "El método HTTP no está permitido para esta ruta."
            )

        def log_message(self, formato: str, *argumentos: Any) -> None:
            logger.info("%s - %s", self.address_string(), formato % argumentos)

    return ManejadorHTTP


def crear_servidor(
    servicio: ServicioTransporte | None = None,
    host: str = "0.0.0.0",
    puerto: int = PUERTO,
) -> tuple[ThreadingHTTPServer, ServicioTransporte]:
    instancia = servicio or crear_servicio_desde_datos()
    servidor = ThreadingHTTPServer((host, puerto), crear_manejador(instancia))
    servidor.daemon_threads = True
    return servidor, instancia


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    servidor, servicio = crear_servidor()
    print(f"Servidor Python disponible en http://localhost:{PUERTO}", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.", flush=True)
    finally:
        servidor.server_close()
        servicio.cerrar()


if __name__ == "__main__":
    main()
