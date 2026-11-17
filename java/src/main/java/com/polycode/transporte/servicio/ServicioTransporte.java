package com.polycode.transporte.servicio;

import com.polycode.transporte.modelo.Conexion;
import com.polycode.transporte.modelo.Criterio;
import com.polycode.transporte.modelo.EstadoVehiculo;
import com.polycode.transporte.modelo.NivelTrafico;
import com.polycode.transporte.modelo.RedTransporte;
import com.polycode.transporte.modelo.Solicitud;
import com.polycode.transporte.modelo.SolicitudEntrada;
import com.polycode.transporte.modelo.Ubicacion;
import com.polycode.transporte.modelo.Vehiculo;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class ServicioTransporte implements AutoCloseable {
    private final RedTransporte red;
    private final Map<String, Ubicacion> ubicaciones;
    private final Map<String, List<Conexion>> adyacencias;
    private final List<Vehiculo> vehiculos;
    private final Map<String, Solicitud> solicitudes = new LinkedHashMap<>();
    private final ExecutorService ejecutor;

    public ServicioTransporte(RedTransporte red, List<Vehiculo> vehiculos) {
        this.red = red;
        this.ubicaciones = new HashMap<>();
        this.adyacencias = new HashMap<>();
        red.ubicaciones().forEach(ubicacion -> {
            if (ubicaciones.putIfAbsent(ubicacion.id(), ubicacion) != null) {
                throw new IllegalArgumentException("La red contiene identificadores de ubicación duplicados.");
            }
            adyacencias.put(ubicacion.id(), new ArrayList<>());
        });
        red.conexiones().forEach(conexion -> {
            if (!ubicaciones.containsKey(conexion.origenId()) || !ubicaciones.containsKey(conexion.destinoId())) {
                throw new IllegalArgumentException("Una conexión referencia una ubicación inexistente.");
            }
            adyacencias.get(conexion.origenId()).add(conexion);
        });
        this.vehiculos = new ArrayList<>(vehiculos);
        int hilos = Math.max(2, Runtime.getRuntime().availableProcessors());
        this.ejecutor = Executors.newFixedThreadPool(hilos);
    }

    public ResultadoRuta procesarSolicitud(SolicitudEntrada entrada) {
        RutaCalculada ruta = calcularRuta(entrada);
        return asignarVehiculoYRegistrar(entrada, ruta);
    }

    public List<ResultadoRuta> procesarLote(List<SolicitudEntrada> entradas) {
        validarLote(entradas);
        List<Future<CalculoEnLote>> futuros = entradas.stream()
                .map(entrada -> ejecutor.submit(() -> {
                    try {
                        return new CalculoEnLote(calcularRuta(entrada), null);
                    } catch (ErrorNegocio error) {
                        return new CalculoEnLote(null, error);
                    }
                }))
                .toList();
        List<CalculoEnLote> calculos = new ArrayList<>(futuros.size());
        for (Future<CalculoEnLote> futuro : futuros) {
            try {
                calculos.add(futuro.get());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("El procesamiento del lote fue interrumpido.", exception);
            } catch (ExecutionException exception) {
                Throwable causa = exception.getCause();
                if (causa instanceof RuntimeException runtimeException) {
                    throw runtimeException;
                }
                throw new IllegalStateException("No se pudo calcular una ruta del lote.", causa);
            }
        }

        List<ResultadoRuta> resultados = new ArrayList<>(entradas.size());
        for (int i = 0; i < entradas.size(); i++) {
            CalculoEnLote calculo = calculos.get(i);
            if (calculo.error() != null) {
                resultados.add(resultadoError(entradas.get(i), calculo.error()));
                continue;
            }
            try {
                resultados.add(asignarVehiculoYRegistrar(entradas.get(i), calculo.ruta()));
            } catch (ErrorNegocio error) {
                resultados.add(resultadoError(entradas.get(i), error));
            }
        }
        return resultados;
    }

    public synchronized List<Vehiculo> obtenerVehiculos() {
        return List.copyOf(vehiculos);
    }

    public synchronized List<Solicitud> obtenerSolicitudes() {
        return List.copyOf(solicitudes.values());
    }

    public RedTransporte obtenerRed() {
        return red;
    }

    public synchronized Solicitud finalizarSolicitud(String id) {
        Solicitud solicitud = solicitudes.get(id);
        if (solicitud == null) {
            throw new ErrorNegocio("SOLICITUD_NO_ENCONTRADA", "No existe la solicitud indicada.");
        }
        if (!"finalizado".equals(solicitud.estado()) && solicitud.vehiculoAsignadoId() != null) {
            vehiculos.stream()
                    .filter(vehiculo -> vehiculo.getId().equals(solicitud.vehiculoAsignadoId()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("El vehículo asignado no existe."))
                    .liberar();
        }
        Solicitud finalizada = new Solicitud(
                solicitud.id(), solicitud.cliente(), solicitud.origenId(), solicitud.destinoId(),
                solicitud.criterio(), solicitud.fecha(), "finalizado", solicitud.pasajeros(),
                solicitud.nivelTrafico(), solicitud.vehiculoAsignadoId());
        solicitudes.put(id, finalizada);
        return finalizada;
    }

    private synchronized void validarLote(List<SolicitudEntrada> entradas) {
        Set<String> ids = new HashSet<>();
        for (SolicitudEntrada entrada : entradas) {
            validarEntrada(entrada);
            if (!ids.add(entrada.id()) || solicitudes.containsKey(entrada.id())) {
                throw new ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.");
            }
        }
    }

    private RutaCalculada calcularRuta(SolicitudEntrada entrada) {
        validarEntrada(entrada);
        if (!ubicaciones.containsKey(entrada.origenId()) || !ubicaciones.containsKey(entrada.destinoId())) {
            throw new ErrorNegocio("UBICACION_NO_ENCONTRADA", "El origen o el destino no existe en la red.");
        }
        Criterio criterio = parsearCriterio(entrada.criterio());
        NivelTrafico trafico = parsearTrafico(entrada.nivelTrafico());

        Map<String, Double> distancias = new HashMap<>();
        Map<String, Conexion> predecesores = new HashMap<>();
        PriorityQueue<NodoDistancia> pendientes = new PriorityQueue<>(
                Comparator.comparingDouble(NodoDistancia::distancia).thenComparing(NodoDistancia::id));
        distancias.put(entrada.origenId(), 0.0);
        pendientes.add(new NodoDistancia(entrada.origenId(), 0.0));

        while (!pendientes.isEmpty()) {
            NodoDistancia actual = pendientes.poll();
            if (actual.distancia() > distancias.getOrDefault(actual.id(), Double.POSITIVE_INFINITY)) {
                continue;
            }
            if (actual.id().equals(entrada.destinoId())) {
                break;
            }
            for (Conexion conexion : adyacencias.get(actual.id())) {
                double peso = obtenerPeso(conexion, criterio, trafico);
                double alternativa = actual.distancia() + peso;
                if (alternativa < distancias.getOrDefault(conexion.destinoId(), Double.POSITIVE_INFINITY)) {
                    distancias.put(conexion.destinoId(), alternativa);
                    predecesores.put(conexion.destinoId(), conexion);
                    pendientes.add(new NodoDistancia(conexion.destinoId(), alternativa));
                }
            }
        }

        if (!distancias.containsKey(entrada.destinoId())) {
            throw new ErrorNegocio("RUTA_NO_DISPONIBLE", "No existe una ruta entre el origen y el destino.");
        }
        List<String> rutaIds = reconstruirRuta(entrada.origenId(), entrada.destinoId(), predecesores);
        double distanciaTotalKm = 0;
        double tiempoTotalMin = 0;
        double costoTotal = 0;
        for (int i = 0; i < rutaIds.size() - 1; i++) {
            String origen = rutaIds.get(i);
            String destino = rutaIds.get(i + 1);
            Conexion conexion = predecesores.get(destino);
            if (conexion == null || !conexion.origenId().equals(origen)) {
                throw new IllegalStateException("No se encontró una arista de la ruta calculada.");
            }
            distanciaTotalKm += conexion.distanciaKm();
            tiempoTotalMin += obtenerTiempo(conexion, trafico);
            costoTotal += conexion.costoBase();
        }
        return new RutaCalculada(rutaIds, distanciaTotalKm, tiempoTotalMin, costoTotal, criterio);
    }

    private synchronized ResultadoRuta asignarVehiculoYRegistrar(SolicitudEntrada entrada, RutaCalculada ruta) {
        if (solicitudes.containsKey(entrada.id())) {
            throw new ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.");
        }
        Vehiculo vehiculo = vehiculos.stream()
                .filter(candidato -> candidato.getEstado() == EstadoVehiculo.disponible)
                .filter(candidato -> candidato.getCapacidad() >= entrada.pasajeros())
                .findFirst()
                .orElseThrow(() -> new ErrorNegocio(
                        "VEHICULO_NO_DISPONIBLE",
                        "No hay un vehículo disponible con capacidad suficiente."));
        if (!vehiculo.ocupar(entrada.pasajeros())) {
            throw new ErrorNegocio("VEHICULO_NO_DISPONIBLE", "No hay un vehículo disponible con capacidad suficiente.");
        }
        Solicitud solicitud = new Solicitud(
                entrada.id(), entrada.cliente(), entrada.origenId(), entrada.destinoId(),
                ruta.criterio(), entrada.fecha(), "en curso", entrada.pasajeros(),
                entrada.nivelTrafico(), vehiculo.getId());
        solicitudes.put(solicitud.id(), solicitud);
        return new ResultadoRuta(
                true, solicitud, ruta.rutaIds(), ruta.distanciaTotalKm(), ruta.tiempoTotalMin(),
                ruta.costoTotal(), vehiculo.getId(), null, null);
    }

    private void validarEntrada(SolicitudEntrada entrada) {
        if (entrada == null || esVacio(entrada.id()) || esVacio(entrada.cliente())
                || esVacio(entrada.origenId()) || esVacio(entrada.destinoId())
                || esVacio(entrada.criterio()) || esVacio(entrada.fecha())) {
            throw new ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud debe incluir sus campos obligatorios.");
        }
        if (entrada.pasajeros() < 1) {
            throw new ErrorNegocio("CAPACIDAD_INVALIDA", "La cantidad de pasajeros debe ser mayor que cero.");
        }
        parsearCriterio(entrada.criterio());
        parsearTrafico(entrada.nivelTrafico());
    }

    private Criterio parsearCriterio(String valor) {
        try {
            return Criterio.valueOf(valor);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new ErrorNegocio("CRITERIO_INVALIDO", "El criterio debe ser distancia, tiempo o costo.");
        }
    }

    private NivelTrafico parsearTrafico(String valor) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        try {
            return NivelTrafico.valueOf(valor);
        } catch (IllegalArgumentException exception) {
            throw new ErrorNegocio("TRAFICO_INVALIDO", "El nivel de tráfico debe ser bajo, medio o alto.");
        }
    }

    private double obtenerPeso(Conexion conexion, Criterio criterio, NivelTrafico trafico) {
        return switch (criterio) {
            case distancia -> conexion.distanciaKm();
            case tiempo -> obtenerTiempo(conexion, trafico);
            case costo -> conexion.costoBase();
        };
    }

    private double obtenerTiempo(Conexion conexion, NivelTrafico trafico) {
        NivelTrafico nivel = trafico == null ? conexion.nivelTrafico() : trafico;
        Double multiplicador = red.multiplicadoresTrafico().get(nivel.name());
        if (multiplicador == null) {
            throw new IllegalStateException("Falta el multiplicador del nivel de tráfico " + nivel + ".");
        }
        return conexion.tiempoBaseMin() * multiplicador;
    }

    private List<String> reconstruirRuta(String origen, String destino, Map<String, Conexion> predecesores) {
        List<String> ruta = new ArrayList<>();
        String actual = destino;
        ruta.add(actual);
        while (!actual.equals(origen)) {
            Conexion conexion = predecesores.get(actual);
            if (conexion == null) {
                throw new IllegalStateException("No se pudo reconstruir la ruta calculada.");
            }
            actual = conexion.origenId();
            ruta.add(actual);
        }
        Collections.reverse(ruta);
        return List.copyOf(ruta);
    }

    private ResultadoRuta resultadoError(SolicitudEntrada entrada, ErrorNegocio error) {
        return new ResultadoRuta(
                false, null, List.of(), 0, 0, 0, null, error.getCodigo(), error.getMessage());
    }

    private boolean esVacio(String valor) {
        return valor == null || valor.isBlank();
    }

    @Override
    public void close() {
        ejecutor.shutdown();
    }

    private record NodoDistancia(String id, double distancia) {
    }

    private record RutaCalculada(
            List<String> rutaIds,
            double distanciaTotalKm,
            double tiempoTotalMin,
            double costoTotal,
            Criterio criterio) {
    }

    private record CalculoEnLote(RutaCalculada ruta, ErrorNegocio error) {
    }
}
