/**
 * ====================================================================
 * RECEPCION.JS — Módulo Integral de Recepción & Devoluciones Pro
 * ====================================================================
 */

(function () {
  'use strict';

  if (window.refreshRecepcionInterval) {
    clearInterval(window.refreshRecepcionInterval);
  }

  const adjuntosCommon = window.AdjuntosCommon;
  let soportesSeleccionados = [];
  window.recepcionesCacheSoportes = {};
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

  // Modales
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
  // 1. CAMBIO DE MODO: RECEPCIÓN VS DEVOLUCIÓN
  // ==================================================================
  window.cambiarModoOperacion = function (modo) {
    setVal('operacionModoInput', modo);

    const btnRec = $('btnModoRecepcion');
    const btnDev = $('btnModoDevolucion');
    const seccRec = document.querySelectorAll('.seccion-recepcion');
    const seccDev = document.querySelectorAll('.seccion-devolucion');

    if (modo === 'Recepcion') {
      btnRec?.classList.add('active');
      btnDev?.classList.remove('active');

      seccRec.forEach(el => el.style.display = 'flex');
      seccDev.forEach(el => el.style.display = 'none');

      $('heroIcono').innerText = '📥';
      $('formCardIcon').innerText = '📝';
      $('formCardTitulo').innerText = 'Registrar Nueva Recepción';
      $('labelCantidad').innerText = 'CANTIDAD TOTAL RECIBIDA';
      $('labelObservacion').innerText = 'OBSERVACIONES DE RECEPCIÓN';
      $('txtBtnGuardar').innerText = 'Guardar Recepción';
      $('estadoRecepcionInput').value = 'Conforme';

    } else {
      btnDev?.classList.add('active');
      btnRec?.classList.remove('active');

      seccRec.forEach(el => el.style.display = 'none');
      seccDev.forEach(el => el.style.display = 'flex');

      $('heroIcono').innerText = '📤';
      $('formCardIcon').innerText = '📤';
      $('formCardTitulo').innerText = 'Registrar Devolución a Proveedor';
      $('labelCantidad').innerText = 'CANTIDAD DEVUELTA';
      $('labelObservacion').innerText = 'MOTIVO / CONDICIÓN DE LA DEVOLUCIÓN';
      $('txtBtnGuardar').innerText = 'Registrar Devolución';
      $('estadoRecepcionInput').value = 'En Devolución';
    }
  };

  // Cálculo Dinámico de % Revisado
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
  // 2. GESTIÓN DE SOPORTES DOCUMENTALES
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
        mime: archivo.type || '',
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
      mime: 'text/uri-list',
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
      lista.innerHTML = '<div class="adjunto-vacio">Aún no se han agregado soportes documentales.</div>';
      return;
    }

    lista.innerHTML = soportesSeleccionados.map((s, idx) => `
      <div class="adjunto-item">
        <div class="adjunto-item__info">
          <span>${s.tipo === 'drive' ? '🔗' : '📄'}</span>
          <strong>${sanitize(s.nombre)}</strong>
        </div>
        <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarSoporteRecepcionTemporal(${idx})">Quitar</button>
      </div>
    `).join('');
  }

  window.eliminarSoporteRecepcionTemporal = function (index) {
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
  // 3. GUARDAR OPERACIÓN (RECEPCIÓN O DEVOLUCIÓN)
  // ==================================================================
  async function guardarRecepcion() {
    const btn = $('guardarRecepcion');
    try {
      const modo = getVal('operacionModoInput') || 'Recepcion';
      const proveedor = getVal('proveedorInput').trim();
      const material = getVal('materialInput').trim();
      const cantidad = Number(getVal('cantidadInput'));
      const observacion = getVal('observacionInput').trim();
      const estado = getVal('estadoRecepcionInput');

      if (!proveedor || !material || cantidad <= 0) {
        notificar('Complete los campos obligatorios: Proveedor, Material y Cantidad.');
        return;
      }

      let tipoRecepcion = '';
      let revisadas = 0;
      let novedades = 0;
      let faltantes = 0;
      let pct = '100.0';

      if (modo === 'Recepcion') {
        tipoRecepcion = getVal('tipoRecepcionInput');
        revisadas = Number(getVal('revisadasInput')) || 0;
        novedades = Number(getVal('novedadesInput')) || 0;
        faltantes = Number(getVal('faltantesInput')) || 0;
        pct = cantidad > 0 ? Math.min((revisadas / cantidad) * 100, 100).toFixed(1) : '0.0';
      } else {
        const motivo = getVal('motivoDevolucionInput');
        const accion = getVal('accionDevolucionInput');
        tipoRecepcion = `Devolución: ${motivo} [${accion}]`;
        novedades = cantidad;
      }

      if (btn) btn.disabled = true;

      let pdfUrl = '[]';
      try {
        const cargados = await subirSoportes();
        pdfUrl = JSON.stringify(cargados);
      } catch (err) {
        notificar(err.message, 'error');
        if (btn) btn.disabled = false;
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
        seguimiento: modo === 'Devolucion' ? `Devolución registrada por: ${usuario}` : '',
        estado,
        novedad_original: estado,
        pdf_url: pdfUrl,
        usuario_recepcion: usuario,
        created_at: new Date().toISOString()
      };

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.from('recepciones').insert([payload]);
        if (error) {
          notificar('Error guardando en base de datos: ' + error.message, 'error');
          return;
        }
      }

      notificar(`${modo === 'Recepcion' ? 'Recepción' : 'Devolución'} guardada exitosamente`, 'success');
      limpiarFormulario();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();

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

  // ==================================================================
  // 4. RENDERIZADO DE TABLAS SEPARADAS (RECEPCIONES & DEVOLUCIONES)
  // ==================================================================
  window.renderRecepciones = async function (datos = null) {
    const bodyRec = $('recepcionesBody');
    const bodyDev = $('devolucionesBody');
    if (!bodyRec) return;

    try {
      let lista = datos;
      if (!lista) {
        const { data, error } = await window.supabaseClient
          .from('recepciones')
          .select('*')
          .order('id', { ascending: false });

        if (error) return;
        lista = data || [];
        window.recepcionesCacheDatos = lista;
      }

      window.recepcionesCacheSoportes = {};
      lista.forEach(i => {
        try {
          window.recepcionesCacheSoportes[i.id] = JSON.parse(i.pdf_url || '[]');
        } catch (_) {
          window.recepcionesCacheSoportes[i.id] = [];
        }
      });

      // Separación lógica: Devoluciones vs Recepciones
      const recepciones = lista.filter(i => !String(i.tipo_recepcion || '').startsWith('Devolución') && i.estado !== 'En Devolución');
      const devoluciones = lista.filter(i => String(i.tipo_recepcion || '').startsWith('Devolución') || i.estado === 'En Devolución');

      // 1. Tabla de Recepciones
      if (recepciones.length === 0) {
        bodyRec.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:26px;color:#64748b;">No hay recepciones registradas</td></tr>`;
      } else {
        bodyRec.innerHTML = recepciones.map(item => `
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
                <button type="button" class="btn-mini" title="Gestión Compras" onclick="window.validarRecepcion(${item.id})">📋</button>
                <button type="button" class="btn-mini" title="Ver Observación" onclick="window.verObservacion(${item.id})">👁️</button>
                <button type="button" class="btn-mini" title="Soportes" onclick="window.verSoportesRecepcion(${item.id})">📎</button>
                <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarRecepcion(${item.id})">🗑️</button>
              </div>
            </td>
          </tr>
        `).join('');
      }

      // 2. Tabla de Devoluciones
      if (bodyDev) {
        if (devoluciones.length === 0) {
          bodyDev.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:#64748b;">No hay devoluciones a proveedores registradas</td></tr>`;
        } else {
          bodyDev.innerHTML = devoluciones.map(item => `
            <tr>
              <td><strong>${sanitize(item.proveedor)}</strong></td>
              <td>${sanitize(item.material)}</td>
              <td><span class="estado-cerrado">${sanitize(item.tipo_recepcion || 'Devolución')}</span></td>
              <td><strong>${item.cantidad || 0}</strong></td>
              <td><span class="estado-revision">${sanitize(item.estado)}</span></td>
              <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
              <td style="text-align:center;">
                <div class="acciones-tabla-mini">
                  <button type="button" class="btn-mini" title="Gestión Compras" onclick="window.validarRecepcion(${item.id})">📋</button>
                  <button type="button" class="btn-mini" title="Ver Motivo" onclick="window.verObservacion(${item.id})">👁️</button>
                  <button type="button" class="btn-mini" title="Soportes / Guía" onclick="window.verSoportesRecepcion(${item.id})">📎</button>
                  <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarRecepcion(${item.id})">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('');
        }
      }

    } catch (err) {
      console.error(err);
    }
  };

  // ==================================================================
  // 5. TIMELINE & GESTIÓN DE COMPRAS
  // ==================================================================
  window.validarRecepcion = async function (id) {
    window.recepcionGestionando = Number(id);
    const { data: rec } = await window.supabaseClient.from('recepciones').select('*').eq('id', Number(id)).single();
    if (!rec) return;

    setVal('gestionEstadoInput', rec.estado || 'Pendiente');
    setVal('gestionComentarioInput', '');

    const timeline = $('timelineSeguimiento');
    if (timeline) {
      const texto = (rec.seguimiento || '').trim();
      if (!texto) {
        timeline.innerHTML = '<div class="timeline-empty-state"><p>Sin intervenciones de compras aún.</p></div>';
      } else {
        timeline.innerHTML = `<div style="padding:14px;background:#fff;border-radius:10px;line-height:1.6;font-size:13px;white-space:pre-wrap;">${sanitize(texto)}</div>`;
      }
    }
    window.abrirModal('modalGestion');
  };

  async function guardarGestion() {
    const btn = $('guardarGestionBtn');
    try {
      const comentario = getVal('gestionComentarioInput').trim();
      const estado = getVal('gestionEstadoInput');
      if (!comentario || !window.recepcionGestionando) return;

      if (btn) btn.disabled = true;

      const { data: rec } = await window.supabaseClient.from('recepciones').select('*').eq('id', window.recepcionGestionando).single();
      const usuario = window.usuarioLogueado?.usuario || 'Compras';
      const entrada = `\n━━━━━━━━━━━━━━━━━━\n📅 ${new Date().toLocaleString('es-CO')}\n👤 ${usuario}\n🏷️ ${estado}\n📝 ${comentario}\n`;

      await window.supabaseClient
        .from('recepciones')
        .update({ estado, seguimiento: (rec?.seguimiento || '') + entrada })
        .eq('id', window.recepcionGestionando);

      window.cerrarModalGestion();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();
      notificar('Seguimiento guardado con éxito', 'success');

    } catch (e) {
      console.error(e);
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
    const soportes = window.recepcionesCacheSoportes[id] || [];
    const cont = $('contenidoSoportesRecepcion');
    if (!cont) return;

    if (soportes.length === 0) {
      cont.innerHTML = '<div class="adjunto-vacio">No hay soportes adjuntos registrados.</div>';
    } else {
      cont.innerHTML = soportes.map(s => `
        <div class="adjunto-item">
          <span>${sanitize(s.nombre)}</span>
          <button type="button" class="adjunto-btn--abrir" onclick="window.open('${s.url}', '_blank')">Abrir</button>
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
  // 6. KPIS ACTUALIZADOS (INCLUYE DEVOLUCIONES)
  // ==================================================================
  window.actualizarKPIsRecepcion = async function () {
    try {
      const { data: recs } = await window.supabaseClient.from('recepciones').select('*');
      const lista = recs || [];

      const devoluciones = lista.filter(i => String(i.tipo_recepcion || '').startsWith('Devolución') || i.estado === 'En Devolución');
      const recepciones = lista.filter(i => !String(i.tipo_recepcion || '').startsWith('Devolución') && i.estado !== 'En Devolución');

      if ($('kpiRecepciones')) $('kpiRecepciones').innerText = recepciones.length.toLocaleString();
      if ($('kpiDevoluciones')) $('kpiDevoluciones').innerText = devoluciones.length.toLocaleString();

      let totalFaltantes = 0;
      let totalNovedades = 0;

      recepciones.forEach(i => {
        totalFaltantes += Number(i.faltantes) || 0;
        totalNovedades += Number(i.novedades) || 0;
      });

      if ($('kpiNovedades')) $('kpiNovedades').innerText = totalNovedades.toLocaleString();
      if ($('kpiFaltantes')) $('kpiFaltantes').innerText = totalFaltantes.toLocaleString();

    } catch (e) {
      console.error(e);
    }
  };

  // ==================================================================
  // 7. LISTENERS Y PESTAÑAS (TABS)
  // ==================================================================
  document.addEventListener('click', function (e) {
    // Cambio de pestañas
    const tabBtn = e.target.closest('.tab-recepcion-btn');
    if (tabBtn) {
      const target = tabBtn.dataset.tab;
      document.querySelectorAll('.tab-recepcion-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-recepcion-content').forEach(c => c.classList.remove('active'));

      tabBtn.classList.add('active');
      const panel = $(target);
      if (panel) panel.classList.add('active');
    }

    if (e.target.closest('#btnAgregarSoportesRecepcion')) {
      $('pdfInput')?.click();
    }
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

  const fi = $('pdfInput');
  if (fi) {
    fi.onchange = ev => {
      agregarArchivos(ev.target.files);
      ev.target.value = '';
    };
  }

  document.addEventListener('input', function (e) {
    if (e.target && (e.target.id === 'cantidadInput' || e.target.id === 'revisadasInput')) {
      calcularPorcentajeEnVivo();
    }
    if (e.target && e.target.id === 'buscarRecepcion') {
      const q = e.target.value.toLowerCase().trim();
      const filtrados = (window.recepcionesCacheDatos || []).filter(i =>
        String(i.proveedor || '').toLowerCase().includes(q) ||
        String(i.material || '').toLowerCase().includes(q)
      );
      window.renderRecepciones(filtrados);
    }
  });

  // Inicialización
  renderSoportesTemporales();
  window.renderRecepciones();
  window.actualizarKPIsRecepcion();
})();
