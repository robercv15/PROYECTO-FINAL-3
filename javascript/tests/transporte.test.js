import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { ErrorNegocio, ServicioTransporte } from "../src/transporte.js";

const directorioProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [red, catalogoVehiculos, datosCasos] = await Promise.all([
  readFile(path.join(directorioProyecto, "datos", "red_transporte.json"), "utf8").then(JSON.parse),
  readFile(path.join(directorioProyecto, "datos", "vehiculos.json"), "utf8").then(JSON.parse),
  readFile(path.join(directorioProyecto, "datos", "casos_prueba.json"), "utf8").then(JSON.parse)
]);
const casos = datosCasos.casos;

function crearServicio(redPrueba = red) {
  return new ServicioTransporte(redPrueba, catalogoVehiculos);
}

test("caso 1: encuentra la ruta de menor distancia en el grafo básico", () => {
  const caso = casos[0];
  const resultado = crearServicio(caso.redPrueba).procesarSolicitud(caso.solicitud);
  assert.deepEqual(resultado.rutaIds, caso.resultadoEsperado.rutaIds);
  assert.equal(resultado.distanciaTotalKm, caso.resultadoEsperado.distanciaTotalKm);
  assert.equal(resultado.tiempoTotalMin, caso.resultadoEsperado.tiempoTotalMin);
  assert.equal(resultado.costoTotal, caso.resultadoEsperado.costoTotal);
});

test("caso 2: calcula la ruta más rápida evitando el tráfico alto", () => {
  const caso = casos[1];
  const resultado = crearServicio().procesarSolicitud(caso.solicitud);
  assert.deepEqual(resultado.rutaIds, caso.resultadoEsperado.rutaIds);
  assert.equal(resultado.tiempoTotalMin, caso.resultadoEsperado.tiempoTotalMin);
  assert.equal(resultado.distanciaTotalKm, caso.resultadoEsperado.distanciaTotalKm);
  assert.equal(resultado.costoTotal, caso.resultadoEsperado.costoTotal);
});

test("caso 3: encuentra la ruta de menor costo", () => {
  const caso = casos[2];
  const resultado = crearServicio().procesarSolicitud(caso.solicitud);
  assert.deepEqual(resultado.rutaIds, caso.resultadoEsperado.rutaIds);
  assert.equal(resultado.costoTotal, caso.resultadoEsperado.costoTotal);
  assert.equal(resultado.distanciaTotalKm, caso.resultadoEsperado.distanciaTotalKm);
  assert.equal(resultado.tiempoTotalMin, caso.resultadoEsperado.tiempoTotalMin);
});

test("caso 4: asigna el vehículo con capacidad suficiente y lo libera al finalizar", () => {
  const caso = casos[3];
  const servicio = crearServicio();
  const resultado = servicio.procesarSolicitud(caso.solicitud);
  const esperado = caso.resultadoEsperado;
  assert.deepEqual(resultado.rutaIds, esperado.rutaIds);
  assert.equal(resultado.distanciaTotalKm, esperado.distanciaTotalKm);
  assert.equal(resultado.vehiculoAsignadoId, esperado.vehiculoAsignadoId);
  let vehiculos = new Map(servicio.obtenerDatos().vehiculos.map(vehiculo => [vehiculo.id, vehiculo]));
  assert.equal(vehiculos.get(esperado.vehiculoAsignadoId).estado, esperado.vehiculoEstadoDespuesDeAsignar);

  const finalizada = servicio.finalizarSolicitud(caso.solicitud.id);
  vehiculos = new Map(servicio.obtenerDatos().vehiculos.map(vehiculo => [vehiculo.id, vehiculo]));
  assert.equal(finalizada.estado, "finalizado");
  assert.equal(vehiculos.get(esperado.vehiculoAsignadoId).estado, "disponible");
});

test("caso 5: devuelve error controlado cuando no hay una ruta posible", () => {
  const caso = casos[4];
  const servicio = crearServicio();
  assert.throws(
    () => servicio.procesarSolicitud(caso.solicitud),
    error => error instanceof ErrorNegocio
      && error.codigo === caso.resultadoEsperado.error.codigo
      && error.message === caso.resultadoEsperado.error.mensaje
  );
  assert.deepEqual(servicio.obtenerDatos().solicitudes, []);
});

test("procesa rutas del lote concurrentemente y conserva el orden de entrada", async () => {
  const solicitudes = [casos[1].solicitud, casos[2].solicitud];
  const resultados = await crearServicio().procesarLote(solicitudes);
  assert.deepEqual(resultados.map(resultado => resultado.solicitud.id), ["S-002", "S-003"]);
  assert.deepEqual(resultados.map(resultado => resultado.rutaIds), [["A", "D", "C"], ["A", "B", "C"]]);
  assert.deepEqual(resultados.map(resultado => resultado.vehiculoAsignadoId), ["V-MOTO-01", "V-AUTO-01"]);
});

test("devuelve errores controlados por elemento cuando el lote no encuentra ruta o capacidad", async () => {
  const solicitudes = [
    { id: "S-ERR-RUTA", cliente: "Cliente", origenId: "A", destinoId: "E", criterio: "distancia", fecha: "2026-01-15T10:00:00Z", pasajeros: 1 },
    { id: "S-ERR-CAP", cliente: "Cliente", origenId: "A", destinoId: "C", criterio: "distancia", fecha: "2026-01-15T10:00:00Z", pasajeros: 99 }
  ];
  const resultados = await crearServicio().procesarLote(solicitudes);
  assert.deepEqual(resultados.map(resultado => resultado.exitoso), [false, false]);
  assert.deepEqual(resultados.map(resultado => resultado.codigoError), [
    "RUTA_NO_DISPONIBLE",
    "VEHICULO_NO_DISPONIBLE"
  ]);
});

test("rechaza solicitudes con capacidad no positiva", () => {
  const solicitud = { ...casos[0].solicitud, pasajeros: 0 };
  assert.throws(
    () => crearServicio(casos[0].redPrueba).procesarSolicitud(solicitud),
    error => error instanceof ErrorNegocio && error.codigo === "CAPACIDAD_INVALIDA"
  );
});
