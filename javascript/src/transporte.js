import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directorioProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const multiplicadoresTrafico = Object.freeze({ bajo: 1.0, medio: 1.2, alto: 1.5 });

export class ErrorNegocio extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorNegocio";
    this.codigo = codigo;
  }
}

export async function cargarJson(nombre) {
  const archivo = path.join(directorioProyecto, "datos", nombre);
  try {
    return JSON.parse(await readFile(archivo, "utf8"));
  } catch (error) {
    throw new Error(`No se pudo cargar el archivo de datos: ${archivo}`, { cause: error });
  }
}

export async function crearServicioDesdeDatos() {
  const [red, catalogoVehiculos] = await Promise.all([
    cargarJson("red_transporte.json"),
    cargarJson("vehiculos.json")
  ]);
  return new ServicioTransporte(red, catalogoVehiculos);
}

export class ServicioTransporte {
  #solicitudes = new Map();

  constructor(red, catalogoVehiculos) {
    this.red = red;
    this.ubicaciones = new Map(red.ubicaciones.map(ubicacion => [ubicacion.id, ubicacion]));
    if (this.ubicaciones.size !== red.ubicaciones.length) {
      throw new Error("La red contiene identificadores de ubicación duplicados.");
    }

    this.adyacencias = new Map([...this.ubicaciones.keys()].map(id => [id, []]));
    for (const conexion of red.conexiones) {
      if (!this.ubicaciones.has(conexion.origenId) || !this.ubicaciones.has(conexion.destinoId)) {
        throw new Error("Una conexión referencia una ubicación inexistente.");
      }
      this.adyacencias.get(conexion.origenId).push(conexion);
    }
    this.vehiculos = catalogoVehiculos.vehiculos.map(vehiculo => ({ ...vehiculo }));
  }

  procesarSolicitud(entrada) {
    const solicitudValidada = this.#validarEntrada(entrada);
    const ruta = this.#calcularRuta(solicitudValidada);
    return this.#asignarYRegistrar(solicitudValidada, ruta);
  }

