package com.polycode.transporte.modelo;

import java.util.List;
import java.util.Map;

public record RedTransporte(
        List<Ubicacion> ubicaciones,
        List<Conexion> conexiones,
        Map<String, Double> multiplicadoresTrafico) {
}
