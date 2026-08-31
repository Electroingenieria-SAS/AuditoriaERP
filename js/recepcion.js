// ==========================================================
// RECEPCION.JS — Módulo Optimizado de Recepción & Logística
// ==========================================================

// 1. LIMPIEZA DE MEMORIA & BOOTSTRAP
if (window.refreshRecepcionInterval) {
  clearInterval(window.refreshRecepcionInterval);
}

[
  "renderRecepciones",
  "actualizarKPIsRecepcion",
  "actualizarDashboardRecepcion",
  "iniciarRefreshRecepcion",
  "validarRecepcion",
  "verObservacion",
  "verSoportesRecepcion",
  "eliminarRecepcion",
  "eliminarSoporteRecepcionGuardado",
  "eliminarSoporteRecepcionTemporal",
  "cerrarModalGestion",
  "cerrarModalObservacion",
  "cerrarModalSoportesRecepcion"
].forEach(nombre => delete window[nombre]);

// 2. ESTADO INTERNO
var adjuntosCommonRecepcion = window.AdjuntosCommon;
var soportesRecepcionSeleccionados = [];
window.recepcionesCacheSoportes = {};
window.recepcionesCacheDatos = [];
window.recepcionGestionando = null;
window.recepcionSoportesModalId = null;

// 3. UTILIDADES
function obtenerElemento(id) {
  return document.getElementById(id);
}

function obtenerValor(id) {
  const el = obtenerElemento(id);
  return el ? el.value : "";
}

function asignarValor(id, val) {
  const el = obtenerElemento(id);
  if (el) el.value = val ?? "";
}

