package com.polycode.transporte.servicio;

public final class ErrorNegocio extends RuntimeException {
    private final String codigo;

    public ErrorNegocio(String codigo, String mensaje) {
        super(mensaje);
        this.codigo = codigo;
    }

    public String getCodigo() {
        return codigo;
    }
}
