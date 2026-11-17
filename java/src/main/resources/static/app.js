const formulario = document.querySelector("#formulario-ruta");
const aviso = document.querySelector("#aviso");
const tabla = document.querySelector("#tabla-solicitudes");
let datosActuales;

function escapeHtml(valor) {
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
      <strong>${escapeHtml(nombres.get(arista.origenId))} → ${escapeHtml(nombres.get(arista.destinoId))}</strong>
      <span>${escapeHtml(arista.distanciaKm)} km · ${escapeHtml(arista.tiempoBaseMin)} min base · $${escapeHtml(arista.costoBase)} · tráfico ${escapeHtml(arista.nivelTrafico)}</span>
    </article>`).join("");
  for (const id of ["origen", "destino"]) {
    const select = document.querySelector(`#${id}`);
    select.innerHTML = red.ubicaciones.map(ubicacion =>
      `<option value="${escapeHtml(ubicacion.id)}">${escapeHtml(ubicacion.nombre)} (${escapeHtml(ubicacion.id)})</option>`).join("");
  }
}

function mostrarVehiculos(vehiculos) {
  document.querySelector("#lista-vehiculos").innerHTML = vehiculos.map(vehiculo => `
    <article class="tarjeta-vehiculo">
      <strong>${escapeHtml(vehiculo.tipo)} · ${escapeHtml(vehiculo.placa)}</strong><br>
      <span>Capacidad ${escapeHtml(vehiculo.capacidad)} · estado <b>${escapeHtml(vehiculo.estado)}</b></span>
    </article>`).join("");
}

function mostrarSolicitudes(solicitudes) {
  tabla.innerHTML = solicitudes.map(solicitud => `
    <tr>
      <td>${escapeHtml(solicitud.cliente)}</td>
      <td>${escapeHtml(solicitud.origenId)} → ${escapeHtml(solicitud.destinoId)}</td>
      <td>${escapeHtml(solicitud.criterio)}</td>
      <td>${escapeHtml(solicitud.distanciaTotalKm ?? "—")} km</td>
      <td>${escapeHtml(solicitud.tiempoTotalMin ?? "—")} min</td>
      <td>${escapeHtml(solicitud.costoTotal ?? "—")}</td>
      <td>${escapeHtml(solicitud.vehiculoAsignadoId || "—")}</td>
      <td><span class="estado ${solicitud.estado === "finalizado" ? "" : "ocupado"}">${escapeHtml(solicitud.estado)}</span></td>
      <td>${solicitud.estado === "en curso" ? `<button class="accion-finalizar" data-id="${escapeHtml(solicitud.id)}">Finalizar</button>` : ""}</td>
    </tr>`).join("");
}

async function cargarDatos() {
  datosActuales = await solicitar("/api/datos");
  mostrarGrafo(datosActuales.red);
  mostrarVehiculos(datosActuales.vehiculos);
  mostrarSolicitudes(datosActuales.solicitudes);
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