function escaparHTML(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function notificar(mensaje, tipo = "warning") {
  if (typeof window.mostrarNotificacion === "function") {
    window.mostrarNotificacion("Recepción", mensaje, tipo);
  } else if (typeof notifAlert === "function") {
    notifAlert(mensaje);
  } else {
    alert(mensaje);
  }
}

// 4. CONTROL DE MODALES
window.abrirModal = function (id) {
  const m = obtenerElemento(id);
  if (m) {
    m.classList.add("active");
    m.style.display = "flex";
  }
};

window.cerrarModal = function (id) {
  const m = obtenerElemento(id);
  if (m) {
    m.classList.remove("active");
    m.style.display = "none";
  }
};

window.cerrarModalGestion = () => window.cerrarModal("modalGestion");
window.cerrarModalObservacion = () => window.cerrarModal("modalObservacion");
window.cerrarModalSoportesRecepcion = () => window.cerrarModal("modalSoportesRecepcion");

// 5. CÁLCULO DINÁMICO DE % REVISADO
function calcularPorcentajeEnVivo() {
  const cant = Number(obtenerValor("cantidadInput")) || 0;
  const rev = Number(obtenerValor("revisadasInput")) || 0;
  if (cant > 0 && rev >= 0) {
    const pct = ((rev / cant) * 100).toFixed(1);
    const kpi = obtenerElemento("kpiRevisado");
    if (kpi) kpi.innerText = `${pct}%`;
  }
}

// 6. GESTIÓN DE SOPORTES TEMPORALES (CREACIÓN)
function totalSoportesRecepcion() {
  return soportesRecepcionSeleccionados.length;
}

function agregarArchivosRecepcion(archivos) {
  const max = adjuntosCommonRecepcion?.MAX_ADJUNTOS || 10;

  for (const archivo of Array.from(archivos || [])) {
    if (totalSoportesRecepcion() >= max) {
      notificar(`Solo puede agregar hasta ${max} soportes.`);
      break;
    }

    if (adjuntosCommonRecepcion) {
      const v = adjuntosCommonRecepcion.validarArchivo(archivo);
      if (!v.valido) {
        notificar(v.mensaje);
        continue;
      }
    }

    const dup = soportesRecepcionSeleccionados.some(i => 
      i.tipo === "archivo" && i.archivo.name === archivo.name && i.archivo.size === archivo.size
    );

    if (!dup) {
      soportesRecepcionSeleccionados.push({
        tipo: "archivo",
        archivo: archivo,
        nombre: archivo.name,
        mime: archivo.type || "",
        tamano: archivo.size
      });
    }
  }
  renderSoportesRecepcionTemporales();
}

function agregarDriveRecepcion() {
  const input = obtenerElemento("driveLinkRecepcion");
  if (!input) return;

  const max = adjuntosCommonRecepcion?.MAX_ADJUNTOS || 10;
  if (totalSoportesRecepcion() >= max) {
    notificar(`Solo puede agregar hasta ${max} soportes.`);
    return;
  }

  const url = adjuntosCommonRecepcion ? adjuntosCommonRecepcion.normalizarDriveUrl(input.value) : input.value.trim();
  if (!url || !url.startsWith("https://")) {
    notificar("Pegue un enlace válido de Google Drive/Docs (https://).");
    return;
  }

  if (soportesRecepcionSeleccionados.some(i => i.url === url)) {
    notificar("El enlace de Drive ya fue agregado.");
    return;
  }

  soportesRecepcionSeleccionados.push({
    tipo: "drive",
    nombre: adjuntosCommonRecepcion ? adjuntosCommonRecepcion.nombreEnlaceDrive(url, totalSoportesRecepcion() + 1) : `Enlace Drive #${totalSoportesRecepcion() + 1}`,
    url: url,
    mime: "text/uri-list",
    tamano: 0
  });

  input.value = "";
  renderSoportesRecepcionTemporales();
}

function renderSoportesRecepcionTemporales() {
  const lista = obtenerElemento("listaSoportesRecepcion");
  const contador = obtenerElemento("contadorSoportesRecepcion");
  const max = adjuntosCommonRecepcion?.MAX_ADJUNTOS || 10;

  if (contador) contador.textContent = `${totalSoportesRecepcion()} / ${max}`;
  if (!lista) return;

  if (soportesRecepcionSeleccionados.length === 0) {
    lista.innerHTML = '<div class="adjunto-vacio">Aún no se han agregado soportes documentales.</div>';
    return;
  }

  lista.innerHTML = soportesRecepcionSeleccionados.map((soporte, idx) => {
    const visual = adjuntosCommonRecepcion ? adjuntosCommonRecepcion.tipoVisual(soporte) : { icono: "📄", etiqueta: "Archivo" };
    const meta = soporte.tipo === "drive" ? visual.etiqueta : `${visual.etiqueta} · ${adjuntosCommonRecepcion ? adjuntosCommonRecepcion.formatearTamano(soporte.tamano) : (soporte.tamano + ' B')}`;

    return `
      <div class="adjunto-item">
        <div class="adjunto-item__info">
          <span class="adjunto-item__icono">${visual.icono}</span>
          <div class="adjunto-item__texto">
            <span class="adjunto-item__nombre">${escaparHTML(soporte.nombre)}</span>
            <span class="adjunto-item__meta">${escaparHTML(meta)}</span>
          </div>
        </div>
        <div class="adjunto-item__acciones">
          <button type="button" class="adjunto-btn--eliminar" onclick="eliminarSoporteRecepcionTemporal(${idx})">Quitar</button>
        </div>
      </div>`;
  }).join("");
}

window.eliminarSoporteRecepcionTemporal = function (index) {
  soportesRecepcionSeleccionados.splice(Number(index), 1);
  renderSoportesRecepcionTemporales();
};

// 7. STORAGE SUPABASE
async function subirSoportesRecepcion(listaSoportes = soportesRecepcionSeleccionados) {
  const soportesGuardados = [];
  const rutasSubidas = [];

  for (const soporte of listaSoportes) {
    if (soporte.tipo === "drive") {
      soportesGuardados.push({
        tipo: "drive",
        nombre: soporte.nombre,
        url: soporte.url,
        ruta: "",
        mime: "text/uri-list",
        tamano: 0
      });
      continue;
    }

    const archivo = soporte.archivo;
    const limpio = String(archivo.name || "soporte")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const idUnico = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const ruta = `recepciones/${idUnico}_${limpio}`;

    const subida = await window.supabaseClient.storage
      .from("recepciones-pdf")
      .upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });

    if (subida.error) {
      if (rutasSubidas.length) await window.supabaseClient.storage.from("recepciones-pdf").remove(rutasSubidas);
      throw new Error(`Fallo subiendo "${archivo.name}": ${subida.error.message}`);
    }

    rutasSubidas.push(ruta);
    const urlData = window.supabaseClient.storage.from("recepciones-pdf").getPublicUrl(ruta);

    soportesGuardados.push({
      tipo: "archivo",
      nombre: archivo.name,
      url: urlData.data.publicUrl,
      ruta: ruta,
      mime: archivo.type || "",
      tamano: archivo.size
    });
  }

  return { soportesGuardados, rutasSubidas };
}

