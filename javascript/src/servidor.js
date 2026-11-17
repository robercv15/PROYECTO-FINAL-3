import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ErrorNegocio, crearServicioDesdeDatos } from "./transporte.js";

const directorioActual = path.dirname(fileURLToPath(import.meta.url));
const directorioPublico = await realpath(path.resolve(directorioActual, "../public"));
const tamanoMaximoCuerpo = 1_000_000;
const tiposContenido = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"]
]);

function responderJson(respuesta, estado, cuerpo) {
  const contenido = Buffer.from(JSON.stringify(cuerpo));
  respuesta.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": contenido.length
  });
  respuesta.end(contenido);
}

function responderError(respuesta, estado, codigo, mensaje) {
  responderJson(respuesta, estado, { codigo, mensaje });
}

async function leerJson(solicitud) {
  const partes = [];
  let bytes = 0;
  for await (const parte of solicitud) {
    bytes += parte.length;
    if (bytes > tamanoMaximoCuerpo) {
      throw new ErrorNegocio("SOLICITUD_INVALIDA", "El cuerpo de la solicitud excede el tamaño permitido.");
    }
    partes.push(parte);
  }
  if (bytes === 0) {
    throw new ErrorNegocio("SOLICITUD_INVALIDA", "El cuerpo de la solicitud no puede estar vacío.");
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErrorNegocio("SOLICITUD_INVALIDA", "El cuerpo de la solicitud no tiene un formato JSON válido.");
  }
}

async function servirArchivo(ruta, respuesta) {
  const nombre = ruta === "/" ? "index.html" : ruta.slice(1);
  const archivo = path.resolve(directorioPublico, nombre);
  if (!archivo.startsWith(`${directorioPublico}${path.sep}`) && archivo !== directorioPublico) {
    responderError(respuesta, 404, "ARCHIVO_NO_ENCONTRADO", "No se encontró el recurso solicitado.");
    return;
  }
  try {
    const archivoReal = await realpath(archivo);
    if (!archivoReal.startsWith(`${directorioPublico}${path.sep}`) || !(await stat(archivoReal)).isFile()) {
      responderError(respuesta, 404, "ARCHIVO_NO_ENCONTRADO", "No se encontró el recurso solicitado.");
      return;
    }
    const contenido = await readFile(archivoReal);
    respuesta.writeHead(200, {
      "Content-Type": tiposContenido.get(path.extname(archivoReal).toLowerCase()) ?? "application/octet-stream",
      "Content-Length": contenido.length
    });
    respuesta.end(contenido);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      responderError(respuesta, 404, "ARCHIVO_NO_ENCONTRADO", "No se encontró el recurso solicitado.");
      return;
    }
    throw error;
  }
}

export function crearServidor(servicio, host = "0.0.0.0", puerto = 8083) {
  const servidor = createServer(async (solicitud, respuesta) => {
    try {
      const url = new URL(solicitud.url, `http://${solicitud.headers.host ?? "localhost"}`);
      const ruta = decodeURIComponent(url.pathname);
      if (solicitud.method === "GET") {
        if (ruta === "/api/datos") {
          responderJson(respuesta, 200, servicio.obtenerDatos());
          return;
        }
        if (ruta.startsWith("/api/")) {
          responderError(respuesta, 404, "ENDPOINT_NO_ENCONTRADO", "No existe el endpoint solicitado.");
          return;
        }
        await servirArchivo(ruta, respuesta);
        return;
      }

      if (solicitud.method === "POST") {
        if (ruta === "/api/rutas") {
          const resultado = servicio.procesarSolicitud(await leerJson(solicitud));
          responderJson(respuesta, 201, resultado);
          return;
        }
        if (ruta === "/api/lote") {
          const cuerpo = await leerJson(solicitud);
          const solicitudes = Array.isArray(cuerpo) ? cuerpo : cuerpo?.solicitudes;
          if (!Array.isArray(solicitudes)) {
            throw new ErrorNegocio("SOLICITUD_INVALIDA", "Se esperaba un arreglo de solicitudes.");
          }
          responderJson(respuesta, 200, { resultados: await servicio.procesarLote(solicitudes) });
          return;
        }
        const coincidencia = ruta.match(/^\/api\/solicitudes\/(.+)\/finalizar$/);
        if (coincidencia) {
          responderJson(respuesta, 200, {
            solicitud: servicio.finalizarSolicitud(decodeURIComponent(coincidencia[1]))
          });
          return;
        }
      }

      if (ruta.startsWith("/api/")) {
        responderError(respuesta, 404, "ENDPOINT_NO_ENCONTRADO", "No existe el endpoint solicitado.");
      } else {
        responderError(respuesta, 405, "METODO_NO_PERMITIDO", "El método HTTP no está permitido para esta ruta.");
      }
    } catch (error) {
      if (error instanceof ErrorNegocio) {
        responderError(respuesta, 400, error.codigo, error.message);
        return;
      }
      console.error("Error interno al atender una solicitud:", error);
      responderError(respuesta, 500, "ERROR_INTERNO", "Ocurrió un error interno al procesar la solicitud.");
    }
  });
  return servidor.listen(puerto, host);
}

async function main() {
  const servicio = await crearServicioDesdeDatos();
  const servidor = crearServidor(servicio);
  servidor.on("listening", () => {
    console.log("Servidor JavaScript disponible en http://localhost:8083");
  });
  const detener = () => servidor.close(() => console.log("Servidor detenido."));
  process.once("SIGINT", detener);
  process.once("SIGTERM", detener);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error("No se pudo iniciar el servidor:", error);
    process.exitCode = 1;
  });
}
