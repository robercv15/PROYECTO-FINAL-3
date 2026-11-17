const formulario = document.querySelector("#formulario-ruta");
const aviso = document.querySelector("#aviso");
const tabla = document.querySelector("#tabla-solicitudes");

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

async function solicitar(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(opciones.headers || {}) }
  });
  const resultado = await respuesta.json();
  if (!respuesta.ok) throw new Error(resultado.mensaje || "No se pudo completar la operación.");
  return resultado;
}

function mostrarGrafo(red) {
  const nombres = new Map(red.ubicaciones.map(ubicacion => [ubicacion.id, ubicacion.nombre]));
  document.querySelector("#grafo").innerHTML = red.conexiones.map(arista => `
    <article class="conexion">
      <strong>${escaparHtml(nombres.get(arista.origenId))} → ${escaparHtml(nombres.get(arista.destinoId))}</strong>
      <span>${escaparHtml(arista.distanciaKm)} km · ${escaparHtml(arista.tiempoBaseMin)} min base · $${escaparHtml(arista.costoBase)} · tráfico ${escaparHtml(arista.nivelTrafico)}</span>
    </article>`).join("");
  for (const id of ["origen", "destino"]) {
    document.querySelector(`#${id}`).innerHTML = red.ubicaciones.map(ubicacion =>
      `<option value="${escaparHtml(ubicacion.id)}">${escaparHtml(ubicacion.nombre)} (${escaparHtml(ubicacion.id)})</option>`
    ).join("");
  }
}

function mostrarVehiculos(vehiculos) {
  document.querySelector("#lista-vehiculos").innerHTML = vehiculos.map(vehiculo => `
    <article class="tarjeta-vehiculo">
      <strong>${escaparHtml(vehiculo.tipo)} · ${escaparHtml(vehiculo.placa)}</strong><br>
      <span>Capacidad ${escaparHtml(vehiculo.capacidad)} · estado <b>${escaparHtml(vehiculo.estado)}</b></span>
    </article>`).join("");
}

function mostrarSolicitudes(solicitudes) {
  tabla.innerHTML = solicitudes.map(solicitud => `
    <tr>
      <td>${escaparHtml(solicitud.cliente)}</td>
      <td>${escaparHtml(solicitud.origenId)} → ${escaparHtml(solicitud.destinoId)}</td>
      <td>${escaparHtml(solicitud.criterio)}</td>
      <td>${escaparHtml(solicitud.distanciaTotalKm ?? "—")} km</td>
      <td>${escaparHtml(solicitud.tiempoTotalMin ?? "—")} min</td>
      <td>${escaparHtml(solicitud.costoTotal ?? "—")}</td>
      <td>${escaparHtml(solicitud.vehiculoAsignadoId || "—")}</td>
      <td><span class="estado ${solicitud.estado === "finalizado" ? "" : "ocupado"}">${escaparHtml(solicitud.estado)}</span></td>
      <td>${solicitud.estado === "en curso" ? `<button class="accion-finalizar" data-id="${escaparHtml(solicitud.id)}">Finalizar</button>` : ""}</td>
    </tr>`).join("");
}

async function cargarDatos() {
  const datos = await solicitar("/api/datos");
  mostrarGrafo(datos.red);
  mostrarVehiculos(datos.vehiculos);
  mostrarSolicitudes(datos.solicitudes);
}

formulario.addEventListener("submit", async evento => {
  evento.preventDefault();
  const boton = formulario.querySelector("button");
  boton.disabled = true;
  aviso.className = "aviso";
  aviso.textContent = "";
  const campos = Object.fromEntries(new FormData(formulario).entries());
  const solicitud = {
    ...campos,
    id: `S-${Date.now()}`,
    fecha: new Date().toISOString(),
    pasajeros: Number(campos.pasajeros)
  };
  try {
    const resultado = await solicitar("/api/rutas", { method: "POST", body: JSON.stringify(solicitud) });
    aviso.className = "aviso exito";
    aviso.textContent = `Ruta ${resultado.rutaIds.join(" → ")}: ${resultado.distanciaTotalKm} km, ${resultado.tiempoTotalMin} min. Vehículo ${resultado.vehiculoAsignadoId}.`;
    await cargarDatos();
  } catch (error) {
    aviso.className = "aviso error";
    aviso.textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});

document.querySelector("#procesar-lote").addEventListener("click", async evento => {
  const boton = evento.currentTarget;
  boton.disabled = true;
  try {
    const fecha = new Date().toISOString();
    const respuesta = await solicitar("/api/lote", {
      method: "POST",
      body: JSON.stringify({ solicitudes: [
        { id: `L-${Date.now()}-1`, cliente: "Lote: ruta rápida", origenId: "A", destinoId: "C", criterio: "tiempo", fecha, pasajeros: 1 },
        { id: `L-${Date.now()}-2`, cliente: "Lote: ruta económica", origenId: "A", destinoId: "C", criterio: "costo", fecha, pasajeros: 1 }
      ] })
    });
    const exitos = respuesta.resultados.filter(resultado => resultado.exitoso).length;
    aviso.className = "aviso exito";
    aviso.textContent = `Lote completado en el orden de entrada: ${exitos} de ${respuesta.resultados.length} solicitudes asignadas.`;
    await cargarDatos();
  } catch (error) {
    aviso.className = "aviso error";
    aviso.textContent = error.message;
  } finally {
    boton.disabled = false;
  }
});

tabla.addEventListener("click", async evento => {
  const boton = evento.target.closest("[data-id]");
  if (!boton) return;
  try {
    await solicitar(`/api/solicitudes/${encodeURIComponent(boton.dataset.id)}/finalizar`, { method: "POST" });
    aviso.className = "aviso exito";
    aviso.textContent = "Viaje finalizado; el vehículo quedó disponible.";
    await cargarDatos();
  } catch (error) {
    aviso.className = "aviso error";
    aviso.textContent = error.message;
  }
});

cargarDatos().catch(error => {
  aviso.className = "aviso error";
  aviso.textContent = `No se pudieron cargar los datos: ${error.message}`;
});