// 8. GUARDAR RECEPCIÓN
async function guardarRecepcion() {
  const btn = obtenerElemento("guardarRecepcion");
  try {
    if (typeof window.tienePermiso === "function" && !window.tienePermiso("recepcion", "crear")) {
      notificar("No cuenta con permisos para crear recepciones.");
      return;
    }

    const proveedor = obtenerValor("proveedorInput").trim();
    const material = obtenerValor("materialInput").trim();
    const tipoRecepcion = obtenerValor("tipoRecepcionInput");
    const cantidad = Number(obtenerValor("cantidadInput"));
    const revisadas = Number(obtenerValor("revisadasInput"));
    const novedades = Number(obtenerValor("novedadesInput")) || 0;
    const faltantes = Number(obtenerValor("faltantesInput")) || 0;
    const observacion = obtenerValor("observacionInput").trim();
    const estado = obtenerValor("estadoRecepcionInput");

    if (!proveedor || !material || cantidad <= 0) {
      notificar("Complete los campos obligatorios del proveedor, material y cantidad.");
      return;
    }

    const min = adjuntosCommonRecepcion?.MIN_ADJUNTOS || 1;
    if (totalSoportesRecepcion() < min) {
      notificar(`Debe adjuntar al menos ${min} soporte documental para registrar.`);
      return;
    }

    if (btn) btn.disabled = true;

    // Subir soportes
    let pdfUrl = "";
    let rutasSubidas = [];
    try {
      const carga = await subirSoportesRecepcion();
      rutasSubidas = carga.rutasSubidas;
      pdfUrl = adjuntosCommonRecepcion ? adjuntosCommonRecepcion.serializarRecepcion(carga.soportesGuardados) : JSON.stringify(carga.soportesGuardados);
    } catch (err) {
      notificar(err.message);
      return;
    }

    const pct = ((revisadas / cantidad) * 100).toFixed(1);

    const { error } = await window.supabaseClient
      .from("recepciones")
      .insert([{
        proveedor,
        material,
        tipo_recepcion: tipoRecepcion,
        cantidad,
        revisadas,
        novedades,
        faltantes,
        porcentaje_revisado: pct,
        observacion,
        comentario_validacion: "",
        seguimiento: "",
        estado,
        novedad_original: estado,
        pdf_url: pdfUrl,
        usuario_recepcion: window.usuarioLogueado?.usuario || "Usuario",
        created_at: new Date().toISOString()
      }]);

    if (error) {
      if (rutasSubidas.length) await window.supabaseClient.storage.from("recepciones-pdf").remove(rutasSubidas);
      notificar("Error guardando recepción: " + error.message, "error");
      return;
    }

    if (typeof window.crearNotificacion === "function") {
      window.crearNotificacion(`📦 Recepción creada: ${proveedor} (${material}) - ${estado}`);
    }

    limpiarFormulario();
    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    await window.actualizarDashboardRecepcion();
    notificar("Recepción registrada exitosamente", "success");

  } catch (e) {
    console.error(e);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function limpiarFormulario() {
  asignarValor("proveedorInput", "");
  asignarValor("materialInput", "");
  asignarValor("cantidadInput", "");
  asignarValor("revisadasInput", "");
  asignarValor("novedadesInput", "0");
  asignarValor("faltantesInput", "0");
  asignarValor("observacionInput", "");

  const fileInput = obtenerElemento("pdfInput");
  if (fileInput) fileInput.value = "";
  const driveInput = obtenerElemento("driveLinkRecepcion");
  if (driveInput) driveInput.value = "";

  soportesRecepcionSeleccionados = [];
  renderSoportesRecepcionTemporales();
}

// 9. RENDER DE RECEPCIONES & BUSCADOR
window.renderRecepciones = async function (datos = null) {
  const body = obtenerElemento("recepcionesBody");
  if (!body) return;

  try {
    let recepciones = datos;
    if (!recepciones) {
      const { data, error } = await window.supabaseClient
        .from("recepciones")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }
      recepciones = data || [];
      window.recepcionesCacheDatos = recepciones;
    }

    if (recepciones.length === 0) {
      body.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#64748b;">No hay recepciones registradas</td></tr>`;
      return;
    }

    const usuario = window.usuarioLogueado?.usuario?.toLowerCase() || "";
    const rol = window.usuarioLogueado?.rol?.toLowerCase() || "";
    const puedeGestionar = ["admin", "auditor", "lider", "compras"].includes(usuario) || ["admin", "auditor", "lider", "compras"].includes(rol);
    const puedeEliminar = ["admin", "auditor"].includes(usuario) || ["admin", "auditor"].includes(rol);

    window.recepcionesCacheSoportes = {};

    body.innerHTML = recepciones.map(item => {
      window.recepcionesCacheSoportes[item.id] = adjuntosCommonRecepcion ? adjuntosCommonRecepcion.deserializarRecepcion(item.pdf_url) : [];

      let estadoClass = "estado-pendiente";
      if (item.estado === "En Gestión Compras" || item.estado === "Esperando Proveedor") estadoClass = "estado-revision";
      else if (item.estado === "Solucionado" || item.estado === "Conforme") estadoClass = "estado-revisado";
      else if (item.estado === "Dañado" || item.estado === "Faltante" || item.estado === "Cerrado") estadoClass = "estado-cerrado";

      return `
        <tr>
          <td><strong>${escaparHTML(item.proveedor)}</strong></td>
          <td>${escaparHTML(item.material)}</td>
          <td>${escaparHTML(item.tipo_recepcion || "-")}</td>
          <td>${item.cantidad || 0}</td>
          <td><strong>${item.porcentaje_revisado || 0}%</strong></td>
          <td>${item.novedades || 0}</td>
          <td><span class="${estadoClass}">${escaparHTML(item.novedad_original || item.estado)}</span></td>
          <td><span class="${estadoClass}">${escaparHTML(item.estado)}</span></td>
          <td>${new Date(item.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</td>
          <td>
            <div class="acciones-tabla-mini">
              <button type="button" class="btn-mini btn-seguimiento-mini ${!puedeGestionar ? 'btn-bloqueado' : ''}" 
                title="${puedeGestionar ? 'Gestión Compras' : 'Sin permiso'}" 
                ${puedeGestionar ? `onclick="window.validarRecepcion(${item.id})"` : ''}>
                📋
              </button>
              <button type="button" class="btn-mini btn-observacion-mini" title="Ver Observación" 
                onclick="window.verObservacion(${item.id})">
                👁️
              </button>
              ${item.pdf_url ? `
                <button type="button" class="btn-mini btn-pdf-mini" title="Ver Soportes" 
                  onclick="window.verSoportesRecepcion(${item.id})">
                  📎
                </button>` : ''}
              ${puedeEliminar ? `
                <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" 
                  onclick="window.eliminarRecepcion(${item.id})">
                  🗑️
                </button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.error(err);
  }
};

// Buscador reactivo
document.addEventListener("input", function (e) {
  if (e.target && e.target.id === "buscarRecepcion") {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      window.renderRecepciones(window.recepcionesCacheDatos);
      return;
    }
    const filtrados = window.recepcionesCacheDatos.filter(i => 
      String(i.proveedor || "").toLowerCase().includes(q) ||
      String(i.material || "").toLowerCase().includes(q) ||
      String(i.estado || "").toLowerCase().includes(q)
    );
    window.renderRecepciones(filtrados);
  }
});

// ==========================================================
// MODAL GESTIÓN COMPRAS & TIMELINE (PARSER LIMPIO)
// ==========================================================
window.validarRecepcion = async function (id) {
  try {
    window.recepcionGestionando = Number(id);

    const { data: rec, error } = await window.supabaseClient
      .from("recepciones")
      .select("*")
      .eq("id", Number(id))
      .single();

    if (error || !rec) {
      notificar("No se pudo consultar el registro de recepción.");
      return;
    }

    asignarValor("gestionEstadoInput", rec.estado || "Pendiente");
    asignarValor("gestionComentarioInput", "");

    const timeline = obtenerElemento("timelineSeguimiento");
    const countBadge = obtenerElemento("timelineCountBadge");

    if (timeline) {
      const textoSeguimiento = (rec.seguimiento || "").trim();

      if (!textoSeguimiento) {
        timeline.innerHTML = `
          <div class="timeline-empty-state" style="text-align:center; padding:40px 20px; color:#94a3b8;">
            <div style="font-size:32px; margin-bottom:10px;">📋</div>
            <h5 style="color:#475569; font-size:14px; margin:0 0 4px 0;">Sin intervenciones registradas</h5>
            <p style="font-size:12px; margin:0;">Agregue un seguimiento en el formulario lateral.</p>
          </div>`;
        if (countBadge) countBadge.innerText = "0 Registros";
      } else {
        const bloques = textoSeguimiento.split("━━━━━━━━━━━━━━━━━━").reverse().filter(b => b.trim());

        if (countBadge) countBadge.innerText = `${bloques.length} ${bloques.length === 1 ? 'Registro' : 'Registros'}`;

        timeline.innerHTML = bloques.map((bloque, index) => {
          // Extraer campos de encabezado
          const matchFecha = bloque.match(/📅\s*([^\n]+)/);
          const matchUsuario = bloque.match(/👤(?:\s*Usuario:)?\s*([^\n]+)/i);
          const matchEstado = bloque.match(/🏷️(?:\s*Estado:)?\s*([^\n]+)/i);

          const fecha = matchFecha ? matchFecha[1].trim() : "Fecha no registrada";
          const usuario = matchUsuario ? matchUsuario[1].trim() : "Compras";
          const estado = matchEstado ? matchEstado[1].trim() : "Seguimiento";
          const inicial = usuario.charAt(0).toUpperCase();

          // Limpiar el comentario para que no repita usuario ni estado
          let lineas = bloque.split("\n").map(l => l.trim()).filter(Boolean);
          let lineasFiltradas = lineas.filter(l => {
            const low = l.toLowerCase();
            if (l.startsWith("📅") || l.startsWith("👤") || l.startsWith("🏷️") || l.startsWith("📝")) return false;
            if (low === usuario.toLowerCase() || low === estado.toLowerCase()) return false;
            if (low.startsWith("usuario:") || low.startsWith("estado:") || low.startsWith("comentario:")) return false;
            return true;
          });

          let comentarioFinal = lineasFiltradas.join("\n").trim() || "Sin comentario adicional.";

          // Estilo del badge según estado
          let badgeClass = "badge-status-default";
          const estadoLower = estado.toLowerCase();
          if (estadoLower.includes("pendiente")) badgeClass = "badge-status-pendiente";
          else if (estadoLower.includes("gestión") || estadoLower.includes("gestion")) badgeClass = "badge-status-gestion";
          else if (estadoLower.includes("proveedor") || estadoLower.includes("contacto")) badgeClass = "badge-status-proveedor";
          else if (estadoLower.includes("solucion")) badgeClass = "badge-status-solucionado";
          else if (estadoLower.includes("cerrad")) badgeClass = "badge-status-cerrado";

          const esUltimo = index === bloques.length - 1;

          return `
            <div class="timeline-item-wrapper">
              <div class="timeline-card-item">
                <div class="timeline-item-header">
                  <div class="timeline-user-tag">
                    <div class="user-tag-avatar">${inicial}</div>
                    <span class="timeline-user-name">${escaparHTML(usuario)}</span>
                  </div>
                  <span class="timeline-date-chip">📅 ${escaparHTML(fecha)}</span>
                </div>

                <div>
                  <span class="timeline-badge-status ${badgeClass}">● ${escaparHTML(estado)}</span>
                </div>

                <div class="timeline-comment-box">
                  ${escaparHTML(comentarioFinal).replace(/\n/g, "<br>")}
                </div>
              </div>

              ${!esUltimo ? `
                <div class="timeline-separator">
                  <div class="timeline-node-dot"></div>
                </div>
              ` : ''}
            </div>
          `;
        }).join("");
      }
    }

    window.abrirModal("modalGestion");
  } catch (err) {
    console.error("Error abriendo gestión de compras:", err);
  }
};
// Guardar Gestión Compras
async function guardarGestion() {
  const btn = obtenerElemento("guardarGestionBtn");
  try {
    const comentario = obtenerValor("gestionComentarioInput").trim();
    const estado = obtenerValor("gestionEstadoInput");

    if (!comentario) {
      notificar("Ingrese un comentario para registrar la gestión.");
      return;
    }
    if (!window.recepcionGestionando) return;

    if (btn) btn.disabled = true;

    const { data: rec } = await window.supabaseClient
      .from("recepciones")
      .select("*")
      .eq("id", window.recepcionGestionando)
      .single();

    const fecha = new Date().toLocaleString("es-CO");
    const entrada = `\n━━━━━━━━━━━━━━━━━━\n📅 ${fecha}\n👤 ${window.usuarioLogueado?.usuario || 'Compras'}\n🏷️ Estado: ${estado}\n📝 ${comentario}\n`;
    const nuevoSeguimiento = (rec.seguimiento || "") + entrada;

    await window.supabaseClient
      .from("recepciones")
      .update({
        estado: estado,
        comentario_validacion: comentario,
        seguimiento: nuevoSeguimiento
      })
      .eq("id", window.recepcionGestionando);

    window.cerrarModalGestion();
    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    await window.actualizarDashboardRecepcion();
    notificar("Gestión registrada exitosamente", "success");

  } catch (err) {
    console.error(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 11. VER OBSERVACIONES & SOPORTES MODAL
window.verObservacion = function (id) {
  const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
  const cont = obtenerElemento("contenidoObservacion");
  if (cont) cont.innerText = item?.observacion || "Sin observaciones registradas.";
  window.abrirModal("modalObservacion");
};

window.verSoportesRecepcion = function (id) {
  window.recepcionSoportesModalId = Number(id);
  const soportes = window.recepcionesCacheSoportes[id] || [];
  const cont = obtenerElemento("contenidoSoportesRecepcion");
  const badge = obtenerElemento("contadorSoportesRecepcionModal");
  const max = adjuntosCommonRecepcion?.MAX_ADJUNTOS || 10;

  if (badge) badge.textContent = `${soportes.length} / ${max}`;
  if (!cont) return;

  if (soportes.length === 0) {
    cont.innerHTML = '<div class="adjunto-vacio">No hay soportes documentales registrados.</div>';
  } else {
    cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${soportes.map((s, idx) => `
      <div class="adjunto-item">
        <span>${escaparHTML(s.nombre)}</span>
        <div style="display:flex;gap:6px;">
          <button type="button" class="adjunto-btn--abrir" onclick="window.open('${s.url}', '_blank')">Abrir</button>
          <button type="button" class="adjunto-btn--eliminar" onclick="eliminarSoporteRecepcionGuardado(${idx})">Eliminar</button>
        </div>
      </div>
    `).join("")}</div>`;
  }

  window.abrirModal("modalSoportesRecepcion");
};

// Eliminar soporte existente
window.eliminarSoporteRecepcionGuardado = async function (index) {
  const id = Number(window.recepcionSoportesModalId);
  const soportes = window.recepcionesCacheSoportes[id] || [];
  if (soportes.length <= 1) {
    notificar("La recepción debe conservar mínimo 1 soporte.");
    return;
  }

  if (!confirm("¿Desea eliminar este soporte?")) return;

  const restantes = soportes.filter((_, i) => i !== Number(index));
  const eliminado = soportes[Number(index)];

  await window.supabaseClient
    .from("recepciones")
    .update({ pdf_url: adjuntosCommonRecepcion ? adjuntosCommonRecepcion.serializarRecepcion(restantes) : JSON.stringify(restantes) })
    .eq("id", id);

  if (eliminado?.ruta) {
    await window.supabaseClient.storage.from("recepciones-pdf").remove([eliminado.ruta]);
  }

  await window.renderRecepciones();
  window.verSoportesRecepcion(id);
};

// 12. ELIMINAR RECEPCIÓN COMPLETA
window.eliminarRecepcion = async function (id) {
  if (!confirm("¿Eliminar definitivamente esta recepción y sus archivos?")) return;

  const soportes = window.recepcionesCacheSoportes[Number(id)] || [];
  const rutas = soportes.filter(s => s.ruta).map(s => s.ruta);

  await window.supabaseClient.from("recepciones").delete().eq("id", Number(id));
  if (rutas.length) await window.supabaseClient.storage.from("recepciones-pdf").remove(rutas);

  await window.renderRecepciones();
  await window.actualizarKPIsRecepcion();
  await window.actualizarDashboardRecepcion();
  notificar("Recepción eliminada correctamente", "success");
};

// 13. KPIS & DASHBOARD RESUMEN
window.actualizarKPIsRecepcion = async function () {
  try {
    const { data: recs } = await window.supabaseClient.from("recepciones").select("*");
    const lista = recs || [];
    
    if (obtenerElemento("kpiRecepciones")) obtenerElemento("kpiRecepciones").innerText = lista.length;

    if (lista.length > 0) {
      const ult = lista[0];
      if (obtenerElemento("kpiRevisado")) obtenerElemento("kpiRevisado").innerText = `${ult.porcentaje_revisado || 0}%`;
      if (obtenerElemento("kpiNovedades")) obtenerElemento("kpiNovedades").innerText = ult.novedades || 0;
      if (obtenerElemento("kpiFaltantes")) obtenerElemento("kpiFaltantes").innerText = ult.faltantes || 0;
    }
  } catch (e) {
    console.error(e);
  }
};

window.actualizarDashboardRecepcion = async function () {
  const body = obtenerElemento("dashboardRecepcionBody");
  if (!body) return;

  try {
    const { data: recs } = await window.supabaseClient.from("recepciones").select("*");
    const meses = {};

    (recs || []).forEach(item => {
      const mes = new Date(item.created_at).toLocaleString("es-CO", { month: "long" });
      if (!meses[mes]) meses[mes] = { recs: 0, falt: 0, sobr: 0, dan: 0, tot: 0 };

      meses[mes].recs++;
      const nov = String(item.novedad_original || item.estado || "").toLowerCase();
      if (nov.includes("faltante")) meses[mes].falt++;
      if (nov.includes("sobrante")) meses[mes].sobr++;
      if (nov.includes("dañ") || nov.includes("dan")) meses[mes].dan++;
      if (nov.includes("falt") || nov.includes("sobr") || nov.includes("dañ") || nov.includes("dan")) meses[mes].tot++;
    });

    body.innerHTML = Object.keys(meses).map(m => `
      <tr>
        <td><strong>${m.toUpperCase()}</strong></td>
        <td>${meses[m].recs}</td>
        <td>${meses[m].falt}</td>
        <td>${meses[m].sobr}</td>
        <td>${meses[m].dan}</td>
        <td><strong>${meses[m].tot}</strong></td>
      </tr>
    `).join("");
  } catch (e) {
    console.error(e);
  }
};

// 14. DELEGACIÓN GLOBAL DE EVENTOS & ATAJOS
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    window.cerrarModalGestion();
    window.cerrarModalObservacion();
    window.cerrarModalSoportesRecepcion();
  }

  // Salto de input con Enter
  if (e.key === "Enter" && !["TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
    if (e.target.id === "driveLinkRecepcion") {
      e.preventDefault();
      agregarDriveRecepcion();
      return;
    }
    const form = e.target.closest("#formRecepcionFast");
    if (form) {
      e.preventDefault();
      const focusables = Array.from(form.querySelectorAll("input, select, textarea"));
      const idx = focusables.indexOf(e.target);
      if (idx > -1 && idx + 1 < focusables.length) focusables[idx + 1].focus();
    }
  }
});

document.addEventListener("input", function (e) {
  if (e.target && (e.target.id === "cantidadInput" || e.target.id === "revisadasInput")) {
    calcularPorcentajeEnVivo();
  }
});

document.addEventListener("click", function (e) {
  // Cierre por backdrop
  if (e.target.classList.contains("modal-documentos")) {
    e.target.classList.remove("active");
    e.target.style.display = "none";
  }

  // Trigger file creación
  if (e.target.closest("#btnAgregarSoportesRecepcion")) {
    e.preventDefault();
    const fi = obtenerElemento("pdfInput");
    if (fi) {
      fi.onchange = (ev) => {
        agregarArchivosRecepcion(ev.target.files);
        ev.target.value = "";
      };
      fi.click();
    }
  }

  // Trigger Drive creación
  if (e.target.closest("#btnAgregarDriveRecepcion")) {
    e.preventDefault();
    agregarDriveRecepcion();
  }

  // Trigger file modal
  if (e.target.closest("#btnAgregarArchivosRecepcionModal")) {
    e.preventDefault();
    const fi = obtenerElemento("actualizarSoportesRecepcionInput");
    if (fi) {
      fi.onchange = async (ev) => {
        const nuevos = [];
        agregarArchivosRecepcion(ev.target.files);
        ev.target.value = "";
      };
      fi.click();
    }
  }

  // Guardar recepción
  if (e.target.closest("#guardarRecepcion")) {
    e.preventDefault();
    guardarRecepcion();
  }

  // Guardar gestión compras
  if (e.target.closest("#guardarGestionBtn")) {
    e.preventDefault();
    guardarGestion();
  }

  // Dashboard externo
  if (e.target.closest("#descargarDashboardRecepcion")) {
    e.preventDefault();
    window.open("modules/dashboard-recepcion.html", "_blank");
  }
});

// 15. AUTO-REFRESH & INICIALIZADOR
window.iniciarRefreshRecepcion = function () {
  if (window.refreshRecepcionInterval) clearInterval(window.refreshRecepcionInterval);
  window.refreshRecepcionInterval = setInterval(async () => {
    if (obtenerElemento("recepcionesBody")) {
      await window.actualizarKPIsRecepcion();
      await window.actualizarDashboardRecepcion();
    }
  }, 6000);
};

(async function init() {
  renderSoportesRecepcionTemporales();
  await window.renderRecepciones();
  await window.actualizarKPIsRecepcion();
  await window.actualizarDashboardRecepcion();
  window.iniciarRefreshRecepcion();
})();
