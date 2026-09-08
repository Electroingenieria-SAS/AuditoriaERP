/**
 * ====================================================================
 * RECEPCION.JS — Módulo Integral de Recepción Logística & Compras Pro
 * ====================================================================
 */

(function () {
  'use strict';

  // 1. Limpieza de intervalos previos
  if (window.refreshRecepcionInterval) {
    clearInterval(window.refreshRecepcionInterval);
  }

  // 2. Estado local y control de envíos
  let soportesSeleccionados = [];
  let guardandoOperacionActiva = false;
  window.recepcionesCacheDatos = [];
  window.recepcionGestionando = null;
  window.recepcionSoportesModalId = null;

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
    } else {
      alert(mensaje);
    }
  }

  // ==================================================================
  // MODALES
  // ==================================================================
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

  // ==================================================================
  // CÁLCULO DINÁMICO DE % REVISADO
  // ==================================================================
  function calcularPorcentajeEnVivo() {
    const cant = Number(getVal('cantidadInput')) || 0;
    const rev = Number(getVal('revisadasInput')) || 0;
    if (cant > 0 && rev >= 0) {
      const pct = Math.min((rev / cant) * 100, 100).toFixed(1);
      const kpi = $('kpiRevisado');
      if (kpi) kpi.innerText = `${pct}%`;
    }
  }

  // ==================================================================
  // GESTIÓN DE SOPORTES DOCUMENTALES
  // ==================================================================
  function totalSoportes() {
    return soportesSeleccionados.length;
  }

  function agregarArchivos(archivos) {
    const max = 10;
    for (const archivo of Array.from(archivos || [])) {
      if (totalSoportes() >= max) {
        notificar(`Límite alcanzado: Máximo ${max} soportes.`);
        break;
      }
      soportesSeleccionados.push({
        tipo: 'archivo',
        archivo: archivo,
        nombre: archivo.name,
        tamano: archivo.size
      });
    }
    renderSoportesTemporales();
  }

  function agregarDrive() {
    const input = $('driveLinkRecepcion');
    if (!input) return;
    const url = input.value.trim();

    if (!url || !url.startsWith('https://')) {
      notificar('Ingrese un enlace válido de Google Drive.');
      return;
    }

    soportesSeleccionados.push({
      tipo: 'drive',
      nombre: `Enlace Drive #${totalSoportes() + 1}`,
      url: url,
      tamano: 0
    });

    input.value = '';
    renderSoportesTemporales();
  }

  function renderSoportesTemporales() {
    const lista = $('listaSoportesRecepcion');
    const contador = $('contadorSoportesRecepcion');
    if (contador) contador.textContent = `${totalSoportes()} / 10`;
    if (!lista) return;

    if (soportesSeleccionados.length === 0) {
      lista.innerHTML = '<small class="adjunto-vacio-txt">Sin archivos anexados.</small>';
      return;
    }

    lista.innerHTML = soportesSeleccionados.map((s, idx) => `
      <div class="adjunto-item">
        <span>${s.tipo === 'drive' ? '🔗' : '📄'} ${sanitize(s.nombre)}</span>
        <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarSoporteTemp(${idx})">Quitar</button>
      </div>
    `).join('');
  }

  window.eliminarSoporteTemp = function (index) {
    soportesSeleccionados.splice(Number(index), 1);
    renderSoportesTemporales();
  };

  async function subirSoportes() {
    const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';
    const guardados = [];

    for (const s of soportesSeleccionados) {
      if (s.tipo === 'drive') {
        guardados.push(s);
        continue;
      }

      const archivo = s.archivo;
      const limpio = String(archivo.name || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_');
      const ruta = `recepciones/${Date.now()}_${limpio}`;

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.storage
          .from(bucket)
          .upload(ruta, archivo, { upsert: false });

        if (error) throw new Error(`Error al subir ${archivo.name}: ${error.message}`);
        const urlData = window.supabaseClient.storage.from(bucket).getPublicUrl(ruta);

        guardados.push({
          tipo: 'archivo',
          nombre: archivo.name,
          url: urlData.data.publicUrl,
          ruta: ruta
        });
      }
    }
    return guardados;
  }

  // ==================================================================
  // GUARDAR RECEPCIÓN (CAMPOS ORIGINALES Y SIN DOBLE CLIC)
  // ==================================================================
  async function guardarRecepcion() {
    if (guardandoOperacionActiva) return;

    const btn = $('guardarRecepcion');
    try {
      const proveedor = getVal('proveedorInput').trim();
      const material = getVal('materialInput').trim();
      const tipoRecepcion = getVal('tipoRecepcionInput');
      const cantidad = Number(getVal('cantidadInput'));
      const revisadas = Number(getVal('revisadasInput')) || 0;
      const novedades = Number(getVal('novedadesInput')) || 0;
      const faltantes = Number(getVal('faltantesInput')) || 0;
      const observacion = getVal('observacionInput').trim();
      const estado = getVal('estadoRecepcionInput');

      if (!proveedor || !material || cantidad <= 0) {
        notificar('Complete los campos obligatorios: Proveedor, Material y Cantidad Total.');
        return;
      }

      guardandoOperacionActiva = true;
      if (btn) btn.disabled = true;

      const pct = Math.min((revisadas / cantidad) * 100, 100).toFixed(1);

      let pdfUrl = '[]';
      try {
        const cargados = await subirSoportes();
        pdfUrl = JSON.stringify(cargados);
      } catch (err) {
        notificar(err.message, 'error');
        return;
      }

      const usuario = window.usuarioLogueado?.usuario || 'Usuario';

      const payload = {
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
        seguimiento: `Registro creado por: ${usuario}`,
        estado,
        novedad_original: estado,
        pdf_url: pdfUrl,
        usuario_recepcion: usuario,
        created_at: new Date().toISOString()
      };

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.from('recepciones').insert([payload]);
        if (error) {
          notificar('Error al guardar en base de datos: ' + error.message, 'error');
          return;
        }
      }

      notificar('Recepción registrada exitosamente', 'success');
      limpiarFormulario();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();

    } catch (e) {
      console.error('Error registrando recepción:', e);
    } finally {
      guardandoOperacionActiva = false;
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

  // ==================================================================
  // RENDERIZADO DE TABLA DE RECEPCIONES
  // ==================================================================
  window.renderRecepciones = async function (datos = null) {
    const bodyRec = $('recepcionesBody');
    if (!bodyRec) return;

    try {
      let lista = datos;
      if (!lista && window.supabaseClient) {
        const { data, error } = await window.supabaseClient
          .from('recepciones')
          .select('*')
          .order('id', { ascending: false });

        if (error) return;
        lista = data || [];
        window.recepcionesCacheDatos = lista;
      } else if (!lista) {
        lista = window.recepcionesCacheDatos || [];
      }

      if (lista.length === 0) {
        bodyRec.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:26px;color:#64748b;">No hay recepciones registradas</td></tr>`;
        return;
      }

      bodyRec.innerHTML = lista.map(item => `
        <tr>
          <td><strong>${sanitize(item.proveedor)}</strong></td>
          <td>${sanitize(item.material)}</td>
          <td>${sanitize(item.tipo_recepcion || '-')}</td>
          <td>${item.cantidad || 0}</td>
          <td><strong>${item.porcentaje_revisado || 0}%</strong></td>
          <td>${item.novedades || 0}</td>
          <td><span class="estado-pendiente">${sanitize(item.novedad_original || item.estado)}</span></td>
          <td><span class="estado-revision">${sanitize(item.estado)}</span></td>
          <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
          <td style="text-align:center;">
            <div class="acciones-tabla-mini">
              <button type="button" class="btn-mini" title="Gestión" onclick="window.validarRecepcion(${item.id})">📋</button>
              <button type="button" class="btn-mini" title="Ver Observación" onclick="window.verObservacion(${item.id})">👁️</button>
              <button type="button" class="btn-mini" title="Soportes" onclick="window.verSoportesRecepcion(${item.id})">📎</button>
              <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarRecepcion(${item.id})">🗑️</button>
            </div>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      console.error(err);
    }
  };

  // ==================================================================
  // MODAL GESTIÓN COMPRAS CON TIMELINE PRO RESTAURADO
  // ==================================================================
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
            else if (estadoLower.includes('solucion') || estadoLower.includes('conforme')) badgeClass = 'badge-status-solucionado';
            else if (estadoLower.includes('cerrad') || estadoLower.includes('dañ')) badgeClass = 'badge-status-cerrado';

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
      console.error('Error abriendo gestión:', err);
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

      await window.supabaseClient
        .from('recepciones')
        .update({
          estado: estado,
          comentario_validacion: comentario,
          seguimiento: nuevoSeguimiento
        })
        .eq('id', window.recepcionGestionando);

      window.cerrarModalGestion();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();
      notificar('Seguimiento guardado con éxito', 'success');

    } catch (err) {
      console.error(err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.verObservacion = function (id) {
    const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
    const cont = $('contenidoObservacion');
    if (cont) cont.innerText = item?.observacion || 'Sin observaciones registradas.';
    window.abrirModal('modalObservacion');
  };

  window.verSoportesRecepcion = function (id) {
    const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
    const cont = $('contenidoSoportesRecepcion');
    if (!cont) return;

    let soportes = [];
    try {
      soportes = JSON.parse(item?.pdf_url || '[]');
    } catch (_) {
      soportes = [];
    }

    if (soportes.length === 0) {
      cont.innerHTML = '<div class="adjunto-vacio-txt">No hay soportes adjuntos registrados.</div>';
    } else {
      cont.innerHTML = soportes.map(s => `
        <div class="adjunto-item">
          <span>${sanitize(s.nombre)}</span>
          <button type="button" class="btn-cargar-archivos" style="width:auto;padding:4px 12px;height:32px;" onclick="window.open('${s.url}', '_blank')">Abrir</button>
        </div>
      `).join('');
    }
    window.abrirModal('modalSoportesRecepcion');
  };

  window.eliminarRecepcion = async function (id) {
    if (!confirm('¿Desea eliminar definitivamente este registro y sus soportes?')) return;
    await window.supabaseClient.from('recepciones').delete().eq('id', Number(id));
    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    notificar('Registro eliminado con éxito.', 'success');
  };

  // ==================================================================
  // ACTUALIZACIÓN DE KPIS
  // ==================================================================
  window.actualizarKPIsRecepcion = async function () {
    try {
      let lista = window.recepcionesCacheDatos;
      if (window.supabaseClient && lista.length === 0) {
        const { data } = await window.supabaseClient.from('recepciones').select('*');
        lista = data || [];
        window.recepcionesCacheDatos = lista;
      }

      let totalFaltantes = 0;
      let totalNovedades = 0;

      lista.forEach(i => {
        totalFaltantes += Number(i.faltantes) || 0;
        totalNovedades += Number(i.novedades) || 0;
      });

      if ($('kpiRecepciones')) $('kpiRecepciones').innerText = lista.length.toLocaleString();
      if ($('kpiNovedades')) $('kpiNovedades').innerText = totalNovedades.toLocaleString();
      if ($('kpiFaltantes')) $('kpiFaltantes').innerText = totalFaltantes.toLocaleString();

    } catch (e) {
      console.error(e);
    }
  };

  // ==================================================================
  // ASIGNACIÓN ÚNICA DE LISTENERS (PREVENCIÓN DE DUPLICADOS EN SPA)
  // ==================================================================
  if (!window._recepcionListenersInicializados) {
    window._recepcionListenersInicializados = true;

    document.addEventListener('click', function (e) {
      if (e.target.closest('#btnAgregarDriveRecepcion')) {
        agregarDrive();
      }
      if (e.target.closest('#guardarRecepcion')) {
        guardarRecepcion();
      }
      if (e.target.closest('#guardarGestionBtn')) {
        guardarGestion();
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && (e.target.id === 'cantidadInput' || e.target.id === 'revisadasInput')) {
        calcularPorcentajeEnVivo();
      }
      if (e.target && e.target.id === 'buscarRecepcion') {
        const q = e.target.value.toLowerCase().trim();
        const filtrados = (window.recepcionesCacheDatos || []).filter(i =>
          String(i.proveedor || '').toLowerCase().includes(q) ||
          String(i.material || '').toLowerCase().includes(q) ||
          String(i.estado || '').toLowerCase().includes(q)
        );
        window.renderRecepciones(filtrados);
      }
    });
  }

  // Selector de archivos
  const fi = $('pdfInput');
  if (fi) {
    fi.onchange = ev => {
      agregarArchivos(ev.target.files);
      ev.target.value = '';
    };
  }

  // Inicialización de la pantalla
  renderSoportesTemporales();
  window.renderRecepciones();
  window.actualizarKPIsRecepcion();
})();
