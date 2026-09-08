/**
 * ====================================================================
 * INVENTARIO.JS — Módulo de Inventario Físico, Conteos & Novedades
 * Versión: 2.8.0 (Protegida contra duplicados y con normalización de Excel)
 * ====================================================================
 */

(function () {
  'use strict';

  // Variables de estado del módulo
  window.inventarioCache = [];
  window.historialConteos = [];
  window.productoActual = null;
  window.novedadEliminarId = null;

  // Banderas de control de procesos asíncronos
  let guardandoConteoActivo = false;
  let reinicioEnProgreso = false;

  // Utilidades de DOM
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
    } else {
      alert(mensaje);
    }
  }

  // ==================================================================
  // 1. CARGA Y SINCRONIZACIÓN DE INVENTARIO (OFFLINE-FIRST)
  // ==================================================================
  window.cargarInventarioBD = async function () {
    // Recuperación inmediata desde caché local para evitar pantalla vacía al cambiar de pestaña
    const copiaLocal = localStorage.getItem('inventario');
    if (copiaLocal) {
      try {
        window.inventarioCache = JSON.parse(copiaLocal) || [];
        window.renderInventario();
        window.actualizarKPIs();
      } catch (e) {
        console.warn('Advertencia leyendo respaldo local:', e);
      }
    }

    if (!window.supabaseClient) {
      return;
    }

    try {
      const TAMANO_PAGINA = 1000;
      let desde = 0;
      let todos = [];

      while (true) {
        const { data, error } = await window.supabaseClient
          .from('inventario')
          .select('codigo, producto, ubicacion, stock_sistema, conteo_fisico, diferencia, estado')
          .order('codigo')
          .range(desde, desde + TAMANO_PAGINA - 1);

        if (error) {
          console.error('Error cargando inventario desde Supabase:', error.message);
          break;
        }

        if (!data || data.length === 0) break;
        todos = todos.concat(data);
        if (data.length < TAMANO_PAGINA) break;
        desde += TAMANO_PAGINA;
      }

      if (todos.length > 0) {
        window.inventarioCache = todos;
        localStorage.setItem('inventario', JSON.stringify(todos));
        window.renderInventario();
        window.actualizarKPIs();
      }

      await window.cargarNovedadesBD();
    } catch (err) {
      console.error('Excepción al cargar inventario:', err);
    }
  };

  // ==================================================================
  // 2. LECTURA Y FILTRADO ESTRICTO DE EXCEL (4 COLUMNAS)
  // ==================================================================
  function normalizarLlave(texto) {
    return String(texto || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function mapearFilaExcel(fila) {
    let codigo = '';
    let producto = '';
    let ubicacion = 'Principal';
    let stockSistema = 0;

    const entradas = Object.entries(fila);

    for (const [llaveOriginal, valor] of entradas) {
      const k = normalizarLlave(llaveOriginal);
      const valLimpio = String(valor ?? '').trim();

      // Detección de Código
      if (!codigo && (k.includes('codigo') || k === 'cod' || k.includes('referencia') || k.includes('ref') || k === 'item' || k === 'id')) {
        codigo = valLimpio;
        continue;
      }

      // Detección de Producto / Referencia
      if (!producto && (k.includes('producto') || k.includes('descripcion') || k.includes('desc') || k.includes('articulo') || k.includes('material') || k.includes('nombre'))) {
        producto = valLimpio;
        continue;
      }

      // Detección de Ubicación
      if (ubicacion === 'Principal' && (k.includes('ubicacion') || k.includes('ubi') || k.includes('bodega') || k.includes('estante') || k.includes('rack') || k.includes('seccion'))) {
        if (valLimpio) ubicacion = valLimpio;
        continue;
      }

      // Detección de Stock Sistema
      if (stockSistema === 0 && (k.includes('stock') || k.includes('sistema') || k.includes('saldo') || k.includes('cantidad') || k.includes('cant') || k.includes('existencia') || k.includes('teorico'))) {
        const parsed = parseFloat(String(valor).replace(/,/g, '.'));
        stockSistema = isNaN(parsed) ? 0 : parsed;
        continue;
      }
    }

    if (!codigo) return null;

    return {
      codigo: codigo,
      producto: producto || codigo,
      ubicacion: ubicacion,
      stock_sistema: stockSistema,
      conteo_fisico: null,
      diferencia: null,
      estado: 'Pendiente',
      usuario: window.usuarioLogueado?.usuario || 'Sistema'
    };
  }

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
            notificar('El archivo Excel se encuentra vacío.', 'error');
            return;
          }

          const filtrados = [];
          for (const fila of json) {
            const item = mapearFilaExcel(fila);
            if (item && item.codigo) {
              filtrados.push(item);
            }
          }

          if (filtrados.length === 0) {
            notificar('No se detectaron columnas válidas (Código, Producto, Stock).', 'error');
            return;
          }

          window.inventarioCache = filtrados;
          localStorage.setItem('inventario', JSON.stringify(filtrados));

          window.renderInventario();
          window.actualizarKPIs();

          if (window.supabaseClient) {
            try {
              const LOTE = 200;
              for (let i = 0; i < filtrados.length; i += LOTE) {
                const chunk = filtrados.slice(i, i + LOTE);
                await window.supabaseClient
                  .from('inventario')
                  .upsert(chunk, { onConflict: 'codigo' });
              }
            } catch (dbErr) {
              console.warn('Guardado local completado; sincronización en segundo plano con advertencia:', dbErr);
            }
          }

          if (typeof window.guardarHistorial === 'function') {
            await window.guardarHistorial('CARGA_EXCEL', 'INVENTARIO', `Se importaron ${filtrados.length} referencias.`);
          }

          notificar(`Se procesaron ${filtrados.length} productos correctamente.`, 'success');

        } catch (err) {
          console.error('Error procesando Excel:', err);
          notificar('Error al procesar el archivo Excel.', 'error');
        } finally {
          e.target.value = '';
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (e) {
      console.error('Excepción general en lectura de Excel:', e);
    }
  }

  // ==================================================================
  // 3. CONSULTA Y REGISTRO DE CONTEO FÍSICO
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
      if ($('resultadoTexto')) $('resultadoTexto').innerText = '-';
      notificar(`El código "${cod}" no existe en el inventario cargado.`);
      return;
    }

    const stockTeorico = extraerStock(prod);
    window.productoActual = { ...prod, stock_sistema: stockTeorico };

    if ($('codigoProducto')) $('codigoProducto').innerText = prod.codigo;
    if ($('nombreProducto')) $('nombreProducto').innerText = prod.producto || '-';
    if ($('ubicacionProducto')) $('ubicacionProducto').innerText = prod.ubicacion || 'General';
    if ($('stockProducto')) $('stockProducto').innerText = stockTeorico;

    const fisico = getVal('conteoFisico').trim();
    const resTxt = $('resultadoTexto');
    if (resTxt) {
      if (fisico !== '') {
        const diff = Number(fisico) - stockTeorico;
        resTxt.innerText = diff > 0 ? `+${diff} (Sobrante)` : diff < 0 ? `${diff} (Faltante)` : '0 (Exacto)';
        resTxt.style.color = diff === 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#f59e0b';
      } else {
        resTxt.innerText = 'Esperando conteo...';
        resTxt.style.color = '#64748b';
      }
    }

    $('conteoFisico')?.focus();
  }

  async function registrarConteo() {
    if (guardandoConteoActivo) return;

    if (!window.productoActual) {
      buscarProducto();
      if (!window.productoActual) return;
    }

    const valorFisico = getVal('conteoFisico').trim();
    if (valorFisico === '') {
      notificar('Ingrese el valor del conteo físico.');
      return;
    }

    const btnGuardar = $('guardarConteo');
    try {
      guardandoConteoActivo = true;
      if (btnGuardar) btnGuardar.disabled = true;

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

      const idx = window.inventarioCache.findIndex(p => p.codigo === window.productoActual.codigo);
      if (idx > -1) {
        window.inventarioCache[idx] = itemActualizado;
      }
      localStorage.setItem('inventario', JSON.stringify(window.inventarioCache));

      window.historialConteos.unshift({
        codigo: itemActualizado.codigo,
        producto: itemActualizado.producto,
        sistema: stockSistema,
        fisico: conteoFisico,
        diferencia: diferencia,
        estado: estado,
        fecha: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      });

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
          console.warn('Error al persistir conteo en BD:', err);
        }
      }

      const resTxt = $('resultadoTexto');
      if (resTxt) {
        resTxt.innerText = diferencia > 0 ? `+${diferencia} (Sobrante)` : diferencia < 0 ? `${diferencia} (Faltante)` : '0 (Exacto)';
        resTxt.style.color = diferencia === 0 ? '#10b981' : diferencia < 0 ? '#ef4444' : '#f59e0b';
      }

      setVal('codigoInput', '');
      setVal('conteoFisico', '');
      window.productoActual = null;
      $('codigoInput')?.focus();

      window.renderHistorial();
      window.renderInventario();
      window.actualizarKPIs();

      notificar(`Conteo registrado para "${itemActualizado.codigo}": ${estado} (${diferencia})`, 'success');

    } catch (err) {
      console.error('Error registrando conteo:', err);
    } finally {
      guardandoConteoActivo = false;
      if (btnGuardar) btnGuardar.disabled = false;
    }
  }

  // ==================================================================
  // 4. REPORTAR NOVEDADES DE INVENTARIO
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
    setVal('novedadDiferencia', f - s);
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

    window.cerrarModalNovedad();
    await window.cargarNovedadesBD();
    notificar('Novedad reportada exitosamente.', 'success');
  }

  window.cargarNovedadesBD = async function () {
    const body = $('novedadesBody');
    if (!body) return;

    if (!window.supabaseClient) {
      body.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:20px;">Sin conexión activa</td></tr>`;
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
  // 5. RENDERIZADO DE TABLAS Y KPIS
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
  // 6. EXPORTACIÓN Y VACIADO PROTEGIDO
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
    if (reinicioEnProgreso) return;

    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('inventario', 'eliminar')) {
      notificar('No cuenta con permisos para reiniciar el inventario.', 'error');
      return;
    }

    const confirmado = window.confirm('¿Desea vaciar y reiniciar todos los registros del inventario cargado?');
    if (!confirmado) return;

    const btnVaciar = $('reiniciarInventario');

    try {
      reinicioEnProgreso = true;
      if (btnVaciar) {
        btnVaciar.disabled = true;
        btnVaciar.innerText = '⏳ Vaciando...';
      }

      // Borrado por código para evitar inconsistencias con columnas autoincrementales
      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('inventario')
          .delete()
          .neq('codigo', '');

        if (error) {
          console.warn('Advertencia en borrado Supabase:', error.message);
        }
      }

      window.inventarioCache = [];
      window.historialConteos = [];
      window.productoActual = null;
      localStorage.removeItem('inventario');

      setVal('codigoInput', '');
      setVal('conteoFisico', '');
      setVal('codigoProducto', '-');
      setVal('nombreProducto', '-');
      setVal('ubicacionProducto', '-');
      setVal('stockProducto', '-');

      const resTxt = $('resultadoTexto');
      if (resTxt) {
        resTxt.innerText = '-';
        resTxt.style.color = '#64748b';
      }

      window.renderInventario();
      window.renderHistorial();
      window.actualizarKPIs();

      notificar('Inventario e historial vaciados con éxito.', 'success');

    } catch (err) {
      console.error('Error durante el reinicio del inventario:', err);
      notificar('Ocurrió un error al intentar vaciar el inventario.', 'error');
    } finally {
      reinicioEnProgreso = false;
      if (btnVaciar) {
        btnVaciar.disabled = false;
        btnVaciar.innerText = '🗑️ Vaciar Inventario Cargado';
      }
    }
  }

  window.abrirSiesa = function () {
    window.open('https://siesa.com', '_blank');
  };

  // ==================================================================
  // 7. LISTENERS CON REGISTRO ÚNICO (PREVENCIÓN DE DUPLICADOS EN SPA)
  // ==================================================================
  if (!window._inventarioListenersInicializados) {
    window._inventarioListenersInicializados = true;

    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'buscadorInventario') {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          window.renderInventario();
          return;
        }
        const filtrados = (window.inventarioCache || []).filter(p =>
          String(p.codigo || '').toLowerCase().includes(q) ||
          String(p.producto || p.descripcion || '').toLowerCase().includes(q) ||
          String(p.ubicacion || '').toLowerCase().includes(q)
        );
        window.renderInventario(filtrados);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target) {
        if (e.target.id === 'codigoInput') {
          e.preventDefault();
          buscarProducto();
        } else if (e.target.id === 'conteoFisico') {
          e.preventDefault();
          registrarConteo();
        }
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target && e.target.closest('#buscarBtn')) {
        e.preventDefault();
        buscarProducto();
      }
      if (e.target && e.target.closest('#guardarConteo')) {
        e.preventDefault();
        registrarConteo();
      }
      if (e.target && e.target.closest('#exportarExcel')) {
        e.preventDefault();
        exportarExcel();
      }
      if (e.target && e.target.closest('#reiniciarInventario')) {
        e.preventDefault();
        reiniciarInventario();
      }
      if (e.target && e.target.closest('#guardarNovedadBtn')) {
        e.preventDefault();
        guardarNovedad();
      }
    });
  }

  // Asignación limpia del selector de archivo Excel
  const fileInp = $('excelFile');
  if (fileInp) {
    fileInp.onchange = leerExcel;
  }

  // Inicialización de la vista
  window.cargarInventarioBD();
  window.renderHistorial();
})();
