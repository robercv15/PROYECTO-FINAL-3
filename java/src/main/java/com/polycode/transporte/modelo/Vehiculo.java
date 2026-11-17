package com.polycode.transporte.modelo;

public final class Vehiculo {
    private final String id;
    private final String placa;
    private final String tipo;
    private final int capacidad;
    private EstadoVehiculo estado;

    public Vehiculo(String id, String placa, String tipo, int capacidad, EstadoVehiculo estado) {
        this.id = id;
        this.placa = placa;
        this.tipo = tipo;
        this.capacidad = capacidad;
        this.estado = estado;
    }

    public String getId() {
        return id;
    }

    public String getPlaca() {
        return placa;
    }

    public String getTipo() {
        return tipo;
    }

    public int getCapacidad() {
        return capacidad;
    }

    public synchronized EstadoVehiculo getEstado() {
        return estado;
    }

    public synchronized boolean ocupar(int pasajeros) {
        if (estado != EstadoVehiculo.disponible || capacidad < pasajeros) {
            return false;
        }
        estado = EstadoVehiculo.ocupado;
        return true;
    }

    public synchronized void liberar() {
        estado = EstadoVehiculo.disponible;
    }
}