  async procesarLote(entradas) {
    if (!Array.isArray(entradas)) {
      throw new ErrorNegocio("SOLICITUD_INVALIDA", "Se esperaba un arreglo de solicitudes.");
    }
    const entradasValidadas = entradas.map(entrada => this.#validarEntrada(entrada));
    const ids = entradasValidadas.map(entrada => entrada.id);
    if (new Set(ids).size !== ids.length || ids.some(id => this.#solicitudes.has(id))) {
      throw new ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.");
    }

    const calculos = await Promise.all(entradasValidadas.map(async entrada => {
      try {
        return { ruta: await Promise.resolve().then(() => this.#calcularRuta(entrada)), error: null };
      } catch (error) {
        if (error instanceof ErrorNegocio) return { ruta: null, error };
        throw error;
      }
    }));

    return entradasValidadas.map((entrada, indice) => {
      const { ruta, error } = calculos[indice];
      if (error) return this.#resultadoError(error);
      try {
        return this.#asignarYRegistrar(entrada, ruta);
      } catch (errorAsignacion) {
        if (errorAsignacion instanceof ErrorNegocio) return this.#resultadoError(errorAsignacion);
        throw errorAsignacion;
      }
    });
  }

  finalizarSolicitud(id) {
    const solicitud = this.#solicitudes.get(id);
    if (!solicitud) {
      throw new ErrorNegocio("SOLICITUD_NO_ENCONTRADA", "No existe la solicitud indicada.");
    }
    if (solicitud.estado !== "finalizado" && solicitud.vehiculoAsignadoId !== null) {
      const vehiculo = this.vehiculos.find(actual => actual.id === solicitud.vehiculoAsignadoId);
      if (!vehiculo) throw new Error("El vehículo asignado no existe.");
      vehiculo.estado = "disponible";
    }
    solicitud.estado = "finalizado";
    return { ...solicitud };
  }

  obtenerDatos() {
    return {
      red: this.red,
      vehiculos: this.vehiculos.map(vehiculo => ({ ...vehiculo })),
      solicitudes: [...this.#solicitudes.values()].map(solicitud => ({ ...solicitud }))
    };
  }

  #validarEntrada(entrada) {
    if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) {
      throw new ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud debe ser un objeto JSON.");
    }
    const campos = ["id", "cliente", "origenId", "destinoId", "criterio", "fecha"];
    if (campos.some(campo => typeof entrada[campo] !== "string" || !entrada[campo].trim())) {
      throw new ErrorNegocio("SOLICITUD_INVALIDA", "La solicitud debe incluir sus campos obligatorios.");
    }
    if (!Number.isInteger(entrada.pasajeros) || entrada.pasajeros < 1) {
      throw new ErrorNegocio("CAPACIDAD_INVALIDA", "La cantidad de pasajeros debe ser mayor que cero.");
    }
    if (!["distancia", "tiempo", "costo"].includes(entrada.criterio)) {
      throw new ErrorNegocio("CRITERIO_INVALIDO", "El criterio debe ser distancia, tiempo o costo.");
    }
    const nivelTrafico = entrada.nivelTrafico || null;
    if (nivelTrafico !== null && !Object.hasOwn(multiplicadoresTrafico, nivelTrafico)) {
      throw new ErrorNegocio("TRAFICO_INVALIDO", "El nivel de tráfico debe ser bajo, medio o alto.");
    }
    if (!this.ubicaciones.has(entrada.origenId) || !this.ubicaciones.has(entrada.destinoId)) {
      throw new ErrorNegocio("UBICACION_NO_ENCONTRADA", "El origen o el destino no existe en la red.");
    }
    return { ...entrada, nivelTrafico };
  }

  #calcularRuta(entrada) {
    const { origenId, destinoId, criterio, nivelTrafico } = entrada;
    const distancias = new Map([[origenId, 0]]);
    const predecesores = new Map();
    const pendientes = [{ id: origenId, distancia: 0 }];

    while (pendientes.length > 0) {
      pendientes.sort((a, b) => a.distancia - b.distancia || a.id.localeCompare(b.id));
      const actual = pendientes.shift();
      if (actual.distancia > (distancias.get(actual.id) ?? Infinity)) continue;
      if (actual.id === destinoId) break;

      for (const conexion of this.adyacencias.get(actual.id)) {
        const alternativa = actual.distancia + this.#peso(conexion, criterio, nivelTrafico);
        if (alternativa < (distancias.get(conexion.destinoId) ?? Infinity)) {
          distancias.set(conexion.destinoId, alternativa);
          predecesores.set(conexion.destinoId, conexion);
          pendientes.push({ id: conexion.destinoId, distancia: alternativa });
        }
      }
    }

    if (!distancias.has(destinoId)) {
      throw new ErrorNegocio("RUTA_NO_DISPONIBLE", "No existe una ruta entre el origen y el destino.");
    }
    const rutaIds = [destinoId];
    while (rutaIds.at(-1) !== origenId) {
      const conexion = predecesores.get(rutaIds.at(-1));
      if (!conexion) throw new Error("No se pudo reconstruir la ruta calculada.");
      rutaIds.push(conexion.origenId);
    }
    rutaIds.reverse();

    let distanciaTotalKm = 0;
    let tiempoTotalMin = 0;
    let costoTotal = 0;
    for (const destino of rutaIds.slice(1)) {
      const conexion = predecesores.get(destino);
      distanciaTotalKm += conexion.distanciaKm;
      tiempoTotalMin += this.#tiempo(conexion, nivelTrafico);
      costoTotal += conexion.costoBase;
    }
    return { rutaIds, distanciaTotalKm, tiempoTotalMin, costoTotal };
  }

  #peso(conexion, criterio, nivelTrafico) {
    if (criterio === "distancia") return conexion.distanciaKm;
    if (criterio === "tiempo") return this.#tiempo(conexion, nivelTrafico);
    return conexion.costoBase;
  }

  #tiempo(conexion, nivelTrafico) {
    const nivel = nivelTrafico || conexion.nivelTrafico;
    const multiplicadores = this.red.multiplicadoresTrafico ?? multiplicadoresTrafico;
    if (!Object.hasOwn(multiplicadores, nivel)) {
      throw new Error(`Falta el multiplicador del nivel de tráfico ${nivel}.`);
    }
    return conexion.tiempoBaseMin * multiplicadores[nivel];
  }

  #asignarYRegistrar(entrada, ruta) {
    if (this.#solicitudes.has(entrada.id)) {
      throw new ErrorNegocio("SOLICITUD_DUPLICADA", "El identificador de solicitud ya existe.");
    }
    const vehiculo = this.vehiculos.find(actual =>
      actual.estado === "disponible" && actual.capacidad >= entrada.pasajeros
    );
    if (!vehiculo) {
      throw new ErrorNegocio(
        "VEHICULO_NO_DISPONIBLE",
        "No hay un vehículo disponible con capacidad suficiente."
      );
    }
    vehiculo.estado = "ocupado";
    const solicitud = {
      id: entrada.id,
      cliente: entrada.cliente,
      origenId: entrada.origenId,
      destinoId: entrada.destinoId,
      criterio: entrada.criterio,
      fecha: entrada.fecha,
      estado: "en curso",
      pasajeros: entrada.pasajeros,
      nivelTrafico: entrada.nivelTrafico,
      vehiculoAsignadoId: vehiculo.id
    };
    this.#solicitudes.set(solicitud.id, solicitud);
    return {
      exitoso: true,
      solicitud: { ...solicitud },
      ...ruta,
      vehiculoAsignadoId: vehiculo.id,
      codigoError: null,
      mensajeError: null
    };
  }

  #resultadoError(error) {
    return {
      exitoso: false,
      solicitud: null,
      rutaIds: [],
      distanciaTotalKm: 0,
      tiempoTotalMin: 0,
      costoTotal: 0,
      vehiculoAsignadoId: null,
      codigoError: error.codigo,
      mensajeError: error.message
    };
  }
}
