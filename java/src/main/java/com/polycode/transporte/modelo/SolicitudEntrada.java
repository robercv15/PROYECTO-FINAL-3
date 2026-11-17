package com.polycode.transporte.modelo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record SolicitudEntrada(
        String id,
        String cliente,
        String origenId,
        String destinoId,
        String criterio,
        String fecha,
        int pasajeros,
        String nivelTrafico) {
}
