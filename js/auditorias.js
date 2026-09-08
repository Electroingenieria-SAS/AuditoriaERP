/**
 * ====================================================================
 * AUDITORIAS.JS — Módulo Integral Multi-Área
 * ====================================================================
 */

(function () {
  'use strict';

  const AUDITORIAS_BUCKET = window.ERP_CONFIG?.STORAGE_BUCKETS?.AUDITORIAS || 'auditorias';
  const ADJUNTOS = window.AdjuntosCommon;

  let auditoriasCache = [];
  let documentosSeleccionados = [];
  let categoriaActiva = 'Logística';

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
    } else {
      alert(mensaje);
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

  // ==================================================================
  // DEFINICIÓN DE LOS FORMULARIOS ESPECÍFICOS POR ÁREA
  // ==================================================================
  const FORMULARIOS_POR_AREA = {
    'Logística': [
      { id: 'esp_bodega', label: 'Bodega / Centro de Distribución', type: 'text', placeholder: 'ej. Bodega Principal 1' },
      { id: 'esp_tipo_conteo', label: 'Tipo de Conteo', type: 'select', options: ['Cíclico', 'General', 'Aleatorio / Sorpresa'] },
      { id: 'esp_discrepancia', label: 'Nivel de Discrepancia', type: 'select', options: ['Ninguna (100% Exacto)', 'Leve (< 2%)', 'Crítica (> 5%)'] }
    ],
    'Contabilidad': [
      { id: 'esp_cuenta_contable', label: 'Cuenta / Rubro Contable', type: 'text', placeholder: 'ej. 1105 Caja / 2205 Proveedores' },
      { id: 'esp_conciliacion', label: 'Conciliación Bancaria', type: 'select', options: ['Conciliado', 'Partidas Pendientes', 'Diferencia en Libros'] },
      { id: 'esp_periodo_fiscal', label: 'Mes / Período Fiscal', type: 'text', placeholder: 'ej. Septiembre 2026' }
    ],
    'Compras': [
      { id: 'esp_orden_compra', label: 'Número de Orden de Compra (OC)', type: 'text', placeholder: 'ej. OC-8849' },
      { id: 'esp_proveedor', label: 'Nombre del Proveedor', type: 'text', placeholder: 'ej. Distribuidora Eléctrica S.A.S.' },
      { id: 'esp_cumplimiento_oc', label: 'Cumplimiento de Precios / Tiempos', type: 'select', options: ['Conforme', 'Sobreprecio no autorizado', 'Retraso de entrega'] }
    ],
    'Ventas': [
      { id: 'esp_factura_pedido', label: 'N° Factura o Pedido', type: 'text', placeholder: 'ej. FAC-1029' },
      { id: 'esp_cliente', label: 'Cliente', type: 'text', placeholder: 'ej. Consorcio Alumbrado del Valle' },
      { id: 'esp_cartera_estado', label: 'Estado de Cartera / Cobro', type: 'select', options: ['Al día', 'Vencida 30-60 días', 'Incumplimiento de cupo'] }
    ],
    'TI': [
      { id: 'esp_sistema_auditado', label: 'Servidor / Aplicación / Red', type: 'text', placeholder: 'ej. Base de Datos ERP / Red Wi-Fi' },
      { id: 'esp_backup_status', label: 'Copia de Seguridad (Backup)', type: 'select', options: ['Verificado y Restaurable', 'Incompleto', 'Fallido / No existe'] },
      { id: 'esp_vulnerabilidad', label: 'Nivel de Vulnerabilidad', type: 'select', options: ['Baja', 'Media', 'Crítica / Requiere Parche Inmediato'] }
    ],
    'Mantenimiento': [
      { id: 'esp_equipo', label: 'Equipo / Vehículo / Maquinaria', type: 'text', placeholder: 'ej. Grúa Canastilla Placa ABC-123' },
      { id: 'esp_tipo_mtto', label: 'Tipo de Mantenimiento', type: 'select', options: ['Preventivo Periódico', 'Correctivo por Falla', 'Calibración Pericial'] },
      { id: 'esp_hoja_vida', label: 'Hoja de Vida y Bitácora', type: 'select', options: ['Actualizada al día', 'Desactualizada', 'Sin registro'] }
    ],
    'Recursos Humanos': [
      { id: 'esp_empleado_cargo', label: 'Colaborador / Cargo Evaluado', type: 'text', placeholder: 'ej. Técnico Electricista Liniero' },
      { id: 'esp_afiliaciones', label: 'Afiliaciones EPS / ARL / Pensión', type: 'select', options: ['Vigente y al día', 'Mora en pago', 'Inconsistencia en nivel de riesgo'] },
      { id: 'esp_dotacion', label: 'Entrega y Firma de Dotación', type: 'select', options: ['Conforme', 'Pendiente entrega', 'Sin registro firmado'] }
    ],
    'Proyectos': [
      { id: 'esp_nombre_obra', label: 'Nombre de la Obra o Contrato', type: 'text', placeholder: 'ej. Modernización Alumbrado Vía Principal' },
      { id: 'esp_avance_fisico', label: '% Avance Físico Estimado', type: 'number', placeholder: 'ej. 75' },
      { id: 'esp_cronograma_status', label: 'Desviación de Cronograma', type: 'select', options: ['A tiempo según programa', 'Retraso justificado', 'Retraso crítico (> 15 días)'] }
    ],
    'Alumbrado Público': [
      { id: 'esp_circuito_tramo', label: 'Circuito / Transformador / Tramo', type: 'text', placeholder: 'ej. Circuito 14 - Carrera 28' },
      { id: 'esp_tipo_luminaria', label: 'Tecnología de Luminaria', type: 'select', options: ['LED Alta Eficiencia', 'Vapor de Sodio 70W-150W', 'Halogenuro Metálico'] },
      { id: 'esp_luminarias_revisadas', label: 'Cantidad Luminarias Verificadas', type: 'number', placeholder: 'ej. 45' },
      { id: 'esp_lux_potencia', label: 'Nivel Lumínico / Medición de Luxes', type: 'text', placeholder: 'ej. 28 Lux promedio (Conforme RETILAP)' }
    ],
    'Salud Ocupacional': [
      { id: 'esp_area_inspeccion', label: 'Puesto de Trabajo / Frente de Obra', type: 'text', placeholder: 'ej. Trabajo en Alturas Poste 45' },
      { id: 'esp_epp_status', label: 'Uso y Estado de EPP / Arnés', type: 'select', options: ['100% Conforme y Certificado', 'Uso incompleto de EPP', 'Equipo vencido o con desgaste'] },
      { id: 'esp_permiso_alturas', label: 'Permiso de Trabajo en Alturas / ATS', type: 'select', options: ['Diligenciado y Aprobado', 'Incompleto', 'No generado en sitio'] }
    ]
  };

  // ==================================================================
  // CAMBIO DINÁMICO DE CATEGORÍA
  // ==================================================================
  function cambiarCategoria(nuevaCat, elementoBoton) {
    categoriaActiva = nuevaCat;

    // Actualizar botones del menú lateral
    document.querySelectorAll('.audit-nav-item').forEach(b => b.classList.remove('active'));
    if (elementoBoton) elementoBoton.classList.add('active');

    // Actualizar Header
    const icon = elementoBoton?.dataset.icon || '📋';
    const desc = elementoBoton?.dataset.desc || '';

    $('headerCategoriaIcono').innerText = icon;
    $('headerCategoriaTitulo').innerText = `Auditoría de ${nuevaCat}`;
    $('headerCategoriaDesc').innerText = desc;
    $('badgeAreaActiva').innerText = `Área: ${nuevaCat}`;

    $('formCardIcon').innerText = icon;
    $('formCardTitulo').innerText = `Registrar Auditoría de ${nuevaCat}`;
    $('tablaHistorialTitulo').innerText = `Historial de Auditorías (${nuevaCat})`;

    renderizarCamposDinamicos(nuevaCat);
    filtrarTablaPorCategoria();
  }

  function renderizarCamposDinamicos(categoria) {
    const contenedor = $('camposEspecificosContainer');
    if (!contenedor) return;

    const campos = FORMULARIOS_POR_AREA[categoria] || [];
    if (campos.length === 0) {
      contenedor.innerHTML = '<p style="color:#64748b;font-size:13px;">No se requieren parámetros adicionales para esta área.</p>';
      return;
    }

    contenedor.innerHTML = campos.map(campo => {
      if (campo.type === 'select') {
        const opciones = campo.options.map(o => `<option value="${sanitize(o)}">${sanitize(o)}</option>`).join('');
        return `
          <div class="input-group">
            <label for="${campo.id}">${campo.label}</label>
            <select id="${campo.id}">${opciones}</select>
          </div>
        `;
      } else {
        return `
          <div class="input-group">
            <label for="${campo.id}">${campo.label}</label>
            <input id="${campo.id}" type="${campo.type}" placeholder="${campo.placeholder || ''}">
          </div>
        `;
      }
    }).join('');
  }

  function recolectarDatosEspecificos() {
    const campos = FORMULARIOS_POR_AREA[categoriaActiva] || [];
    const datos = {};
    campos.forEach(c => {
      datos[c.label] = getVal(c.id);
    });
    return datos;
  }

  // ==================================================================
  // GESTIÓN DE DOCUMENTOS Y SUBIDA A SUPABASE STORAGE
  // ==================================================================
  function totalDocumentos() {
    return documentosSeleccionados.length;
  }

  function agregarDocumentosCreacion(archivos) {
    const max = 10;
    for (const archivo of Array.from(archivos || [])) {
      if (totalDocumentos() >= max) {
        notificar(`Límite de documentos: Máximo ${max}.`);
        break;
      }
      documentosSeleccionados.push({
        tipo: 'archivo',
        archivo: archivo,
        nombre: archivo.name,
        mime: archivo.type || '',
        tamano: archivo.size
      });
    }
    renderDocumentosCreacion();
  }

  function agregarDriveCreacion() {
    const input = $('driveLinkAuditoria');
    if (!input) return;
    const url = input.value.trim();

    if (!url || !url.startsWith('https://')) {
      notificar('Pegue un enlace válido de Google Drive/Docs.');
      return;
    }

    documentosSeleccionados.push({
      tipo: 'drive',
      nombre: `Enlace Drive #${totalDocumentos() + 1}`,
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
    if (contador) contador.textContent = `${totalDocumentos()} / 10`;
    if (!lista) return;

    if (documentosSeleccionados.length === 0) {
      lista.innerHTML = '<div class="documento-vacio">📄 Ningún documento adjuntado para esta auditoría.</div>';
      return;
    }

    lista.innerHTML = documentosSeleccionados.map((doc, idx) => `
      <div class="adjunto-item">
        <div class="adjunto-item__info">
          <span class="adjunto-item__icono">${doc.tipo === 'drive' ? '🔗' : '📄'}</span>
          <span class="adjunto-item__nombre">${sanitize(doc.nombre)}</span>
        </div>
        <button type="button" class="adjunto-btn--eliminar" onclick="window.eliminarDocTemp(${idx})">Quitar</button>
      </div>
    `).join('');
  }

  window.eliminarDocTemp = function (idx) {
    documentosSeleccionados.splice(Number(idx), 1);
    renderDocumentosCreacion();
  };

  async function subirArchivos() {
    const guardados = [];
    for (const doc of documentosSeleccionados) {
      if (doc.tipo === 'drive') {
        guardados.push(doc);
        continue;
      }

      const archivo = doc.archivo;
      const limpio = String(archivo.name || 'doc').replace(/[^a-zA-Z0-9._-]/g, '_');
      const ruta = `auditorias/${Date.now()}_${limpio}`;

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.storage
          .from(AUDITORIAS_BUCKET)
          .upload(ruta, archivo, { upsert: false });

        if (error) throw new Error(`Error al subir ${archivo.name}: ${error.message}`);
        const urlData = window.supabaseClient.storage.from(AUDITORIAS_BUCKET).getPublicUrl(ruta);

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
  // GUARDAR AUDITORÍA EN SUPABASE
  // ==================================================================
  async function guardarAuditoria() {
    const btn = $('guardarAuditoria');
    try {
      const responsable = getVal('responsableInput').trim();
      const nombre = getVal('nombreInput').trim();
      const fecha = getVal('fechaInput') || obtenerFechaHoy();
      const proceso = getVal('procesoInput').trim();
      const estado = getVal('estadoInput') || 'Pendiente';
      const observaciones = getVal('observacionesInput').trim();
      const datosEspecificos = recolectarDatosEspecificos();

      if (!responsable || !nombre || !proceso) {
        notificar('Por favor complete: Responsable, Nombre de la auditoría y Proceso.');
        return;
      }

      if (btn) btn.disabled = true;

      let pdfUrl = '[]';
      try {
        const subidos = await subirArchivos();
        pdfUrl = JSON.stringify(subidos);
      } catch (err) {
        notificar(err.message, 'error');
        if (btn) btn.disabled = false;
        return;
      }

      const usuario = window.usuarioLogueado?.usuario || 'Sistema';

      const payload = {
        categoria: categoriaActiva,
        tipo: categoriaActiva,
        nombre,
        responsable,
        fecha,
        proceso,
        estado,
        observaciones,
        datos_especificos: datosEspecificos,
        pdf_url: pdfUrl,
        usuario,
        created_at: new Date().toISOString()
      };

      if (window.supabaseClient) {
        const { error } = await window.supabaseClient.from('auditorias').insert([payload]);
        if (error) {
          notificar('Error en base de datos: ' + error.message, 'error');
          if (btn) btn.disabled = false;
          return;
        }
      }

      notificar(`Auditoría de ${categoriaActiva} guardada exitosamente.`, 'success');
      limpiarFormulario();
      await cargarAuditorias();

    } catch (e) {
      console.error(e);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function limpiarFormulario() {
    setVal('responsableInput', '');
    setVal('nombreInput', '');
    setVal('fechaInput', obtenerFechaHoy());
    setVal('procesoInput', '');
    setVal('estadoInput', 'Pendiente');
    setVal('observacionesInput', '');
    renderizarCamposDinamicos(categoriaActiva);
    documentosSeleccionados = [];
    renderDocumentosCreacion();
  }

  // ==================================================================
  // HISTORIAL Y DETALLES
  // ==================================================================
  async function cargarAuditorias() {
    if (!window.supabaseClient) return;
    try {
      const { data, error } = await window.supabaseClient
        .from('auditorias')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error(error);
        return;
      }

      auditoriasCache = data || [];
      filtrarTablaPorCategoria();
    } catch (err) {
      console.error(err);
    }
  }

  function filtrarTablaPorCategoria() {
    const filtrados = auditoriasCache.filter(a => (a.categoria || a.tipo) === categoriaActiva);
    renderTabla(filtrados);
  }

  function renderTabla(lista) {
    const body = $('auditoriasBody');
    if (!body) return;

    if (lista.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:26px;color:#64748B;">No hay auditorías registradas para ${categoriaActiva}.</td></tr>`;
      return;
    }

    body.innerHTML = lista.map(item => `
      <tr>
        <td><strong>${sanitize(item.categoria || item.tipo)}</strong></td>
        <td>${sanitize(item.nombre)}</td>
        <td>${sanitize(item.responsable)}</td>
        <td><span class="estado-pendiente">${sanitize(item.estado)}</span></td>
        <td>${formatearFecha(item.fecha)}</td>
        <td style="text-align:center;">
          <button type="button" class="btn-mini" onclick="window.verDetalle(${item.id})">👁️ Ver</button>
        </td>
      </tr>
    `).join('');
  }

  window.verDetalle = function (id) {
    const a = auditoriasCache.find(x => x.id === Number(id));
    if (!a) return;

    $('detalleCategoria').innerText = a.categoria || a.tipo;
    $('detalleEstado').innerText = a.estado;
    $('detalleNombre').innerText = a.nombre;
    $('detalleResponsable').innerText = a.responsable;
    $('detalleProceso').innerText = a.proceso;
    $('detalleFecha').innerText = formatearFecha(a.fecha);
    $('detalleObservaciones').innerText = a.observaciones || 'Sin observaciones.';

    const contenedorEsp = $('detalleDatosEspecificos');
    const datos = a.datos_especificos || {};
    const keys = Object.keys(datos);

    if (keys.length === 0) {
      contenedorEsp.innerHTML = '<span style="color:#94a3b8;font-size:12px;">Sin parámetros especiales.</span>';
    } else {
      contenedorEsp.innerHTML = keys.map(k => `
        <div class="detalle-dato-item">
          <small>${sanitize(k)}</small>
          <strong>${sanitize(datos[k] || '-')}</strong>
        </div>
      `).join('');
    }

    $('modalDetalleAuditoria').style.display = 'flex';
  };

  // ==================================================================
  // LISTENERS
  // ==================================================================
  document.addEventListener('click', function (e) {
    // Menú lateral
    const navItem = e.target.closest('.audit-nav-item');
    if (navItem) {
      cambiarCategoria(navItem.dataset.cat, navItem);
    }

    if (e.target.closest('#cerrarDetalleAuditoria')) {
      $('modalDetalleAuditoria').style.display = 'none';
    }

    if (e.target.closest('#btnAgregarDocumento')) {
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
      agregarDriveCreacion();
    }

    if (e.target.closest('#guardarAuditoria')) {
      guardarAuditoria();
    }
  });

  // Inicialización
  setVal('fechaInput', obtenerFechaHoy());
  renderizarCamposDinamicos('Logística');
  cargarAuditorias();
})();
