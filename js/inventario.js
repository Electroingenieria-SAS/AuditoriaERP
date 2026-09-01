/**
 * ====================================================================
 * INVENTARIO.JS — Módulo de Inventario Físico, Conteos & Novedades
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  // Estado del Módulo
  window.inventarioCache = [];
  window.historialConteos = [];
  window.productoActual = null;
  window.novedadEliminarId = null;

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

  function extraerStock(item) {
    if (!item) return 0;
    const val = item.stock ?? item.cantidad ?? item.stock_sistema ?? item.saldo ?? item.cantidad_teorica ?? item.Stock ?? item.STOCK ?? item.Cantidad ?? item.CANTIDAD ?? 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }

  function notificar(mensaje, tipo = 'warning', titulo = 'Inventario') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(titulo, mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  // ==================================================================
  // 1. CARGA Y SINCRONIZACIÓN DE INVENTARIO (SUPABASE)
  // ==================================================================
  window.cargarInventarioBD = async function () {
    if (!window.supabaseClient) {
      window.inventarioCache = JSON.parse(localStorage.getItem('inventario')) || [];
      window.renderInventario();
      window.actualizarKPIs();
      return;
    }

    try {
      const TAMANO_PAGINA = 1000;
      let desde = 0;
      let todos = [];

      while (true) {
        const { data, error } = await window.supabaseClient
          .from('inventario')
          .select('*')
          .order('codigo')
          .range(desde, desde + TAMANO_PAGINA - 1);

        if (error) {
          console.error('Error cargando inventario:', error.message);
          break;
        }

        if (!data || data.length === 0) break;
        todos = todos.concat(data);
        if (data.length < TAMANO_PAGINA) break;
        desde += TAMANO_PAGINA;
      }

      window.inventarioCache = todos;
      localStorage.setItem('inventario', JSON.stringify(todos));
      window.renderInventario();
      window.actualizarKPIs();
      await window.cargarNovedadesBD();
    } catch (err) {
      console.error('Excepción en cargarInventarioBD:', err);
    }
  };

  // ==================================================================
  // 2. LECTURA Y CARGA DE EXCEL
  // ==================================================================
  async function leerExcel(e) {
    try {
      if (typeof window.tienePermiso === 'function' && !window.tienePermiso('inventario', 'crear')) {
        notificar('Acceso denegado: No cuenta con permisos para cargar inventarios.');
        return;
      }

      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async function (event) {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (!json || json.length === 0) {
            notificar('El archivo Excel está vacío o no tiene el formato esperado.');
            return;
          }

          const normalizados = json.map(item => {
            const codigo = String(item.Codigo || item.CODIGO || item.codigo || item.Referencia || item.REFERENCIA || item.Item || item.ITEM || '').trim();
            const producto = String(item.Producto || item.PRODUCTO || item.producto || item.Descripcion || item.DESCRIPCION || item.Material || item.MATERIAL || '').trim();
            const ubicacion = String(item.Ubicacion || item.UBICACION || item.ubicacion || item.Bodega || item.BODEGA || 'Principal').trim();
            const stock = extraerStock(item);

            return {
              codigo,
              producto: producto || codigo,
              ubicacion,
              stock_sistema: stock,
              conteo_fisico: null,
              diferencia: null,
              estado: 'Pendiente',
              usuario: window.usuarioLogueado?.usuario || 'Sistema'
            };
          }).filter(i => i.codigo);

          if (normalizados.length === 0) {
            notificar('No se detectaron columnas válidas (Código, Producto, Stock).');
            return;
          }

          if (window.supabaseClient) {
            const LOTE = 200;
            for (let i = 0; i < normalizados.length; i += LOTE) {
              const chunk = normalizados.slice(i, i + LOTE);
              await window.supabaseClient.from('inventario').upsert(chunk, { onConflict: 'codigo' });
            }
          }

          window.inventarioCache = normalizados;
          localStorage.setItem('inventario', JSON.stringify(normalizados));

          if (typeof window.guardarHistorial === 'function') {
            await window.guardarHistorial('CARGA_EXCEL', 'INVENTARIO', `Carga de archivo Excel con ${normalizados.length} productos`);
          }

          if (typeof window.crearNotificacion === 'function') {
            window.crearNotificacion(`📦 Inventario cargado exitosamente: ${normalizados.length} productos listos para conteo.`, 'success');
          }

          window.renderInventario();
          window.actualizarKPIs();
          notificar(`Se cargaron ${normalizados.length} productos con éxito.`, 'success');

        } catch (err) {
          console.error('Error procesando Excel:', err);
          notificar('Error al procesar la estructura del Excel.', 'error');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error(e);
    }
  }

  // ==================================================================
  // 3. BUSCADOR Y REGISTRO DE CONTEO FÍSICO
  // ==================================================================
  function buscarProducto() {
    const cod = getVal('codigoInput').trim().toUpperCase();
    if (!cod) {
      notificar('Ingrese un código de producto para consultar.');
      return;
    }

    const prod = window.inventarioCache.find(p => String(p.codigo).toUpperCase() === cod);

    if (!prod) {
      window.productoActual = null;
      setVal('codigoProducto', '-');
      setVal('nombreProducto', '-');
      setVal('ubicacionProducto', '-');
      setVal('stockProducto', '-');
      $('resultadoTexto').innerText = '-';
      notificar(`El código "${cod}" no existe en el inventario cargado.`);
      return;
    }

    const stockTeorico = extraerStock(prod);
    window.productoActual = { ...prod, stock_sistema: stockTeorico };

    $('codigoProducto').innerText = prod.codigo;
    $('nombreProducto').innerText = prod.producto || '-';
    $('ubicacionProducto').innerText = prod.ubicacion || 'General';
    $('stockProducto').innerText = stockTeorico;

    const fisico = getVal('conteoFisico').trim();
    if (fisico !== '') {
      const diff = Number(fisico) - stockTeorico;
      $('resultadoTexto').innerText = diff > 0 ? `+${diff} (Sobrante)` : diff < 0 ? `${diff} (Faltante)` : '0 (Exacto)';
      $('resultadoTexto').style.color = diff === 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#f59e0b';
    } else {
      $('resultadoTexto').innerText = 'Esperando conteo...';
      $('resultadoTexto').style.color = '#64748b';
    }

    $('conteoFisico').focus();
  }

  async function registrarConteo() {
    if (!window.productoActual) {
      buscarProducto();
      if (!window.productoActual) return;
    }

    const valorFisico = getVal('conteoFisico').trim();
    if (valorFisico === '') {
      notificar('Ingrese el valor del conteo físico.');
      return;
    }

    const conteoFisico = Number(valorFisico);
    const stockSistema = extraerStock(window.productoActual);
    const diferencia = conteoFisico - stockSistema;
    const estado = diferencia === 0 ? 'Exacto' : diferencia < 0 ? 'Faltante' : 'Sobrante';

    const itemActualizado = {
      ...window.productoActual,
      stock_sistema: stockSistema,
      conteo_fisico: conteoFisico,
      diferencia: diferencia,
      estado: estado,
      usuario: window.usuarioLogueado?.usuario || 'Sistema'
    };

    // Actualizar cache local
    const idx = window.inventarioCache.findIndex(p => p.codigo === window.productoActual.codigo);
    if (idx > -1) {
      window.inventarioCache[idx] = itemActualizado;
    }
    localStorage.setItem('inventario', JSON.stringify(window.inventarioCache));

    // Agregar a historial de conteos
    window.historialConteos.unshift({
      codigo: itemActualizado.codigo,
      producto: itemActualizado.producto,
      sistema: stockSistema,
      fisico: conteoFisico,
      diferencia: diferencia,
      estado: estado,
      fecha: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    });

    // Persistir en Supabase
    if (window.supabaseClient) {
      try {
        await window.supabaseClient
          .from('inventario')
          .update({
            conteo_fisico: conteoFisico,
            diferencia: diferencia,
            estado: estado,
            usuario: window.usuarioLogueado?.usuario || 'Sistema'
          })
          .eq('codigo', itemActualizado.codigo);
      } catch (err) {
        console.warn('Error persistiendo conteo en BD:', err);
      }
    }

    $('resultadoTexto').innerText = diferencia > 0 ? `+${diferencia} (Sobrante)` : diferencia < 0 ? `${diferencia} (Faltante)` : '0 (Exacto)';
    $('resultadoTexto').style.color = diferencia === 0 ? '#10b981' : diferencia < 0 ? '#ef4444' : '#f59e0b';

    setVal('codigoInput', '');
    setVal('conteoFisico', '');
    window.productoActual = null;
    $('codigoInput').focus();

    window.renderHistorial();
    window.renderInventario();
    window.actualizarKPIs();
    notificar(`Conteo registrado para "${itemActualizado.codigo}": ${estado} (${diferencia})`, 'success');
  }

  // ==================================================================
  // 4. REPORTAR NOVEDAD DE INVENTARIO
  // ==================================================================
  window.abrirModalNovedad = function () {
    if (window.productoActual) {
      setVal('novedadCodigo', window.productoActual.codigo);
      setVal('novedadMaterial', window.productoActual.producto);
      setVal('novedadSistema', extraerStock(window.productoActual));
      setVal('novedadFisico', getVal('conteoFisico') || 0);
      window.calcularDiferenciaNovedad();
    } else {
      setVal('novedadCodigo', '');
      setVal('novedadMaterial', '');
      setVal('novedadSistema', '0');
      setVal('novedadFisico', '0');
      setVal('novedadDiferencia', '0');
    }
    setVal('novedadObservacion', '');
    const m = $('modalNovedadInventario');
    if (m) m.classList.add('active');
  };

  window.cerrarModalNovedad = function () {
    const m = $('modalNovedadInventario');
    if (m) m.classList.remove('active');
  };

  window.calcularDiferenciaNovedad = function () {
    const s = Number(getVal('novedadSistema')) || 0;
    const f = Number(getVal('novedadFisico')) || 0;
    const d = f - s;
    setVal('novedadDiferencia', d);
  };

  async function guardarNovedad() {
    const codigo = getVal('novedadCodigo').trim();
    const material = getVal('novedadMaterial').trim();
    const sistema = Number(getVal('novedadSistema')) || 0;
    const fisico = Number(getVal('novedadFisico')) || 0;
    const diferencia = Number(getVal('novedadDiferencia')) || 0;
    const tipo = getVal('novedadTipo');
    const observacion = getVal('novedadObservacion').trim();

    if (!codigo || !material) {
      notificar('Complete el código y material para reportar la novedad.');
      return;
    }

    const payload = {
      codigo,
      material,
      stock_sistema: sistema,
      conteo_fisico: fisico,
      diferencia,
      tipo,
      usuario: window.usuarioLogueado?.usuario || 'Sistema',
      observacion,
      estado: 'Pendiente',
      created_at: new Date().toISOString()
    };

    if (window.supabaseClient) {
      const { error } = await window.supabaseClient.from('novedades_inventario').insert([payload]);
      if (error) {
        notificar('Error guardando novedad: ' + error.message, 'error');
        return;
      }
    }

    if (typeof window.crearNotificacion === 'function') {
      window.crearNotificacion(`⚠️ Novedad reportada: ${codigo} - ${tipo} (${observacion})`, 'warning');
    }

    window.cerrarModalNovedad();
    await window.cargarNovedadesBD();
    notificar('Novedad reportada exitosamente.', 'success');
  }

  window.cargarNovedadesBD = async function () {
    const body = $('novedadesBody');
    if (!body) return;

    if (!window.supabaseClient) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px;">Sin conexión</td></tr>`;
      return;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('novedades_inventario')
        .select('*')
        .order('id', { ascending: false });

      if (error || !data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px;">No hay novedades reportadas.</td></tr>`;
        return;
      }

      body.innerHTML = data.map(item => `
        <tr>
          <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
          <td><strong>${sanitize(item.codigo)}</strong></td>
          <td>${sanitize(item.material)}</td>
          <td><span class="badge-novedad">${sanitize(item.tipo)}</span></td>
          <td>${item.stock_sistema}</td>
          <td>${item.conteo_fisico}</td>
          <td>${sanitize(item.usuario || 'Sistema')}</td>
          <td>
            <button type="button" class="btn-mini" onclick="window.verObsNovedad('${encodeURIComponent(item.observacion || '')}')">👁️</button>
          </td>
          <td>
            <button type="button" class="btn-mini btn-eliminar-mini" onclick="window.eliminarNovedad(${item.id})">🗑️</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  };

  window.verObsNovedad = function (obsEnc) {
    const obs = decodeURIComponent(obsEnc);
    const modal = $('modalObservacion');
    const texto = $('textoObservacion');
    if (texto) texto.innerText = obs || 'Sin observaciones adicionales.';
    if (modal) modal.style.display = 'flex';
  };

  window.cerrarObservacion = function () {
    const modal = $('modalObservacion');
    if (modal) modal.style.display = 'none';
  };

  window.eliminarNovedad = async function (id) {
    if (!confirm('¿Desea eliminar este registro de novedad?')) return;
    if (window.supabaseClient) {
      await window.supabaseClient.from('novedades_inventario').delete().eq('id', Number(id));
    }
    await window.cargarNovedadesBD();
    notificar('Novedad eliminada.', 'success');
  };

  // ==================================================================
  // 5. RENDERIZADO DE TABLAS Y KPIS (TOLERANTE A SCHEMAS)
  // ==================================================================
  window.renderInventario = function (datos = null) {
    const body = $('inventarioBody');
    if (!body) return;

    const lista = datos || window.inventarioCache || [];

    if (lista.length === 0) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:25px;color:#94a3b8;">No hay productos cargados en inventario</td></tr>`;
      return;
    }

    const mostrar = lista.slice(0, 200);

    body.innerHTML = mostrar.map(item => {
      const stockValor = extraerStock(item);

      return `
        <tr>
          <td><strong>${sanitize(item.codigo)}</strong></td>
          <td>${sanitize(item.producto || item.descripcion || item.material || item.codigo)}</td>
          <td>${sanitize(item.ubicacion || item.bodega || 'Principal')}</td>
          <td><strong>${stockValor}</strong></td>
          <td style="text-align: right;">
            <button type="button" class="btn-mini btn-inv-count-row" onclick="window.seleccionarParaConteo('${sanitize(item.codigo)}')" title="Contar este producto">✏️ Contar</button>
          </td>
        </tr>`;
    }).join('');
  };

  window.seleccionarParaConteo = function (codigo) {
    setVal('codigoInput', codigo);
    buscarProducto();
    window.scrollTo({ top: 150, behavior: 'smooth' });
  };

  window.renderHistorial = function () {
    const body = $('historialBody');
    if (!body) return;

    if (window.historialConteos.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">Sin conteos registrados en esta sesión</td></tr>`;
      return;
    }

    body.innerHTML = window.historialConteos.map(item => {
      const diff = Number(item.diferencia) || 0;
      const diffTxt = diff > 0 ? `+${diff}` : `${diff}`;
      const color = diff === 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#f59e0b';
      const badgeClass = diff === 0 ? 'estado-revisado' : diff < 0 ? 'estado-cerrado' : 'estado-revision';

      return `
        <tr>
          <td><strong>${sanitize(item.codigo)}</strong></td>
          <td>${sanitize(item.producto)}</td>
          <td>${item.sistema}</td>
          <td><strong>${item.fisico ?? '-'}</strong></td>
          <td><strong style="color:${color}">${diffTxt}</strong></td>
          <td><span class="${badgeClass}">${item.estado}</span></td>
        </tr>`;
    }).join('');
  };

  window.actualizarKPIs = function () {
    const total = window.inventarioCache.length;
    let exactos = 0;
    let faltantes = 0;
    let sobrantes = 0;

    window.inventarioCache.forEach(item => {
      if (item.conteo_fisico !== null && item.conteo_fisico !== undefined) {
        const diff = Number(item.diferencia);
        if (diff === 0) exactos++;
        else if (diff < 0) faltantes++;
        else if (diff > 0) sobrantes++;
      }
    });

    const contados = exactos + faltantes + sobrantes;
    const exactitud = contados > 0 ? ((exactos / contados) * 100).toFixed(1) : '0.0';

    if ($('kpiTotal')) $('kpiTotal').innerText = total.toLocaleString();
    if ($('kpiExactos')) $('kpiExactos').innerText = exactos.toLocaleString();
    if ($('kpiFaltantes')) $('kpiFaltantes').innerText = faltantes.toLocaleString();
    if ($('kpiSobrantes')) $('kpiSobrantes').innerText = sobrantes.toLocaleString();
    if ($('kpiExactitud')) $('kpiExactitud').innerText = `${exactitud}%`;
  };

  // ==================================================================
  // 6. EXPORTACIÓN Y REINICIO
  // ==================================================================
  function exportarExcel() {
    if (window.inventarioCache.length === 0) {
      notificar('No hay datos en inventario para exportar.');
      return;
    }

    const exportData = window.inventarioCache.map(i => ({
      'Código': i.codigo,
      'Producto': i.producto || i.descripcion || '',
      'Ubicación': i.ubicacion || 'Principal',
      'Stock Sistema': extraerStock(i),
      'Conteo Físico': i.conteo_fisico ?? '',
      'Diferencia': i.diferencia ?? '',
      'Estado': i.estado || 'Pendiente'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Inventario_Control_${new Date().toISOString().split('T')[0]}.xlsx`);

    notificar('Archivo Excel exportado con éxito.', 'success');
  }

  async function reiniciarInventario() {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('inventario', 'eliminar')) {
      notificar('No cuenta con permisos para reiniciar el inventario.');
      return;
    }

    if (!confirm('¿Desea vaciar y reiniciar todos los registros del inventario cargado?')) return;

    if (window.supabaseClient) {
      await window.supabaseClient.from('inventario').delete().neq('id', 0);
    }

    window.inventarioCache = [];
    window.historialConteos = [];
    localStorage.removeItem('inventario');

    window.renderInventario();
    window.renderHistorial();
    window.actualizarKPIs();
    notificar('Inventario reiniciado exitosamente.', 'success');
  }

  window.abrirSiesa = function () {
    window.open('https://siesa.com', '_blank');
  };

  // ==================================================================
  // 7. LISTENERS Y EVENTOS
  // ==================================================================
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'buscadorInventario') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        window.renderInventario();
        return;
      }
      const filtrados = window.inventarioCache.filter(p =>
        String(p.codigo || '').toLowerCase().includes(q) ||
        String(p.producto || p.descripcion || '').toLowerCase().includes(q) ||
        String(p.ubicacion || '').toLowerCase().includes(q)
      );
      window.renderInventario(filtrados);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && (e.target.id === 'codigoInput' || e.target.id === 'conteoFisico')) {
      e.preventDefault();
      if (e.target.id === 'codigoInput') buscarProducto();
      else if (e.target.id === 'conteoFisico') registrarConteo();
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'buscarBtn') {
      e.preventDefault();
      buscarProducto();
    }
    if (e.target && e.target.id === 'guardarConteo') {
      e.preventDefault();
      registrarConteo();
    }
    if (e.target && e.target.id === 'exportarExcel') {
      e.preventDefault();
      exportarExcel();
    }
    if (e.target && e.target.id === 'reiniciarInventario') {
      e.preventDefault();
      reiniciarInventario();
    }
    if (e.target && e.target.id === 'guardarNovedadBtn') {
      e.preventDefault();
      guardarNovedad();
    }
  });

  const fileInp = $('excelFile');
  if (fileInp) {
    fileInp.onchange = leerExcel;
  }

  // Inicialización
  window.cargarInventarioBD();
  window.renderHistorial();
})();
