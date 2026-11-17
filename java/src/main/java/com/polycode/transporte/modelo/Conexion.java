package com.polycode.transporte.modelo;

public record Conexion(
        String origenId,
        String destinoId,
        double distanciaKm,
        double tiempoBaseMin,
        double costoBase,
        NivelTrafico nivelTrafico) {
}
