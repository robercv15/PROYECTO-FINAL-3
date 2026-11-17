package com.polycode.transporte.servicio;

import com.polycode.transporte.modelo.Solicitud;
import java.util.List;

public record ResultadoRuta(
        boolean exitoso,
        Solicitud solicitud,
        List<String> rutaIds,
        double distanciaTotalKm,
        double tiempoTotalMin,
        double costoTotal,
        String vehiculoAsignadoId,
        String codigoError,
        String mensajeError) {
}
