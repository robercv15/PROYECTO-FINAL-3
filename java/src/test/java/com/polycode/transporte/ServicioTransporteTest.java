package com.polycode.transporte;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polycode.transporte.infraestructura.CargadorDatos;
import com.polycode.transporte.modelo.RedTransporte;
import com.polycode.transporte.modelo.SolicitudEntrada;
import com.polycode.transporte.modelo.Vehiculo;
import com.polycode.transporte.servicio.ErrorNegocio;
import com.polycode.transporte.servicio.ResultadoRuta;
import com.polycode.transporte.servicio.ServicioTransporte;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ServicioTransporteTest {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void caso1EncuentraLaRutaMasCortaDelGrafoBasico() throws Exception {
        JsonNode caso = cargarCasos().get(0);
        RedTransporte red = mapper.treeToValue(caso.get("redPrueba"), RedTransporte.class);
        try (ServicioTransporte servicio = new ServicioTransporte(red, CargadorDatos.cargarVehiculos())) {
            ResultadoRuta resultado = servicio.procesarSolicitud(entrada(caso));
            assertEquals(caso.get("resultadoEsperado").get("rutaIds").toString(),
                    mapper.valueToTree(resultado.rutaIds()).toString());
            assertEquals(8, resultado.distanciaTotalKm());
            assertEquals(10, resultado.tiempoTotalMin());
            assertEquals(4, resultado.costoTotal());
        }
    }

    @Test
    void caso2EvitaElTraficoAltoParaLlegarMasRapido() throws Exception {
        JsonNode caso = cargarCasos().get(1);
        try (ServicioTransporte servicio = servicioInicial()) {
            ResultadoRuta resultado = servicio.procesarSolicitud(entrada(caso));
            assertEquals(List.of("A", "D", "C"), resultado.rutaIds());
            assertEquals(8, resultado.tiempoTotalMin());
            assertEquals(6, resultado.distanciaTotalKm());
            assertEquals(6, resultado.costoTotal());
        }
    }

    @Test
    void caso3EncuentraLaRutaDeMenorCosto() throws Exception {
        JsonNode caso = cargarCasos().get(2);
        try (ServicioTransporte servicio = servicioInicial()) {
            ResultadoRuta resultado = servicio.procesarSolicitud(entrada(caso));
            assertEquals(List.of("A", "B", "C"), resultado.rutaIds());
            assertEquals(4, resultado.costoTotal());
            assertEquals(8, resultado.distanciaTotalKm());
            assertEquals(10, resultado.tiempoTotalMin());
        }
    }

    @Test
    void caso4AsignaVehiculoSuficienteYLoLiberaAlFinalizar() throws Exception {
        JsonNode caso = cargarCasos().get(3);
        try (ServicioTransporte servicio = servicioInicial()) {
            ResultadoRuta resultado = servicio.procesarSolicitud(entrada(caso));
            assertEquals("V-AUTO-01", resultado.vehiculoAsignadoId());
            assertEquals(6, resultado.distanciaTotalKm());
            assertEquals("ocupado", servicio.obtenerVehiculos().get(1).getEstado().name());
            servicio.finalizarSolicitud(entrada(caso).id());
            assertEquals("disponible", servicio.obtenerVehiculos().get(1).getEstado().name());
        }
    }

    @Test
    void caso5DevuelveErrorControladoSiNoExisteRuta() throws Exception {
        JsonNode caso = cargarCasos().get(4);
        try (ServicioTransporte servicio = servicioInicial()) {
            ErrorNegocio error = assertThrows(ErrorNegocio.class,
                    () -> servicio.procesarSolicitud(entrada(caso)));
            assertEquals(caso.get("resultadoEsperado").get("error").get("codigo").asText(), error.getCodigo());
            assertEquals(caso.get("resultadoEsperado").get("error").get("mensaje").asText(), error.getMessage());
            assertTrue(servicio.obtenerSolicitudes().isEmpty());
        }
    }

    @Test
    void loteCalculaEnParaleloYConservaElOrdenDeEntrada() throws Exception {
        JsonNode casos = cargarCasos();
        List<SolicitudEntrada> entradas = List.of(entrada(casos.get(1)), entrada(casos.get(2)));
        try (ServicioTransporte servicio = servicioInicial()) {
            List<ResultadoRuta> resultados = servicio.procesarLote(entradas);
            assertEquals(2, resultados.size());
            assertEquals("S-002", resultados.get(0).solicitud().id());
            assertEquals("S-003", resultados.get(1).solicitud().id());
            assertEquals(List.of("A", "D", "C"), resultados.get(0).rutaIds());
            assertEquals(List.of("A", "B", "C"), resultados.get(1).rutaIds());
            assertTrue(resultados.stream().allMatch(ResultadoRuta::exitoso));
        }
    }

    @Test
    void loteInformaPorElementoLosErroresDeRutaYCapacidad() throws Exception {
        SolicitudEntrada sinRuta = new SolicitudEntrada(
                "S-ERR-RUTA", "Cliente", "A", "E", "distancia", "2026-01-15T10:00:00Z", 1, null);
        SolicitudEntrada sinVehiculo = new SolicitudEntrada(
                "S-ERR-CAP", "Cliente", "A", "C", "distancia", "2026-01-15T10:00:00Z", 99, null);
        try (ServicioTransporte servicio = servicioInicial()) {
            List<ResultadoRuta> resultados = servicio.procesarLote(List.of(sinRuta, sinVehiculo));
            assertFalse(resultados.get(0).exitoso());
            assertEquals("RUTA_NO_DISPONIBLE", resultados.get(0).codigoError());
            assertFalse(resultados.get(1).exitoso());
            assertEquals("VEHICULO_NO_DISPONIBLE", resultados.get(1).codigoError());
        }
    }

    private ServicioTransporte servicioInicial() throws Exception {
        return new ServicioTransporte(CargadorDatos.cargarRed(), CargadorDatos.cargarVehiculos());
    }

    private JsonNode cargarCasos() throws Exception {
        for (Path candidato : List.of(Path.of("datos", "casos_prueba.json"), Path.of("..", "datos", "casos_prueba.json"))) {
            if (Files.isRegularFile(candidato)) {
                return mapper.readTree(candidato.toFile()).get("casos");
            }
        }
        throw new IllegalStateException("No se encontró el archivo común de casos de prueba.");
    }

    private SolicitudEntrada entrada(JsonNode caso) throws Exception {
        return mapper.treeToValue(caso.get("solicitud"), SolicitudEntrada.class);
    }
}
