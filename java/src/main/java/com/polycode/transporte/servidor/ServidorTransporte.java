package com.polycode.transporte.servidor;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polycode.transporte.infraestructura.CargadorDatos;
import com.polycode.transporte.modelo.SolicitudEntrada;
import com.polycode.transporte.servicio.ErrorNegocio;
import com.polycode.transporte.servicio.ServicioTransporte;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public final class ServidorTransporte {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int PUERTO = 8081;
    private final ServicioTransporte servicio;
    private final Path directorioEstatico;

    private ServidorTransporte(ServicioTransporte servicio, Path directorioEstatico) {
        this.servicio = servicio;
        this.directorioEstatico = directorioEstatico;
    }

    public static void main(String[] args) throws IOException {
        ServicioTransporte servicio = new ServicioTransporte(
                CargadorDatos.cargarRed(), CargadorDatos.cargarVehiculos());
        Path estaticos = resolverEstaticos();
        HttpServer servidor = HttpServer.create(new InetSocketAddress(PUERTO), 0);
        ServidorTransporte aplicacion = new ServidorTransporte(servicio, estaticos);
        servidor.createContext("/", aplicacion::manejar);
        servidor.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(8));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            servidor.stop(1);
            servicio.close();
        }));
        servidor.start();
        System.out.println("Servidor Java disponible en http://localhost:" + PUERTO);
    }

    private void manejar(HttpExchange intercambio) throws IOException {
        try {
            String ruta = intercambio.getRequestURI().getPath();
            String metodo = intercambio.getRequestMethod();
            if (ruta.startsWith("/api/")) {
                manejarApi(intercambio, metodo, ruta);
            } else {
                servirEstatico(intercambio, ruta);
            }
        } catch (ErrorNegocio error) {
            responderJson(intercambio, 400, Map.of(
                    "codigo", error.getCodigo(),
                    "mensaje", error.getMessage()));
        } catch (JsonProcessingException error) {
            responderJson(intercambio, 400, Map.of(
                    "codigo", "SOLICITUD_INVALIDA",
                    "mensaje", "El cuerpo de la solicitud no tiene un formato JSON válido."));
        } catch (IllegalArgumentException error) {
            responderJson(intercambio, 400, Map.of(
                    "codigo", "SOLICITUD_INVALIDA",
                    "mensaje", "El cuerpo de la solicitud no tiene un formato válido."));
        } catch (Exception error) {
            System.err.println("Error al atender la solicitud: " + error.getMessage());
            responderJson(intercambio, 500, Map.of(
                    "codigo", "ERROR_INTERNO",
                    "mensaje", "Ocurrió un error interno al procesar la solicitud."));
        }
    }

    private void manejarApi(HttpExchange intercambio, String metodo, String ruta) throws IOException {
        if ("GET".equals(metodo) && "/api/datos".equals(ruta)) {
            responderJson(intercambio, 200, Map.of(
                    "red", servicio.obtenerRed(),
                    "vehiculos", servicio.obtenerVehiculos(),
                    "solicitudes", servicio.obtenerSolicitudes()));
            return;
        }
        if ("POST".equals(metodo) && "/api/rutas".equals(ruta)) {
            SolicitudEntrada entrada = MAPPER.readValue(intercambio.getRequestBody(), SolicitudEntrada.class);
            responderJson(intercambio, 201, servicio.procesarSolicitud(entrada));
            return;
        }
        if ("POST".equals(metodo) && "/api/lote".equals(ruta)) {
            JsonNode cuerpo = MAPPER.readTree(intercambio.getRequestBody());
            JsonNode solicitudes = cuerpo.isArray() ? cuerpo : cuerpo.get("solicitudes");
            if (solicitudes == null || !solicitudes.isArray()) {
                throw new IllegalArgumentException("Se esperaba un arreglo de solicitudes.");
            }
            List<SolicitudEntrada> entradas = MAPPER.readerForListOf(SolicitudEntrada.class).readValue(solicitudes);
            responderJson(intercambio, 200, Map.of("resultados", servicio.procesarLote(entradas)));
            return;
        }
        if ("POST".equals(metodo) && ruta.startsWith("/api/solicitudes/") && ruta.endsWith("/finalizar")) {
            String idCodificado = ruta.substring("/api/solicitudes/".length(), ruta.length() - "/finalizar".length());
            String id = URLDecoder.decode(idCodificado, StandardCharsets.UTF_8);
            responderJson(intercambio, 200, Map.of("solicitud", servicio.finalizarSolicitud(id)));
            return;
        }
        responderJson(intercambio, 404, Map.of(
                "codigo", "ENDPOINT_NO_ENCONTRADO",
                "mensaje", "No existe el endpoint solicitado."));
    }

    private void servirEstatico(HttpExchange intercambio, String ruta) throws IOException {
        String archivo = "/".equals(ruta) ? "index.html" : ruta.substring(1);
        Path destino = directorioEstatico.resolve(archivo).normalize();
        if (!destino.startsWith(directorioEstatico) || !Files.isRegularFile(destino)) {
            responderJson(intercambio, 404, Map.of(
                    "codigo", "ARCHIVO_NO_ENCONTRADO",
                    "mensaje", "No se encontró el recurso solicitado."));
            return;
        }
        String tipo = switch (extension(destino)) {
            case "html" -> "text/html; charset=utf-8";
            case "js" -> "text/javascript; charset=utf-8";
            case "css" -> "text/css; charset=utf-8";
            default -> "application/octet-stream";
        };
        byte[] contenido = Files.readAllBytes(destino);
        intercambio.getResponseHeaders().set("Content-Type", tipo);
        intercambio.sendResponseHeaders(200, contenido.length);
        try (var salida = intercambio.getResponseBody()) {
            salida.write(contenido);
        }
    }

    private void responderJson(HttpExchange intercambio, int estado, Object cuerpo) throws IOException {
        byte[] json = MAPPER.writeValueAsBytes(cuerpo);
        intercambio.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        intercambio.sendResponseHeaders(estado, json.length);
        try (var salida = intercambio.getResponseBody()) {
            salida.write(json);
        }
    }

    private static Path resolverEstaticos() throws IOException {
        for (Path candidato : List.of(
                Path.of("java", "src", "main", "resources", "static"),
                Path.of("src", "main", "resources", "static"))) {
            if (Files.isDirectory(candidato)) {
                return candidato.toRealPath();
            }
        }
        throw new IOException("No se encontró la carpeta de archivos estáticos de Java.");
    }

    private String extension(Path archivo) {
        String nombre = archivo.getFileName().toString();
        int punto = nombre.lastIndexOf('.');
        return punto < 0 ? "" : nombre.substring(punto + 1).toLowerCase();
    }
}
