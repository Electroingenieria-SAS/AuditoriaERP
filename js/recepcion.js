/**
 * ====================================================================
 * RECEPCION.JS — Módulo de Recepción Logística & Gestión de Compras
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  // 1. Limpieza de intervalos previos
  if (window.refreshRecepcionInterval) {
    clearInterval(window.refreshRecepcionInterval);
  }

  // 2. Estado Interno
  const adjuntosCommon = window.AdjuntosCommon;
  let soportesSeleccionados = [];
  window.recepcionesCacheSoportes = {};
  window.recepcionesCacheDatos = [];
  window.recepcionGestionando = null;
  window.recepcionSoportesModalId = null;

  // 3. Utilidades
  function $(id) {
    return document.getElementById(id);
  }

  function getVal(id) {
    const el = $(id);
    return el ? el.value : '';
  }

  function setVal(id, val) {
    const el = $(id);
    if (el) el.value = val ?? '';
  }

  function sanitize(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function notificar(mensaje, tipo = 'warning') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion('Recepción', mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  // 4. Modales
  window.abrirModal = function (id) {
    const m = $(id);
    if (m) {
      m.classList.add('active');
      m.style.display = 'flex';
    }
  };

  window.cerrarModal = function (id) {
    const m = $(id);
    if (m) {
      m.classList.remove('active');
      m.style.display = 'none';
    }
  };

  window.cerrarModalGestion = () => window.cerrarModal('modalGestion');
  window.cerrarModalObservacion = () => window.cerrarModal('modalObservacion');
  window.cerrarModalSoportesRecepcion = () => window.cerrarModal('modalSoportesRecepcion');

  // 5. Cálculo Dinámico de % Revisado
  function calcularPorcentajeEnVivo() {
    const cant = Number(getVal('cantidadInput')) || 0;
    const rev = Number(getVal('revisadasInput')) || 0;
    if (cant > 0 && rev >= 0) {
      const pct = Math.min((rev / cant) * 100, 100).toFixed(1);
      const kpi = $('kpiRevisado');
      if (kpi) kpi.innerText = `${pct}%`;
    }
  }

  // 6. Gestión de Soportes en Creación
  function totalSoportes() {
    return soportesSeleccionados.length;
  }

  function agregarArchivos(archivos) {
    const max = adjuntosCommon?.MAX_ADJUNTOS || 10;

    for (const archivo of Array.from(archivos || [])) {
      if (totalSoportes() >= max) {
        notificar(`Límite alcanzado: Máximo ${max} soportes.`);
        break;
      }

      if (adjuntosCommon) {
        const v = adjuntosCommon.validarArchivo(archivo);
        if (!v.valido) {
          notificar(v.mensaje);
          continue;
        }
      }

      const dup = soportesSeleccionados.some(i =>
        i.tipo === 'archivo' && i.archivo && i.archivo.name === archivo.name && i.archivo.size === archivo.size
      );

      if (!dup) {
        soportesSeleccionados.push({
          tipo: 'archivo',
          archivo: archivo,
          nombre: archivo.name,
          mime: archivo.type || '',
          tamano: archivo.size
        });
      }
    }
    renderSoportesTemporales();
  }

  function agregarDrive() {
    const input = $('driveLinkRecepcion');
    if (!input) return;

    const max = adjuntosCommon?.MAX_ADJUNTOS || 10;
    if (totalSoportes() >= max) {
      notificar(`Límite alcanzado: Máximo ${max} soportes.`);
      return;
    }

    const url = adjuntosCommon ? adjuntosCommon.normalizarDriveUrl(input.value) : input.value.trim();
    if (!url || !url.startsWith('https://')) {
      notificar('Ingrese un enlace válido de Google Drive / Docs.');
      return;
    }

    if (soportesSeleccionados.some(i => i.url === url)) {
      notificar('El enlace de Drive ya fue agregado.');
      return;
    }

    soportesSeleccionados.push({
      tipo: 'drive',
      nombre: adjuntosCommon ? adjuntosCommon.nombreEnlaceDrive(url, totalSoportes() + 1) : `Enlace Drive #${totalSoportes() + 1}`,
      url: url,
      mime: 'text/uri-list',
      tamano: 0
    });

    input.value = '';
    renderSoportesTemporales();
  }

  function renderSoportesTemporales() {
    const lista = $('listaSoportesRecepcion');
    const contador = $('contadorSoportesRecepcion');
    const max = adjuntosCommon?.MAX_ADJUNTOS || 10;

    if (contador) contador.textContent = `${totalSoportes()} / ${max}`;
    if (!lista) return;

    if (soportesSeleccionados.length === 0) {
      lista.innerHTML = '<div class="adjunto-vacio">Aún no se han agregado soportes documentales.</div>';
      return;
    }

    lista.innerHTML = soportesSeleccionados.map((soporte, idx) => {
      const visual = adjuntosCommon ? adjuntosCommon.tipoVisual(soporte) : { icono: '📄', etiqueta: 'Archivo' };
      const meta = soporte.tipo === 'drive' ? visual.etiqueta : `${visual.etiqueta} · ${adjuntosCommon ? adjuntosCommon.formatearTamano(soporte.tamano) : (soporte.tamano + ' B')}`;

      return `
        <div class="adjunto-item">
          <div class="adjunto-item__info">
            <span class="adjunto-item__icono">${visual.icono}</span>
            <div class="adjunto-item__texto">
              <span class="adjunto-item__nombre">${sanitize(soporte.nombre)}</span>
              <span class="adjunto-item__meta">${sanitize(meta)}</span>
            </div>
          </div>
          <div class="adjunto-item__acciones">
            <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarSoporteRecepcionTemporal(${idx})">Quitar</button>
          </div>
        </div>`;
    }).join('');
  }

  window.eliminarSoporteRecepcionTemporal = function (index) {
    soportesSeleccionados.splice(Number(index), 1);
    renderSoportesTemporales();
  };

  // 7. Subida de Archivos a Supabase Storage
  async function subirSoportes(listaSoportes = soportesSeleccionados) {
    const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';
    const soportesGuardados = [];
    const rutasSubidas = [];

    for (const soporte of listaSoportes) {
      if (soporte.tipo === 'drive') {
        soportesGuardados.push({
          tipo: 'drive',
          nombre: soporte.nombre,
          url: soporte.url,
          ruta: '',
          mime: 'text/uri-list',
          tamano: 0
        });
        continue;
      }

      const archivo = soporte.archivo;
      if (!archivo) {
        if (soporte.url) soportesGuardados.push(soporte);
        continue;
      }

      const limpio = String(archivo.name || 'soporte')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const idUnico = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const ruta = `recepciones/${idUnico}_${limpio}`;

      const subida = await window.supabaseClient.storage
        .from(bucket)
        .upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });

      if (subida.error) {
        if (rutasSubidas.length) await window.supabaseClient.storage.from(bucket).remove(rutasSubidas);
        throw new Error(`Error subiendo archivo "${archivo.name}": ${subida.error.message}`);
      }

      rutasSubidas.push(ruta);
      const urlData = window.supabaseClient.storage.from(bucket).getPublicUrl(ruta);

      soportesGuardados.push({
        tipo: 'archivo',
        nombre: archivo.name,
        url: urlData.data.publicUrl,
        ruta: ruta,
        mime: archivo.type || '',
        tamano: archivo.size
      });
    }

    return { soportesGuardados, rutasSubidas };
  }

  // 8. Guardar Nueva Recepción
  async function guardarRecepcion() {
    const btn = $('guardarRecepcion');
    try {
      if (typeof window.tienePermiso === 'function' && !window.tienePermiso('recepcion', 'crear')) {
        notificar('Acceso denegado: No cuenta con permisos para crear recepciones.');
        return;
      }

      const proveedor = getVal('proveedorInput').trim();
      const material = getVal('materialInput').trim();
      const tipoRecepcion = getVal('tipoRecepcionInput');
      const cantidad = Number(getVal('cantidadInput'));
      const revisadas = Number(getVal('revisadasInput'));
      const novedades = Number(getVal('novedadesInput')) || 0;
      const faltantes = Number(getVal('faltantesInput')) || 0;
      const observacion = getVal('observacionInput').trim();
      const estado = getVal('estadoRecepcionInput');

      if (!proveedor || !material || cantidad <= 0) {
        notificar('Complete los campos obligatorios: Proveedor, Material y Cantidad Total.');
        return;
      }

      const min = adjuntosCommon?.MIN_ADJUNTOS || 1;
      if (totalSoportes() < min) {
        notificar(`Debe adjuntar al menos ${min} soporte documental para registrar la recepción.`);
        return;
      }

      if (btn) btn.disabled = true;

      // Subir soportes a Storage
      let pdfUrl = '';
      let rutasSubidas = [];
      try {
        const carga = await subirSoportes();
        rutasSubidas = carga.rutasSubidas;
        pdfUrl = adjuntosCommon ? adjuntosCommon.serializarRecepcion(carga.soportesGuardados) : JSON.stringify(carga.soportesGuardados);
      } catch (err) {
        notificar(err.message, 'error');
        if (btn) btn.disabled = false;
        return;
      }

      const pct = Math.min((revisadas / cantidad) * 100, 100).toFixed(1);
      const usuario = window.usuarioLogueado?.usuario || 'Usuario';

      const { error } = await window.supabaseClient
        .from('recepciones')
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
          comentario_validacion: '',
          seguimiento: '',
          estado,
          novedad_original: estado,
          pdf_url: pdfUrl,
          usuario_recepcion: usuario,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';
        if (rutasSubidas.length) await window.supabaseClient.storage.from(bucket).remove(rutasSubidas);
        notificar('Error guardando en base de datos: ' + error.message, 'error');
        return;
      }

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('CREAR', 'RECEPCIONES', `Recepción creada: ${proveedor} - ${material} (${estado})`);
      }

      if (typeof window.crearNotificacion === 'function') {
        window.crearNotificacion(`📦 Recepción registrada: ${proveedor} (${material}) - Estado: ${estado}`, 'success');
      }

      limpiarFormulario();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();
      await window.actualizarDashboardRecepcion();
      notificar('Recepción registrada exitosamente', 'success');

    } catch (e) {
      console.error(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function limpiarFormulario() {
    setVal('proveedorInput', '');
    setVal('materialInput', '');
    setVal('cantidadInput', '');
    setVal('revisadasInput', '');
    setVal('novedadesInput', '0');
    setVal('faltantesInput', '0');
    setVal('observacionInput', '');

    const fileInput = $('pdfInput');
    if (fileInput) fileInput.value = '';
    const driveInput = $('driveLinkRecepcion');
    if (driveInput) driveInput.value = '';

    soportesSeleccionados = [];
    renderSoportesTemporales();
  }

  // 9. Renderizado de Tabla de Recepciones & Buscador
  window.renderRecepciones = async function (datos = null) {
    const body = $('recepcionesBody');
    if (!body) return;

    try {
      let recepciones = datos;
      if (!recepciones) {
        const { data, error } = await window.supabaseClient
          .from('recepciones')
          .select('*')
          .order('id', { ascending: false });

        if (error) {
          console.error('Error renderRecepciones:', error.message);
          return;
        }
        recepciones = data || [];
        window.recepcionesCacheDatos = recepciones;
      }

      if (recepciones.length === 0) {
        body.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#64748b;">No hay recepciones registradas</td></tr>`;
        return;
      }

      const rol = (window.usuarioLogueado?.rol || '').toLowerCase();
      const puedeGestionar = ['admin', 'auditor', 'lider', 'compras'].includes(rol);
      const puedeEliminar = ['admin', 'auditor'].includes(rol);

      window.recepcionesCacheSoportes = {};

      body.innerHTML = recepciones.map(item => {
        window.recepcionesCacheSoportes[item.id] = adjuntosCommon ? adjuntosCommon.deserializarRecepcion(item.pdf_url) : [];

        let estadoClass = 'estado-pendiente';
        const est = String(item.estado || '').toLowerCase();
        if (est.includes('gestión') || est.includes('gestion') || est.includes('proveedor') || est.includes('esperando')) {
          estadoClass = 'estado-revision';
        } else if (est.includes('solucionado') || est.includes('conforme')) {
          estadoClass = 'estado-revisado';
        } else if (est.includes('dañ') || est.includes('falt') || est.includes('cerrad')) {
          estadoClass = 'estado-cerrado';
        }

        return `
          <tr>
            <td><strong>${sanitize(item.proveedor)}</strong></td>
            <td>${sanitize(item.material)}</td>
            <td>${sanitize(item.tipo_recepcion || '-')}</td>
            <td>${item.cantidad || 0}</td>
            <td><strong>${item.porcentaje_revisado || 0}%</strong></td>
            <td>${item.novedades || 0}</td>
            <td><span class="${estadoClass}">${sanitize(item.novedad_original || item.estado)}</span></td>
            <td><span class="${estadoClass}">${sanitize(item.estado)}</span></td>
            <td>${new Date(item.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>
              <div class="acciones-tabla-mini">
                <button type="button" class="btn-mini btn-seguimiento-mini ${!puedeGestionar ? 'btn-bloqueado' : ''}" 
                  title="${puedeGestionar ? 'Gestión Compras & Trazabilidad' : 'Sin permisos'}" 
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
      }).join('');

    } catch (err) {
      console.error(err);
    }
  };

  // 10. Modal Gestión Compras & Timeline Interactivo
  window.validarRecepcion = async function (id) {
    try {
      window.recepcionGestionando = Number(id);

      const { data: rec, error } = await window.supabaseClient
        .from('recepciones')
        .select('*')
        .eq('id', Number(id))
        .single();

      if (error || !rec) {
        notificar('No se pudo consultar el registro de recepción.');
        return;
      }

      setVal('gestionEstadoInput', rec.estado || 'Pendiente');
      setVal('gestionComentarioInput', '');

      const timeline = $('timelineSeguimiento');
      const countBadge = $('timelineCountBadge');

      if (timeline) {
        const textoSeguimiento = (rec.seguimiento || '').trim();

        if (!textoSeguimiento) {
          timeline.innerHTML = `
            <div class="timeline-empty-state">
              <div class="timeline-empty-icon">📋</div>
              <h5>Sin intervenciones registradas</h5>
              <p>Agregue un seguimiento en el formulario lateral para documentar acuerdos con proveedores.</p>
            </div>`;
          if (countBadge) countBadge.innerText = '0 Registros';
        } else {
          const bloques = textoSeguimiento.split('━━━━━━━━━━━━━━━━━━').reverse().filter(b => b.trim());

          if (countBadge) {
            countBadge.innerText = `${bloques.length} ${bloques.length === 1 ? 'Registro' : 'Registros'}`;
          }

          timeline.innerHTML = bloques.map((bloque, index) => {
            const matchFecha = bloque.match(/📅\s*([^\n]+)/);
            const matchUsuario = bloque.match(/👤(?:\s*Usuario:)?\s*([^\n]+)/i);
            const matchEstado = bloque.match(/🏷️(?:\s*Estado:)?\s*([^\n]+)/i);

            const fecha = matchFecha ? matchFecha[1].trim() : 'Fecha no registrada';
            const usuario = matchUsuario ? matchUsuario[1].trim() : 'Compras';
            const estado = matchEstado ? matchEstado[1].trim() : 'Seguimiento';
            const inicial = usuario.charAt(0).toUpperCase();

            let lineas = bloque.split('\n').map(l => l.trim()).filter(Boolean);
            let lineasFiltradas = lineas.filter(l => {
              const low = l.toLowerCase();
              if (l.startsWith('📅') || l.startsWith('👤') || l.startsWith('🏷️') || l.startsWith('📝')) return false;
              if (low === usuario.toLowerCase() || low === estado.toLowerCase()) return false;
              if (low.startsWith('usuario:') || low.startsWith('estado:') || low.startsWith('comentario:')) return false;
              return true;
            });

            let comentarioFinal = lineasFiltradas.join('\n').trim() || 'Sin comentario adicional.';

            let badgeClass = 'badge-status-default';
            const estadoLower = estado.toLowerCase();
            if (estadoLower.includes('pendiente')) badgeClass = 'badge-status-pendiente';
            else if (estadoLower.includes('gestión') || estadoLower.includes('gestion')) badgeClass = 'badge-status-gestion';
            else if (estadoLower.includes('proveedor') || estadoLower.includes('contacto')) badgeClass = 'badge-status-proveedor';
            else if (estadoLower.includes('solucion')) badgeClass = 'badge-status-solucionado';
            else if (estadoLower.includes('cerrad')) badgeClass = 'badge-status-cerrado';

            const esUltimo = index === bloques.length - 1;

            return `
              <div class="timeline-item-wrapper">
                <div class="timeline-card-item">
                  <div class="timeline-item-header">
                    <div class="timeline-user-tag">
                      <div class="user-tag-avatar">${inicial}</div>
                      <span class="timeline-user-name">${sanitize(usuario)}</span>
                    </div>
                    <span class="timeline-date-chip">📅 ${sanitize(fecha)}</span>
                  </div>

                  <div>
                    <span class="timeline-badge-status ${badgeClass}">● ${sanitize(estado)}</span>
                  </div>

                  <div class="timeline-comment-box">
                    ${sanitize(comentarioFinal).replace(/\n/g, '<br>')}
                  </div>
                </div>

                ${!esUltimo ? `
                  <div class="timeline-separator">
                    <div class="timeline-node-dot"></div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        }
      }

      window.abrirModal('modalGestion');
    } catch (err) {
      console.error('Error abriendo gestión de compras:', err);
    }
  };

  async function guardarGestion() {
    const btn = $('guardarGestionBtn');
    try {
      const comentario = getVal('gestionComentarioInput').trim();
      const estado = getVal('gestionEstadoInput');

      if (!comentario) {
        notificar('Ingrese los detalles o acuerdos para registrar el seguimiento.');
        return;
      }
      if (!window.recepcionGestionando) return;

      if (btn) btn.disabled = true;

      const { data: rec } = await window.supabaseClient
        .from('recepciones')
        .select('*')
        .eq('id', window.recepcionGestionando)
        .single();

      const fecha = new Date().toLocaleString('es-CO');
      const usuario = window.usuarioLogueado?.usuario || 'Compras';
      const entrada = `\n━━━━━━━━━━━━━━━━━━\n📅 ${fecha}\n👤 ${usuario}\n🏷️ Estado: ${estado}\n📝 ${comentario}\n`;
      const nuevoSeguimiento = (rec.seguimiento || '') + entrada;

      // Actualizar tabla recepciones
      await window.supabaseClient
        .from('recepciones')
        .update({
          estado: estado,
          comentario_validacion: comentario,
          seguimiento: nuevoSeguimiento
        })
        .eq('id', window.recepcionGestionando);

      // Persistir registro en tabla seguimiento_recepcion
      await window.supabaseClient
        .from('seguimiento_recepcion')
        .insert([{
          recepcion_id: window.recepcionGestionando,
          estado_anterior: rec.estado,
          estado_nuevo: estado,
          comentario: comentario,
          usuario: usuario
        }]);

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('SEGUIMIENTO', 'RECEPCIONES', `Intervención en recepción #${window.recepcionGestionando} (${rec.proveedor}) -> Estado: ${estado}`);
      }

      if (typeof window.crearNotificacion === 'function') {
        window.crearNotificacion(`🛒 Seguimiento registrado en #${window.recepcionGestionando} (${rec.proveedor}) - ${estado}`, 'info');
      }

      window.cerrarModalGestion();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();
      await window.actualizarDashboardRecepcion();
      notificar('Seguimiento guardado con éxito', 'success');

    } catch (err) {
      console.error(err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // 11. Ver Observación & Soportes Modal
  window.verObservacion = function (id) {
    const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
    const cont = $('contenidoObservacion');
    if (cont) cont.innerText = item?.observacion || 'Sin observaciones registradas.';
    window.abrirModal('modalObservacion');
  };

  window.verSoportesRecepcion = function (id) {
    window.recepcionSoportesModalId = Number(id);
    const soportes = window.recepcionesCacheSoportes[id] || [];
    const cont = $('contenidoSoportesRecepcion');
    const badge = $('contadorSoportesRecepcionModal');
    const max = adjuntosCommon?.MAX_ADJUNTOS || 10;

    if (badge) badge.textContent = `${soportes.length} / ${max}`;
    if (!cont) return;

    if (soportes.length === 0) {
      cont.innerHTML = '<div class="adjunto-vacio">No hay soportes documentales registrados.</div>';
    } else {
      cont.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;">${soportes.map((s, idx) => `
        <div class="adjunto-item">
          <span>${sanitize(s.nombre)}</span>
          <div style="display:flex;gap:6px;">
            <button type="button" class="adjunto-btn--abrir" onclick="window.open('${s.url}', '_blank')">Abrir</button>
            <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarSoporteRecepcionGuardado(${idx})">Eliminar</button>
          </div>
        </div>
      `).join('')}</div>`;
    }

    window.abrirModal('modalSoportesRecepcion');
  };

  window.eliminarSoporteRecepcionGuardado = async function (index) {
    const id = Number(window.recepcionSoportesModalId);
    const soportes = window.recepcionesCacheSoportes[id] || [];
    if (soportes.length <= 1) {
      notificar('La recepción debe conservar al menos 1 soporte.');
      return;
    }

    if (!confirm('¿Desea eliminar este soporte documental?')) return;

    const restantes = soportes.filter((_, i) => i !== Number(index));
    const eliminado = soportes[Number(index)];
    const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';

    await window.supabaseClient
      .from('recepciones')
      .update({ pdf_url: adjuntosCommon ? adjuntosCommon.serializarRecepcion(restantes) : JSON.stringify(restantes) })
      .eq('id', id);

    if (eliminado?.ruta) {
      await window.supabaseClient.storage.from(bucket).remove([eliminado.ruta]);
    }

    await window.renderRecepciones();
    window.verSoportesRecepcion(id);
  };

  // 12. Eliminar Recepción Completa
  window.eliminarRecepcion = async function (id) {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('recepcion', 'eliminar')) {
      notificar('Acceso denegado: No cuenta con permisos para eliminar recepciones.');
      return;
    }

    if (!confirm('¿Eliminar definitivamente esta recepción y sus soportes vinculados?')) return;

    const soportes = window.recepcionesCacheSoportes[Number(id)] || [];
    const rutas = soportes.filter(s => s.ruta).map(s => s.ruta);
    const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';

    await window.supabaseClient.from('recepciones').delete().eq('id', Number(id));
    if (rutas.length) await window.supabaseClient.storage.from(bucket).remove(rutas);

    if (typeof window.guardarHistorial === 'function') {
      await window.guardarHistorial('ELIMINAR', 'RECEPCIONES', `Se eliminó la recepción #${id}`);
    }

    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    await window.actualizarDashboardRecepcion();
    notificar('Recepción eliminada correctamente', 'success');
  };

  // 13. KPIs y Dashboard Resumen (Cálculo Estrictamente Numérico)
  window.actualizarKPIsRecepcion = async function () {
    try {
      const { data: recs } = await window.supabaseClient.from('recepciones').select('*');
      const lista = recs || [];

      if ($('kpiRecepciones')) $('kpiRecepciones').innerText = lista.length.toLocaleString();

      let totalFaltantes = 0;
      let totalNovedades = 0;
      let totalRevisadoSuma = 0;

      lista.forEach(item => {
        const numFalt = Number(item.faltantes) || (String(item.estado || item.novedad_original || '').toLowerCase().includes('faltante') ? 1 : 0);
        const numNov = Number(item.novedades) || 0;
        const estado = String(item.estado || item.novedad_original || '').toLowerCase();

        totalFaltantes += numFalt;

        if (numNov > 0) {
          totalNovedades += numNov;
        } else if (estado.includes('dañ') || estado.includes('dan') || estado.includes('falt') || estado.includes('sobr')) {
          totalNovedades += 1;
        }

        totalRevisadoSuma += Number(item.porcentaje_revisado) || 0;
      });

      const avgRevisado = lista.length > 0 ? (totalRevisadoSuma / lista.length).toFixed(1) : '0.0';

      if ($('kpiRevisado')) $('kpiRevisado').innerText = `${avgRevisado}%`;
      if ($('kpiNovedades')) $('kpiNovedades').innerText = totalNovedades.toLocaleString();
      if ($('kpiFaltantes')) $('kpiFaltantes').innerText = totalFaltantes.toLocaleString();
    } catch (e) {
      console.error('Error en actualizarKPIsRecepcion:', e);
    }
  };

  window.actualizarDashboardRecepcion = async function () {
    const body = $('dashboardRecepcionBody');
    if (!body) return;

    try {
      const { data: recs } = await window.supabaseClient.from('recepciones').select('*');
      const meses = {};

      (recs || []).forEach(item => {
        const fecha = item.created_at ? new Date(item.created_at) : new Date();
        const mes = fecha.toLocaleString('es-CO', { month: 'long' });
        if (!meses[mes]) meses[mes] = { recs: 0, falt: 0, sobr: 0, dan: 0, tot: 0 };

        meses[mes].recs += 1;

        const numFalt = Number(item.faltantes) || (String(item.estado || item.novedad_original || '').toLowerCase().includes('faltante') ? 1 : 0);
        const numNov = Number(item.novedades) || 0;
        const estado = String(item.estado || item.novedad_original || '').toLowerCase();

        meses[mes].falt += numFalt;
        if (estado.includes('sobrante')) meses[mes].sobr += 1;
        if (estado.includes('dañ') || estado.includes('dan')) meses[mes].dan += (numNov > 0 ? numNov : 1);

        meses[mes].tot = meses[mes].falt + meses[mes].sobr + meses[mes].dan;
      });

      body.innerHTML = Object.keys(meses).map(m => `
        <tr>
          <td><strong>${m.toUpperCase()}</strong></td>
          <td>${meses[m].recs}</td>
          <td><span class="badge-faltante-txt">${meses[m].falt}</span></td>
          <td><span class="badge-sobrante-txt">${meses[m].sobr}</span></td>
          <td><span class="badge-danado-txt">${meses[m].dan}</span></td>
          <td><strong>${meses[m].tot}</strong></td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('Error en actualizarDashboardRecepcion:', e);
    }
  };

  // 14. Eventos Delegados & Atajos
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      window.cerrarModalGestion();
      window.cerrarModalObservacion();
      window.cerrarModalSoportesRecepcion();
    }

    if (e.key === 'Enter' && !['TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
      if (e.target.id === 'driveLinkRecepcion') {
        e.preventDefault();
        agregarDrive();
        return;
      }
      const form = e.target.closest('#formRecepcionFast');
      if (form) {
        e.preventDefault();
        const focusables = Array.from(form.querySelectorAll('input, select, textarea'));
        const idx = focusables.indexOf(e.target);
        if (idx > -1 && idx + 1 < focusables.length) focusables[idx + 1].focus();
      }
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target && (e.target.id === 'cantidadInput' || e.target.id === 'revisadasInput')) {
      calcularPorcentajeEnVivo();
    }
    if (e.target && e.target.id === 'buscarRecepcion') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        window.renderRecepciones(window.recepcionesCacheDatos);
        return;
      }
      const filtrados = window.recepcionesCacheDatos.filter(i =>
        String(i.proveedor || '').toLowerCase().includes(q) ||
        String(i.material || '').toLowerCase().includes(q) ||
        String(i.estado || '').toLowerCase().includes(q)
      );
      window.renderRecepciones(filtrados);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-documentos')) {
      e.target.classList.remove('active');
      e.target.style.display = 'none';
    }

    if (e.target.closest('#btnAgregarSoportesRecepcion')) {
      e.preventDefault();
      const fi = $('pdfInput');
      if (fi) {
        fi.onchange = ev => {
          agregarArchivos(ev.target.files);
          ev.target.value = '';
        };
        fi.click();
      }
    }

    if (e.target.closest('#btnAgregarDriveRecepcion')) {
      e.preventDefault();
      agregarDrive();
    }

    if (e.target.closest('#guardarRecepcion')) {
      e.preventDefault();
      guardarRecepcion();
    }

    if (e.target.closest('#guardarGestionBtn')) {
      e.preventDefault();
      guardarGestion();
    }

    if (e.target.closest('#descargarDashboardRecepcion')) {
      e.preventDefault();
      window.open('modules/dashboard-recepcion.html', '_blank');
    }
  });

  // Inicialización
  renderSoportesTemporales();
  window.renderRecepciones();
  window.actualizarKPIsRecepcion();
  window.actualizarDashboardRecepcion();
})();
