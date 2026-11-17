package com.polycode.transporte.modelo;

public record Solicitud(
        String id,
        String cliente,
        String origenId,
        String destinoId,
        Criterio criterio,
        String fecha,
        String estado,
        int pasajeros,
        String nivelTrafico,
        String vehiculoAsignadoId) {
}
