/**
 * ====================================================================
 * RECEPCION.JS — Módulo de Recepción & Devoluciones Pro
 * ====================================================================
 */

(function () {
  'use strict';

  if (window.refreshRecepcionInterval) {
    clearInterval(window.refreshRecepcionInterval);
  }

  // Estado del Módulo
  let soportesSeleccionados = [];
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
      window.mostrarNotificacion('Recepción & Devoluciones', mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    } else {
      alert(mensaje);
    }
  }

  // ==================================================================
  // 1. GESTIÓN DE MODALES
  // ==================================================================
  window.abrirModal = function (id) {
    const m = $(id);
    if (m) {
      m.style.display = 'flex';
      m.classList.add('active');
    }
  };

  window.cerrarModal = function (id) {
    const m = $(id);
    if (m) {
      m.style.display = 'none';
      m.classList.remove('active');
    }
  };

  window.cerrarModalGestion = () => window.cerrarModal('modalGestion');
  window.cerrarModalObservacion = () => window.cerrarModal('modalObservacion');
  window.cerrarModalSoportesRecepcion = () => window.cerrarModal('modalSoportesRecepcion');

  // ==================================================================
  // 2. INTERRUPTOR DE FLUJO (3 MODOS)
  // ==================================================================
  window.cambiarModo = function (modo) {
    setVal('tipoOperacionInput', modo);

    // Actualizar botones de selector
    document.querySelectorAll('.btn-flujo').forEach(b => b.classList.remove('active'));

    const seccRec = document.querySelectorAll('.seccion-recepcion');
    const seccDevProv = document.querySelectorAll('.seccion-dev-prov');
    const seccDevProy = document.querySelectorAll('.seccion-dev-proy');

    seccRec.forEach(e => e.style.display = 'none');
    seccDevProv.forEach(e => e.style.display = 'none');
    seccDevProy.forEach(e => e.style.display = 'none');

    if (modo === 'Recepcion') {
      $('btnModoRecepcion')?.classList.add('active');
      seccRec.forEach(e => e.style.display = '');

      $('recOperacionBadge').innerText = 'Modo: Recepción Compras';
      $('panelOperacionIcon').innerText = '📥';
      $('panelOperacionTitulo').innerText = 'Registrar Recepción';
      $('labelOrigen').innerText = 'PROVEEDOR / RAZÓN SOCIAL';
      $('origenInput').placeholder = 'Nombre de la empresa proveedora';
      $('labelCantidad').innerText = 'CANTIDAD TOTAL RECIBIDA';
      $('txtBtnSubmit').innerText = 'Guardar Recepción';

    } else if (modo === 'DevolucionProv') {
      $('btnModoDevolucionProv')?.classList.add('active');
      seccDevProv.forEach(e => e.style.display = '');

      $('recOperacionBadge').innerText = 'Modo: Devolución Proveedor';
      $('panelOperacionIcon').innerText = '📤';
      $('panelOperacionTitulo').innerText = 'Registrar Dev. Proveedor';
      $('labelOrigen').innerText = 'PROVEEDOR DESTINO';
      $('origenInput').placeholder = 'Proveedor al que se retorna el material';
      $('labelCantidad').innerText = 'CANTIDAD A DEVOLVER';
      $('txtBtnSubmit').innerText = 'Registrar Devolución a Proveedor';

    } else if (modo === 'DevolucionProy') {
      $('btnModoDevolucionProy')?.classList.add('active');
      seccDevProy.forEach(e => e.style.display = '');

      $('recOperacionBadge').innerText = 'Modo: Devolución Proyecto';
      $('panelOperacionIcon').innerText = '🏗️';
      $('panelOperacionTitulo').innerText = 'Reintegro de Proyecto';
      $('labelOrigen').innerText = 'PROYECTO / CUADRILLA';
      $('origenInput').placeholder = 'Nombre de la obra, contrato o liniero';
      $('labelCantidad').innerText = 'CANTIDAD REINTEGRADA';
      $('txtBtnSubmit').innerText = 'Registrar Reintegro de Obra';
    }
  };

  // ==================================================================
  // 3. GESTIÓN DE ADJUNTOS
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
    renderSoportesPreview();
  }

  function agregarDrive() {
    const input = $('driveLinkInput');
    if (!input) return;
    const url = input.value.trim();

    if (!url || !url.startsWith('https://')) {
      notificar('Pegue un enlace válido de Google Drive.');
      return;
    }

    soportesSeleccionados.push({
      tipo: 'drive',
      nombre: `Enlace Drive #${totalSoportes() + 1}`,
      url: url,
      tamano: 0
    });

    input.value = '';
    renderSoportesPreview();
  }

  function renderSoportesPreview() {
    const lista = $('listaSoportesPreview');
    const badge = $('contadorSoportes');
    if (badge) badge.innerText = `${totalSoportes()} / 10`;
    if (!lista) return;

    if (soportesSeleccionados.length === 0) {
      lista.innerHTML = '<small class="rec-vacio-txt">Sin archivos anexados.</small>';
      return;
    }

    lista.innerHTML = soportesSeleccionados.map((s, idx) => `
      <div class="adjunto-item">
        <span>${s.tipo === 'drive' ? '🔗' : '📄'} ${sanitize(s.nombre)}</span>
        <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarSoporteTemp(${idx})">✕</button>
      </div>
    `).join('');
  }

  window.eliminarSoporteTemp = function (idx) {
    soportesSeleccionados.splice(Number(idx), 1);
    renderSoportesPreview();
  };

  async function subirSoportesStorage() {
    const bucket = window.ERP_CONFIG?.STORAGE_BUCKETS?.RECEPCIONES || 'recepciones-pdf';
    const guardados = [];

    for (const s of soportesSeleccionados) {
      if (s.tipo === 'drive') {
        guardados.push(s);
        continue;
      }

      const archivo = s.archivo;
      const limpio = String(archivo.name || 'soporte').replace(/[^a-zA-Z0-9._-]/g, '_');
      const ruta = `recepciones/${Date.now()}_${limpio}`;

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.storage.from(bucket).upload(ruta, archivo, { upsert: false });
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
  // 4. PERSISTENCIA EN SUPABASE
  // ==================================================================
  async function guardarOperacion() {
    const btn = $('guardarOperacionBtn');
    try {
      const modo = getVal('tipoOperacionInput') || 'Recepcion';
      const origen = getVal('origenInput').trim();
      const material = getVal('materialInput').trim();
      const cantidad = Number(getVal('cantidadInput'));
      const observacion = getVal('observacionInput').trim();
      const estado = getVal('estadoOperacionInput');

      if (!origen || !material || cantidad <= 0) {
        notificar('Complete los campos obligatorios: Origen/Proveedor, Material y Cantidad.');
        return;
      }

      let tipoRecepcion = '';
      let revisadas = 0;
      let novedades = 0;
      let faltantes = 0;
      let pct = '100.0';

      if (modo === 'Recepcion') {
        tipoRecepcion = getVal('tipoEmbalajeInput') || 'Cajas';
        revisadas = Number(getVal('revisadasInput')) || 0;
        novedades = Number(getVal('novedadesInput')) || 0;
        faltantes = Number(getVal('faltantesInput')) || 0;
        pct = cantidad > 0 ? Math.min((revisadas / cantidad) * 100, 100).toFixed(1) : '0.0';
      } else if (modo === 'DevolucionProv') {
        tipoRecepcion = `Devolución Prov: ${getVal('motivoProvInput')}`;
        novedades = cantidad;
      } else if (modo === 'DevolucionProy') {
        tipoRecepcion = `Reintegro Proyecto: ${getVal('motivoProyInput')}`;
      }

      if (btn) btn.disabled = true;

      let pdfUrl = '[]';
      try {
        const subidos = await subirSoportesStorage();
        pdfUrl = JSON.stringify(subidos);
      } catch (err) {
        notificar(err.message, 'error');
        if (btn) btn.disabled = false;
        return;
      }

      const usuario = window.usuarioLogueado?.usuario || 'Usuario';

      const payload = {
        proveedor: origen,
        material: material,
        tipo_recepcion: tipoRecepcion,
        cantidad: cantidad,
        revisadas: revisadas,
        novedades: novedades,
        faltantes: faltantes,
        porcentaje_revisado: pct,
        observacion: observacion,
        comentario_validacion: '',
        seguimiento: `Registro creado por: ${usuario} (${modo})`,
        estado: estado,
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

      notificar('Operación registrada exitosamente', 'success');
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
    setVal('origenInput', '');
    setVal('materialInput', '');
    setVal('cantidadInput', '');
    setVal('revisadasInput', '');
    setVal('novedadesInput', '0');
    setVal('faltantesInput', '0');
    setVal('observacionInput', '');

    const fileInp = $('archivoInput');
    if (fileInp) fileInp.value = '';
    const driveInp = $('driveLinkInput');
    if (driveInp) driveInp.value = '';

    soportesSeleccionados = [];
    renderSoportesPreview();
  }

  // ==================================================================
  // 5. RENDERIZADO DE LAS 3 TABLAS
  // ==================================================================
  window.renderRecepciones = async function (datos = null) {
    const bodyRec = $('recepcionesBody');
    const bodyDevProv = $('devProveedorBody');
    const bodyDevProy = $('devProyectosBody');
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

      // Clasificación de registros
      const recepciones = lista.filter(i => 
        !String(i.tipo_recepcion || '').startsWith('Devolución') && 
        !String(i.tipo_recepcion || '').startsWith('Reintegro')
      );

      const devProveedor = lista.filter(i => 
        String(i.tipo_recepcion || '').startsWith('Devolución')
      );

      const devProyectos = lista.filter(i => 
        String(i.tipo_recepcion || '').startsWith('Reintegro')
      );

      // Tabla 1: Recepciones
      if (recepciones.length === 0) {
        bodyRec.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:26px;color:#64748b;">No hay recepciones de compras registradas.</td></tr>`;
      } else {
        bodyRec.innerHTML = recepciones.map(item => `
          <tr>
            <td><strong>${sanitize(item.proveedor)}</strong></td>
            <td>${sanitize(item.material)}</td>
            <td>${sanitize(item.tipo_recepcion || '-')}</td>
            <td>${item.cantidad || 0}</td>
            <td><strong>${item.porcentaje_revisado || 0}%</strong></td>
            <td>${item.novedades || 0}</td>
            <td><span class="estado-badge estado-gestion">${sanitize(item.estado)}</span></td>
            <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
            <td style="text-align:center;">
              <div class="acciones-tabla-mini">
                <button type="button" class="btn-mini" title="Seguimiento" onclick="window.verGestion(${item.id})">📋</button>
                <button type="button" class="btn-mini" title="Observación" onclick="window.verObservacion(${item.id})">👁️</button>
                <button type="button" class="btn-mini" title="Soportes" onclick="window.verSoportes(${item.id})">📎</button>
                <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarOperacion(${item.id})">🗑️</button>
              </div>
            </td>
          </tr>
        `).join('');
      }

      // Tabla 2: Devoluciones a Proveedor
      if (bodyDevProv) {
        if (devProveedor.length === 0) {
          bodyDevProv.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:#64748b;">No hay devoluciones a proveedores registradas.</td></tr>`;
        } else {
          bodyDevProv.innerHTML = devProveedor.map(item => `
            <tr>
              <td><strong>${sanitize(item.proveedor)}</strong></td>
              <td>${sanitize(item.material)}</td>
              <td><span class="estado-badge estado-cuarentena">${sanitize(item.tipo_recepcion)}</span></td>
              <td><strong>${item.cantidad || 0}</strong></td>
              <td><span class="estado-badge estado-gestion">${sanitize(item.estado)}</span></td>
              <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
              <td style="text-align:center;">
                <div class="acciones-tabla-mini">
                  <button type="button" class="btn-mini" title="Seguimiento" onclick="window.verGestion(${item.id})">📋</button>
                  <button type="button" class="btn-mini" title="Observación" onclick="window.verObservacion(${item.id})">👁️</button>
                  <button type="button" class="btn-mini" title="Soportes" onclick="window.verSoportes(${item.id})">📎</button>
                  <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarOperacion(${item.id})">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('');
        }
      }

      // Tabla 3: Devoluciones de Proyectos
      if (bodyDevProy) {
        if (devProyectos.length === 0) {
          bodyDevProy.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:26px;color:#64748b;">No hay reintegros de proyectos registrados.</td></tr>`;
        } else {
          bodyDevProy.innerHTML = devProyectos.map(item => `
            <tr>
              <td><strong>${sanitize(item.proveedor)}</strong></td>
              <td>${sanitize(item.material)}</td>
              <td><span class="estado-badge estado-proy">${sanitize(item.tipo_recepcion)}</span></td>
              <td><strong>${item.cantidad || 0}</strong></td>
              <td><span class="estado-badge estado-conforme">${sanitize(item.estado)}</span></td>
              <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
              <td style="text-align:center;">
                <div class="acciones-tabla-mini">
                  <button type="button" class="btn-mini" title="Seguimiento" onclick="window.verGestion(${item.id})">📋</button>
                  <button type="button" class="btn-mini" title="Observación" onclick="window.verObservacion(${item.id})">👁️</button>
                  <button type="button" class="btn-mini" title="Soportes" onclick="window.verSoportes(${item.id})">📎</button>
                  <button type="button" class="btn-mini btn-eliminar-mini" title="Eliminar" onclick="window.eliminarOperacion(${item.id})">🗑️</button>
                </div>
              </td>
            </tr>
          `).join('');
        }
      }

      renderResumenMensual(lista);

    } catch (err) {
      console.error(err);
    }
  };

  function renderResumenMensual(lista) {
    const body = $('dashboardRecepcionBody');
    if (!body) return;

    const meses = {};
    lista.forEach(item => {
      const fecha = item.created_at ? new Date(item.created_at) : new Date();
      const mes = fecha.toLocaleString('es-CO', { month: 'long' });
      if (!meses[mes]) meses[mes] = { recs: 0, falt: 0, sobr: 0, dan: 0, tot: 0 };

      meses[mes].recs += 1;
      meses[mes].falt += Number(item.faltantes) || 0;
      meses[mes].dan += Number(item.novedades) || 0;
      meses[mes].tot += 1;
    });

    body.innerHTML = Object.keys(meses).map(m => `
      <tr>
        <td><strong>${m.toUpperCase()}</strong></td>
        <td>${meses[m].recs}</td>
        <td><strong style="color:#DC2626">${meses[m].falt}</strong></td>
        <td>${meses[m].sobr}</td>
        <td><strong style="color:#D97706">${meses[m].dan}</strong></td>
        <td><strong>${meses[m].tot}</strong></td>
      </tr>
    `).join('');
  }

  // ==================================================================
  // 6. ACCIONES: OBSERVACIÓN, SOPORTES, SEGUIMIENTO Y ELIMINACIÓN
  // ==================================================================
  window.verObservacion = function (id) {
    const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
    const cont = $('contenidoObservacion');
    if (cont) cont.innerText = item?.observacion || 'Sin observaciones registradas.';
    window.abrirModal('modalObservacion');
  };

  window.verSoportes = function (id) {
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
      cont.innerHTML = '<div class="rec-vacio-txt">No hay soportes anexados a este registro.</div>';
    } else {
      cont.innerHTML = soportes.map(s => `
        <div class="adjunto-item" style="margin-bottom:8px;">
          <span>${s.tipo === 'drive' ? '🔗' : '📄'} ${sanitize(s.nombre)}</span>
          <button type="button" class="btn-rec-subir" onclick="window.open('${s.url}', '_blank')">Abrir</button>
        </div>
      `).join('');
    }

    window.abrirModal('modalSoportesRecepcion');
  };

  window.verGestion = async function (id) {
    window.recepcionGestionando = Number(id);
    const item = window.recepcionesCacheDatos.find(i => i.id === Number(id));
    if (!item) return;

    setVal('gestionEstadoInput', item.estado || 'Pendiente');
    setVal('gestionComentarioInput', '');

    const timeline = $('timelineSeguimiento');
    if (timeline) {
      timeline.innerHTML = `<div style="padding:14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;line-height:1.6;font-size:13px;white-space:pre-wrap;">${sanitize(item.seguimiento || 'Sin intervenciones registradas.')}</div>`;
    }

    window.abrirModal('modalGestion');
  };

  async function guardarSeguimiento() {
    const btn = $('guardarGestionBtn');
    try {
      const comentario = getVal('gestionComentarioInput').trim();
      const estado = getVal('gestionEstadoInput');
      if (!comentario || !window.recepcionGestionando) return;

      if (btn) btn.disabled = true;

      const item = window.recepcionesCacheDatos.find(i => i.id === window.recepcionGestionando);
      const usuario = window.usuarioLogueado?.usuario || 'Compras';
      const entrada = `\n━━━━━━━━━━━━━━━━━━\n📅 ${new Date().toLocaleString('es-CO')}\n👤 ${usuario}\n🏷️ ${estado}\n📝 ${comentario}\n`;

      if (window.supabaseClient) {
        await window.supabaseClient
          .from('recepciones')
          .update({
            estado: estado,
            seguimiento: (item?.seguimiento || '') + entrada
          })
          .eq('id', window.recepcionGestionando);
      }

      window.cerrarModalGestion();
      await window.renderRecepciones();
      await window.actualizarKPIsRecepcion();
      notificar('Seguimiento guardado exitosamente.', 'success');

    } catch (e) {
      console.error(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.eliminarOperacion = async function (id) {
    if (!confirm('¿Desea eliminar definitivamente este registro y sus soportes?')) return;

    if (window.supabaseClient) {
      await window.supabaseClient.from('recepciones').delete().eq('id', Number(id));
    }

    window.recepcionesCacheDatos = window.recepcionesCacheDatos.filter(i => i.id !== Number(id));
    await window.renderRecepciones();
    await window.actualizarKPIsRecepcion();
    notificar('Registro eliminado.', 'success');
  };

  // ==================================================================
  // 7. KPIS CON DEVOLUCIONES DE PROVEEDORES Y PROYECTOS
  // ==================================================================
  window.actualizarKPIsRecepcion = async function () {
    try {
      let lista = window.recepcionesCacheDatos;
      if (window.supabaseClient && lista.length === 0) {
        const { data } = await window.supabaseClient.from('recepciones').select('*');
        lista = data || [];
        window.recepcionesCacheDatos = lista;
      }

      let countRec = 0;
      let countDevProv = 0;
      let countDevProy = 0;
      let countNov = 0;

      lista.forEach(i => {
        const t = String(i.tipo_recepcion || '');
        if (t.startsWith('Devolución')) {
          countDevProv++;
        } else if (t.startsWith('Reintegro')) {
          countDevProy++;
        } else {
          countRec++;
        }

        if (Number(i.novedades) > 0 || Number(i.faltantes) > 0 || String(i.estado || '').includes('Gestión')) {
          countNov++;
        }
      });

      if ($('kpiRecepciones')) $('kpiRecepciones').innerText = countRec.toLocaleString();
      if ($('kpiDevolucionesProv')) $('kpiDevolucionesProv').innerText = countDevProv.toLocaleString();
      if ($('kpiDevolucionesProy')) $('kpiDevolucionesProy').innerText = countDevProy.toLocaleString();
      if ($('kpiNovedades')) $('kpiNovedades').innerText = countNov.toLocaleString();

    } catch (e) {
      console.error(e);
    }
  };

  // ==================================================================
  // 8. LISTENERS CON REGISTRO ÚNICO
  // ==================================================================
  document.addEventListener('click', function (e) {
    // Cambio de pestañas
    const tabBtn = e.target.closest('.rec-tab-btn');
    if (tabBtn) {
      const target = tabBtn.dataset.tab;
      document.querySelectorAll('.rec-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.rec-tab-content').forEach(c => c.classList.remove('active'));

      tabBtn.classList.add('active');
      const panel = $(target);
      if (panel) panel.classList.add('active');
    }

    if (e.target.closest('#btnAgregarDrive')) {
      agregarDrive();
    }
    if (e.target.closest('#guardarOperacionBtn')) {
      guardarOperacion();
    }
    if (e.target.closest('#guardarGestionBtn')) {
      guardarSeguimiento();
    }
  });

  const fileInput = $('archivoInput');
  if (fileInput) {
    fileInput.onchange = ev => {
      agregarArchivos(ev.target.files);
      ev.target.value = '';
    };
  }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'buscadorRecepcion') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        window.renderRecepciones(window.recepcionesCacheDatos);
        return;
      }
      const filtrados = (window.recepcionesCacheDatos || []).filter(i =>
        String(i.proveedor || '').toLowerCase().includes(q) ||
        String(i.material || '').toLowerCase().includes(q) ||
        String(i.tipo_recepcion || '').toLowerCase().includes(q) ||
        String(i.estado || '').toLowerCase().includes(q)
      );
      window.renderRecepciones(filtrados);
    }
  });

  // Inicialización de la pantalla
  window.renderRecepciones();
  window.actualizarKPIsRecepcion();
})();
