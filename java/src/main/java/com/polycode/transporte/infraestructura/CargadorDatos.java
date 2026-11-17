package com.polycode.transporte.infraestructura;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.polycode.transporte.modelo.Conexion;
import com.polycode.transporte.modelo.EstadoVehiculo;
import com.polycode.transporte.modelo.NivelTrafico;
import com.polycode.transporte.modelo.RedTransporte;
import com.polycode.transporte.modelo.TipoUbicacion;
import com.polycode.transporte.modelo.Ubicacion;
import com.polycode.transporte.modelo.Vehiculo;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public final class CargadorDatos {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private CargadorDatos() {
    }

    public static RedTransporte cargarRed() throws IOException {
        JsonNode raiz = leerJson("red_transporte.json");
        List<Ubicacion> ubicaciones = MAPPER.convertValue(
                raiz.get("ubicaciones"), new TypeReference<>() {});
        List<Conexion> conexiones = MAPPER.convertValue(
                raiz.get("conexiones"), new TypeReference<>() {});
        Map<String, Double> multiplicadores = MAPPER.convertValue(
                raiz.get("multiplicadoresTrafico"),
                MAPPER.getTypeFactory().constructMapType(Map.class, String.class, Double.class));
        return new RedTransporte(ubicaciones, conexiones, multiplicadores);
    }

    public static List<Vehiculo> cargarVehiculos() throws IOException {
        JsonNode raiz = leerJson("vehiculos.json");
        List<VehiculoJson> vehiculosJson = MAPPER.convertValue(
                raiz.get("vehiculos"), new TypeReference<>() {});
        return vehiculosJson.stream()
                .map(vehiculo -> new Vehiculo(
                        vehiculo.id(), vehiculo.placa(), vehiculo.tipo(),
                        vehiculo.capacidad(), vehiculo.estado()))
                .toList();
    }

    private static JsonNode leerJson(String nombre) throws IOException {
        for (Path candidato : List.of(Path.of("datos", nombre), Path.of("..", "datos", nombre))) {
            if (Files.isRegularFile(candidato)) {
                return MAPPER.readTree(candidato.toFile());
            }
        }
        try (InputStream recurso = CargadorDatos.class.getResourceAsStream("/datos/" + nombre)) {
            if (recurso == null) {
                throw new IOException("No se encontró el archivo de datos: " + nombre);
            }
            return MAPPER.readTree(recurso);
        }
    }

    public record VehiculoJson(
            String id,
            String placa,
            String tipo,
            int capacidad,
            EstadoVehiculo estado) {
    }
}
