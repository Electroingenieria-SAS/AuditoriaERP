/**
 * ====================================================================
 * AUDITORIAS.JS — Módulo Integral de Auditorías Periciales (SPA)
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  if (window.refreshAuditoriasInterval) {
    clearInterval(window.refreshAuditoriasInterval);
  }

  const AUDITORIAS_BUCKET = window.ERP_CONFIG?.STORAGE_BUCKETS?.AUDITORIAS || 'auditorias';
  const ADJUNTOS = window.AdjuntosCommon;

  let auditoriasCache = [];
  let documentosSeleccionados = [];
  let documentosEdicionSeleccionados = [];
  let auditoriaDocumentosModalId = null;
  window.documentosAuditoriaModalCache = {};

  function $(id) {
    return document.getElementById(id);
  }

  function getVal(id) {
    const el = $(id);
    return el ? el.value : '';
  }

  function setVal(id, valor) {
    const el = $(id);
    if (el) el.value = valor ?? '';
  }

  function sanitize(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function notificar(mensaje, tipo = 'warning', titulo = 'Auditorías') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(titulo, mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  function formatearFecha(fecha) {
    if (!fecha) return '-';
    const [y, m, d] = String(fecha).split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return new Date(fecha).toLocaleDateString('es-CO');
  }

  function obtenerFechaHoy() {
    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 1. Modales
  window.abrirModal = function (id) {
    const modal = $(id);
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  };

  window.cerrarModal = function (id) {
    const modal = $(id);
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  };

  // 2. Renderizado de Soportes en Creación
  function totalDocumentos() {
    return documentosSeleccionados.length;
  }

  function agregarDocumentosCreacion(archivos) {
    const max = ADJUNTOS?.MAX_ADJUNTOS || 10;
    for (const archivo of Array.from(archivos || [])) {
      if (totalDocumentos() >= max) {
        notificar(`Límite de documentos: Máximo ${max}.`);
        break;
      }

      if (ADJUNTOS) {
        const v = ADJUNTOS.validarArchivo(archivo);
        if (!v.valido) {
          notificar(v.mensaje);
          continue;
        }
      }

      const dup = documentosSeleccionados.some(d =>
        d.tipo === 'archivo' && d.archivo && d.archivo.name === archivo.name && d.archivo.size === archivo.size
      );

      if (!dup) {
        documentosSeleccionados.push({
          tipo: 'archivo',
          archivo: archivo,
          nombre: archivo.name,
          mime: archivo.type || '',
          tamano: archivo.size
        });
      }
    }
    renderDocumentosCreacion();
  }

  function agregarDriveCreacion() {
    const input = $('driveLinkAuditoria');
    if (!input) return;

    const max = ADJUNTOS?.MAX_ADJUNTOS || 10;
    if (totalDocumentos() >= max) {
      notificar(`Límite alcanzado: Máximo ${max} documentos.`);
      return;
    }

    const url = ADJUNTOS ? ADJUNTOS.normalizarDriveUrl(input.value) : input.value.trim();
    if (!url || !url.startsWith('https://')) {
      notificar('Pegue un enlace válido de Google Drive/Docs.');
      return;
    }

    if (documentosSeleccionados.some(d => d.url === url)) {
      notificar('El enlace ya está agregado.');
      return;
    }

    documentosSeleccionados.push({
      tipo: 'drive',
      nombre: ADJUNTOS ? ADJUNTOS.nombreEnlaceDrive(url, totalDocumentos() + 1) : `Enlace Drive #${totalDocumentos() + 1}`,
      url: url,
      mime: 'text/uri-list',
      tamano: 0
    });

    input.value = '';
    renderDocumentosCreacion();
  }

  function renderDocumentosCreacion() {
    const lista = $('listaDocumentos');
    const contador = $('contadorDocumentosAuditoria');
    const max = ADJUNTOS?.MAX_ADJUNTOS || 10;

    if (contador) contador.textContent = `${totalDocumentos()} / ${max}`;
    if (!lista) return;

    if (documentosSeleccionados.length === 0) {
      lista.innerHTML = '<div class="documento-vacio">📄 Ningún documento agregado.</div>';
      return;
    }

    lista.innerHTML = documentosSeleccionados.map((doc, idx) => {
      const visual = ADJUNTOS ? ADJUNTOS.tipoVisual(doc) : { icono: '📄', etiqueta: 'Archivo' };
      const meta = doc.tipo === 'drive' ? visual.etiqueta : `${visual.etiqueta} · ${ADJUNTOS ? ADJUNTOS.formatearTamano(doc.tamano) : (doc.tamano + ' B')}`;

      return `
        <div class="adjunto-item">
          <div class="adjunto-item__info">
            <span class="adjunto-item__icono">${visual.icono}</span>
            <div class="adjunto-item__texto">
              <span class="adjunto-item__nombre">${sanitize(doc.nombre)}</span>
              <span class="adjunto-item__meta">${sanitize(meta)}</span>
            </div>
          </div>
          <div class="adjunto-item__acciones">
            <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarDocumentoTemporal(${idx})">Quitar</button>
          </div>
        </div>`;
    }).join('');
  }

  window.eliminarDocumentoTemporal = function (idx) {
    documentosSeleccionados.splice(Number(idx), 1);
    renderDocumentosCreacion();
  };

  // 3. Subir Documentos a Supabase Storage
  async function subirDocumentos(lista = documentosSeleccionados) {
    const guardados = [];
    const subidas = [];

    for (const doc of lista) {
      if (doc.tipo === 'drive') {
        guardados.push({
          tipo: 'drive',
          nombre: doc.nombre,
          url: doc.url,
          ruta: '',
          mime: 'text/uri-list',
          tamano: 0
        });
        continue;
      }

      const archivo = doc.archivo;
      if (!archivo) {
        if (doc.url) guardados.push(doc);
        continue;
      }

      const limpio = String(archivo.name || 'documento')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const idUnico = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const ruta = `auditorias/${idUnico}_${limpio}`;

      const res = await window.supabaseClient.storage
        .from(AUDITORIAS_BUCKET)
        .upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });

      if (res.error) {
        if (subidas.length) await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove(subidas);
        throw new Error(`Error al subir ${archivo.name}: ${res.error.message}`);
      }

      subidas.push(ruta);
      const urlData = window.supabaseClient.storage.from(AUDITORIAS_BUCKET).getPublicUrl(ruta);

      guardados.push({
        tipo: 'archivo',
        nombre: archivo.name,
        url: urlData.data.publicUrl,
        ruta: ruta,
        mime: archivo.type || '',
        tamano: archivo.size
      });
    }

    return { guardados, subidas };
  }

  // 4. Guardar Nueva Auditoría
  async function guardarAuditoria() {
    const btn = $('guardarAuditoria');
    try {
      if (typeof window.tienePermiso === 'function' && !window.tienePermiso('auditorias', 'crear')) {
        notificar('No cuenta con permisos para registrar auditorías.');
        return;
      }

      const tipo = getVal('tipoInput');
      const responsable = getVal('responsableInput').trim();
      const nombre = getVal('nombreInput').trim();
      const fecha = getVal('fechaInput') || obtenerFechaHoy();
      const proceso = getVal('procesoInput').trim();
      const estado = getVal('estadoInput') || 'Pendiente';
      const observaciones = getVal('observacionesInput').trim();

      if (!tipo || !responsable || !nombre || !proceso) {
        notificar('Complete los campos obligatorios: Tipo, Responsable, Nombre y Proceso.');
        return;
      }

      if (btn) btn.disabled = true;

      let pdfUrl = '';
      let subidasRutas = [];
      try {
        const carga = await subirDocumentos();
        subidasRutas = carga.subidas;
        pdfUrl = JSON.stringify(carga.guardados);
      } catch (err) {
        notificar(err.message, 'error');
        if (btn) btn.disabled = false;
        return;
      }

      const usuario = window.usuarioLogueado?.usuario || 'Sistema';

      const { data, error } = await window.supabaseClient
        .from('auditorias')
        .insert([{
          tipo,
          nombre,
          responsable,
          fecha,
          proceso,
          estado,
          observaciones,
          pdf_url: pdfUrl,
          usuario,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        if (subidasRutas.length) await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove(subidasRutas);
        notificar('Error al guardar auditoría: ' + error.message, 'error');
        return;
      }

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('CREAR', 'AUDITORIAS', `Auditoría creada: ${nombre} (${tipo}) por ${responsable}`);
      }

      if (typeof window.crearNotificacion === 'function') {
        window.crearNotificacion(`📋 Auditoría registrada: ${nombre} (${tipo}) - Responsable: ${responsable}`, 'success');
      }

      limpiarFormulario();
      await window.renderAuditorias();
      notificar('Auditoría registrada exitosamente.', 'success');

    } catch (e) {
      console.error(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function limpiarFormulario() {
    setVal('tipoInput', '');
    setVal('responsableInput', '');
    setVal('nombreInput', '');
    setVal('fechaInput', obtenerFechaHoy());
    setVal('procesoInput', '');
    setVal('estadoInput', 'Pendiente');
    setVal('observacionesInput', '');

    const fileInput = $('documentoInput');
    if (fileInput) fileInput.value = '';
    const driveInput = $('driveLinkAuditoria');
    if (driveInput) driveInput.value = '';

    documentosSeleccionados = [];
    renderDocumentosCreacion();
  }

  // 5. Renderizado de Auditorías en Tabla
  window.renderAuditorias = async function (datos = null) {
    const body = $('auditoriasBody');
    if (!body) return;

    try {
      let auditorias = datos;
      if (!auditorias) {
        const { data, error } = await window.supabaseClient
          .from('auditorias')
          .select('*')
          .order('id', { ascending: false });

        if (error) {
          console.error(error);
          return;
        }
        auditorias = data || [];
        auditoriasCache = auditorias;
      }

      if (auditorias.length === 0) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#64748b;">No existen auditorías registradas</td></tr>`;
        return;
      }

      const rol = (window.usuarioLogueado?.rol || '').toLowerCase();
      const puedeEditar = ['admin', 'auditor', 'lider'].includes(rol);
      const puedeEliminar = ['admin', 'auditor'].includes(rol);

      window.documentosAuditoriaModalCache = {};

      body.innerHTML = auditorias.map(item => {
        let docs = [];
        try {
          docs = JSON.parse(item.pdf_url || '[]');
        } catch (_) {
          docs = [];
        }
        window.documentosAuditoriaModalCache[item.id] = docs;

        let estadoClass = 'estado-pendiente';
        if (item.estado === 'En proceso') estadoClass = 'estado-revision';
        else if (item.estado === 'Finalizada') estadoClass = 'estado-revisado';
        else if (item.estado === 'Cancelada') estadoClass = 'estado-cerrado';

        return `
          <tr>
            <td><strong>${sanitize(item.tipo)}</strong></td>
            <td>${sanitize(item.nombre)}</td>
            <td>${sanitize(item.responsable)}</td>
            <td><span class="${estadoClass}">${sanitize(item.estado)}</span></td>
            <td>${formatearFecha(item.fecha)}</td>
            <td>
              <div class="acciones-tabla-mini">
                <button type="button" class="btn-mini btn-observacion-mini" title="Ver Detalle" 
                  onclick="window.verDetalleAuditoria(${item.id})">
                  👁️
                </button>
                <button type="button" class="btn-mini btn-pdf-mini" title="Documentos Adjuntos" 
                  onclick="window.verDocumentos(${item.id})">
                  📎
                </button>
                ${puedeEditar ? `
                  <button type="button" class="btn-mini btn-seguimiento-mini" title="Editar Auditoría" 
                    onclick="window.abrirEditarAuditoria(${item.id})">
                    ✏️
                  </button>` : ''}
                ${puedeEliminar ? `
                  <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" 
                    onclick="window.eliminarAuditoria(${item.id})">
                    🗑️
                  </button>` : ''}
              </div>
            </td>
          </tr>`;
      }).join('');

    } catch (err) {
      console.error(err);
    }
  };

  // 6. Detalle de Auditoría
  window.verDetalleAuditoria = function (id) {
    const item = auditoriasCache.find(a => a.id === Number(id));
    if (!item) return;

    const setT = (elemId, val) => { const el = $(elemId); if (el) el.textContent = val || '-'; };
    setT('detalleTipo', item.tipo);
    setT('detalleEstado', item.estado);
    setT('detalleNombre', item.nombre);
    setT('detalleResponsable', item.responsable);
    setT('detalleProceso', item.proceso);
    setT('detalleFecha', formatearFecha(item.fecha));

    const obsEl = $('detalleObservaciones');
    if (obsEl) obsEl.textContent = item.observaciones || 'Sin observaciones registradas.';

    window.abrirModal('modalDetalleAuditoria');
  };

  // 7. Modal Documentos
  window.verDocumentos = function (id) {
    auditoriaDocumentosModalId = Number(id);
    const docs = window.documentosAuditoriaModalCache[id] || [];
    const lista = $('listaDocumentosModal');
    const badge = $('contadorDocumentosModal');
    const max = ADJUNTOS?.MAX_ADJUNTOS || 10;

    if (badge) badge.textContent = `${docs.length} / ${max}`;
    if (!lista) return;

    if (docs.length === 0) {
      lista.innerHTML = '<div class="documento-vacio">No hay documentos registrados para esta auditoría.</div>';
    } else {
      lista.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;padding:0 30px;">${docs.map((doc, idx) => `
        <div class="adjunto-item">
          <span>${sanitize(doc.nombre)}</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="adjunto-btn--abrir" onclick="window.open('${doc.url}', '_blank')">Abrir</button>
            <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarDocumentoAuditoria(${idx})">Eliminar</button>
          </div>
        </div>
      `).join('')}</div>`;
    }

    window.abrirModal('modalDocumentos');
  };

  window.eliminarDocumentoAuditoria = async function (index) {
    const id = auditoriaDocumentosModalId;
    const docs = window.documentosAuditoriaModalCache[id] || [];

    if (!confirm('¿Desea eliminar este documento adjunto?')) return;

    const restantes = docs.filter((_, i) => i !== Number(index));
    const eliminado = docs[Number(index)];

    await window.supabaseClient
      .from('auditorias')
      .update({ pdf_url: JSON.stringify(restantes) })
      .eq('id', id);

    if (eliminado?.ruta) {
      await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove([eliminado.ruta]);
    }

    await window.renderAuditorias();
    window.verDocumentos(id);
  };

  // 8. Edición de Auditoría
  window.abrirEditarAuditoria = function (id) {
    const item = auditoriasCache.find(a => a.id === Number(id));
    if (!item) return;

    setVal('editarAuditoriaId', item.id);
    setVal('editarTipo', item.tipo);
    setVal('editarResponsable', item.responsable);
    setVal('editarNombre', item.nombre);
    setVal('editarFecha', item.fecha);
    setVal('editarProceso', item.proceso);
    setVal('editarEstado', item.estado);
    setVal('editarObservaciones', item.observaciones || '');

    documentosEdicionSeleccionados = [];
    renderDocumentosEdicion();

    window.abrirModal('modalEditarAuditoria');
  };

  function renderDocumentosEdicion() {
    const lista = $('listaDocumentosEdicion');
    const badge = $('contadorDocumentosEdicion');
    if (badge) badge.textContent = `${documentosEdicionSeleccionados.length} nuevos`;
    if (!lista) return;

    if (documentosEdicionSeleccionados.length === 0) {
      lista.innerHTML = '<div class="adjunto-vacio">No hay soportes nuevos seleccionados.</div>';
      return;
    }

    lista.innerHTML = documentosEdicionSeleccionados.map((doc, idx) => `
      <div class="adjunto-item">
        <span>${sanitize(doc.nombre)}</span>
        <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarDocumentoEdicionTemporal(${idx})">Quitar</button>
      </div>
    `).join('');
  }

  window.eliminarDocumentoEdicionTemporal = function (idx) {
    documentosEdicionSeleccionados.splice(Number(idx), 1);
    renderDocumentosEdicion();
  };

  async function guardarEdicion() {
    const btn = $('guardarEdicionAuditoria');
    try {
      const id = Number(getVal('editarAuditoriaId'));
      if (!id) return;

      const item = auditoriasCache.find(a => a.id === id);
      let docsExistentes = [];
      try { docsExistentes = JSON.parse(item?.pdf_url || '[]'); } catch (_) { docsExistentes = []; }

      if (btn) btn.disabled = true;

      // Subir nuevos adjuntos si se seleccionaron
      if (documentosEdicionSeleccionados.length > 0) {
        const carga = await subirDocumentos(documentosEdicionSeleccionados);
        docsExistentes = docsExistentes.concat(carga.guardados);
      }

      const tipo = getVal('editarTipo');
      const responsable = getVal('editarResponsable').trim();
      const nombre = getVal('editarNombre').trim();
      const fecha = getVal('editarFecha');
      const proceso = getVal('editarProceso').trim();
      const estado = getVal('editarEstado');
      const observaciones = getVal('editarObservaciones').trim();

      const { error } = await window.supabaseClient
        .from('auditorias')
        .update({
          tipo,
          responsable,
          nombre,
          fecha,
          proceso,
          estado,
          observaciones,
          pdf_url: JSON.stringify(docsExistentes)
        })
        .eq('id', id);

      if (error) {
        notificar('Error al actualizar auditoría: ' + error.message, 'error');
        return;
      }

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('EDITAR', 'AUDITORIAS', `Auditoría #${id} modificada: ${nombre} (${estado})`);
      }

      window.cerrarModal('modalEditarAuditoria');
      await window.renderAuditorias();
      notificar('Auditoría actualizada correctamente.', 'success');

    } catch (e) {
      console.error(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // 9. Eliminar Auditoría
  window.eliminarAuditoria = async function (id) {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('auditorias', 'eliminar')) {
      notificar('Acceso denegado: No cuenta con permisos para eliminar auditorías.');
      return;
    }

    if (!confirm('¿Desea eliminar definitivamente esta auditoría y sus documentos?')) return;

    const docs = window.documentosAuditoriaModalCache[Number(id)] || [];
    const rutas = docs.filter(d => d.ruta).map(d => d.ruta);

    await window.supabaseClient.from('auditorias').delete().eq('id', Number(id));
    if (rutas.length) {
      await window.supabaseClient.storage.from(AUDITORIAS_BUCKET).remove(rutas);
    }

    if (typeof window.guardarHistorial === 'function') {
      await window.guardarHistorial('ELIMINAR', 'AUDITORIAS', `Se eliminó la auditoría #${id}`);
    }

    await window.renderAuditorias();
    notificar('Auditoría eliminada del sistema.', 'success');
  };

  // 10. Listeners y Atajos
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      window.cerrarModal('modalDetalleAuditoria');
      window.cerrarModal('modalDocumentos');
      window.cerrarModal('modalEditarAuditoria');
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'buscarAuditoria') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        window.renderAuditorias(auditoriasCache);
        return;
      }
      const filtrados = auditoriasCache.filter(a =>
        String(a.nombre || '').toLowerCase().includes(q) ||
        String(a.responsable || '').toLowerCase().includes(q) ||
        String(a.proceso || '').toLowerCase().includes(q) ||
        String(a.tipo || '').toLowerCase().includes(q) ||
        String(a.estado || '').toLowerCase().includes(q)
      );
      window.renderAuditorias(filtrados);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('#cerrarDetalleAuditoria')) window.cerrarModal('modalDetalleAuditoria');
    if (e.target.closest('#cerrarModalDocumentos')) window.cerrarModal('modalDocumentos');
    if (e.target.closest('#cerrarEditarAuditoria')) window.cerrarModal('modalEditarAuditoria');

    if (e.target.closest('#btnAgregarDocumento')) {
      e.preventDefault();
      const fi = $('documentoInput');
      if (fi) {
        fi.onchange = ev => {
          agregarDocumentosCreacion(ev.target.files);
          ev.target.value = '';
        };
        fi.click();
      }
    }

    if (e.target.closest('#btnAgregarDriveAuditoria')) {
      e.preventDefault();
      agregarDriveCreacion();
    }

    if (e.target.closest('#guardarAuditoria')) {
      e.preventDefault();
      guardarAuditoria();
    }

    if (e.target.closest('#guardarEdicionAuditoria')) {
      e.preventDefault();
      guardarEdicion();
    }
  });

  // Inicialización
  setVal('fechaInput', obtenerFechaHoy());
  renderDocumentosCreacion();
  window.renderAuditorias();
})();
