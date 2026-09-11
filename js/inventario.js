/**
 * ====================================================================
 * INVENTARIO.JS — Módulo de Inventario Físico, Conteos & Novedades Pro
 * Versión: 2.9.0 (Con persistencia compartida, eliminación y modal corregido)
 * ====================================================================
 */

(function () {
  'use strict';

  // Variables globales de estado
  window.inventarioCache = [];
  window.historialConteos = [];
  window.productoActual = null;

  // Banderas de bloqueo de peticiones en proceso
  let guardandoConteoActivo = false;
  let reinicioEnProgreso = false;

  // Funciones de ayuda (Helpers)
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
  // 1. CARGA Y SINCRONIZACIÓN DE INVENTARIO Y HISTORIAL
  // ==================================================================
  window.cargarInventarioBD = async function () {
    // 1.1 Restaurar de inmediato desde localStorage para evitar pérdida al cambiar de pestaña
    const copiaInventario = localStorage.getItem('inventario');
    if (copiaInventario) {
      try {
        window.inventarioCache = JSON.parse(copiaInventario) || [];
        window.renderInventario();
        window.actualizarKPIs();
      } catch (e) {
        console.warn('Aviso leyendo inventario local:', e);
      }
    }

    const copiaHistorial = localStorage.getItem('historial_conteos');
    if (copiaHistorial) {
      try {
        window.historialConteos = JSON.parse(copiaHistorial) || [];
        window.renderHistorial();
      } catch (e) {
        console.warn('Aviso leyendo historial local:', e);
      }
    }

    if (!window.supabaseClient) return;

    // 1.2 Cargar catálogo desde Supabase.
    // La tabla productiva inventario contiene el catálogo base:
    // codigo, producto, ubicacion y stock. Los conteos viven en historial_conteos.
    try {
      const TAMANO_PAGINA = 1000;
      let desde = 0;
      let todos = [];

      while (true) {
        const { data, error } = await window.supabaseClient
          .from('inventario')
          .select('codigo, producto, ubicacion, stock')
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

      if (todos.length > 0) {
        window.inventarioCache = todos;
        localStorage.setItem('inventario', JSON.stringify(todos));
        window.renderInventario();
        window.actualizarKPIs();
      }

      // 1.3 Cargar historial compartido desde la base de datos
      await cargarHistorialCompartidoBD();
      await window.cargarNovedadesBD();

    } catch (err) {
      console.error('Excepción al cargar inventario:', err);
    }
  };

  async function cargarHistorialCompartidoBD() {
    if (!window.supabaseClient) return;

    try {
      const { data, error } = await window.supabaseClient
        .from('historial_conteos')
        .select('*')
        .order('id', { ascending: false })
        .limit(100);

      if (!error && data && data.length > 0) {
        window.historialConteos = data;
        localStorage.setItem('historial_conteos', JSON.stringify(data));
        window.renderHistorial();
      }
    } catch (e) {
      console.warn('Aviso cargando historial de base de datos:', e);
    }
  }

  // ==================================================================
  // 2. LECTURA Y NORMALIZACIÓN DE EXCEL (4 COLUMNAS CLAVE)
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

      if (!codigo && (k.includes('codigo') || k === 'cod' || k.includes('referencia') || k.includes('ref') || k === 'item' || k === 'id')) {
        codigo = valLimpio;
        continue;
      }

      if (!producto && (k.includes('producto') || k.includes('descripcion') || k.includes('desc') || k.includes('articulo') || k.includes('material') || k.includes('nombre'))) {
        producto = valLimpio;
        continue;
      }

      if (ubicacion === 'Principal' && (k.includes('ubicacion') || k.includes('ubi') || k.includes('bodega') || k.includes('estante') || k.includes('rack') || k.includes('seccion'))) {
        if (valLimpio) ubicacion = valLimpio;
        continue;
      }

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
      stock: stockSistema,
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
                const chunkDb = chunk.map(item => ({
                  codigo: item.codigo,
                  producto: item.producto,
                  ubicacion: item.ubicacion,
                  stock: extraerStock(item)
                }));
                const { error: upsertError } = await window.supabaseClient
                  .from('inventario')
                  .upsert(chunkDb, { onConflict: 'codigo' });
                if (upsertError) throw upsertError;
              }
            } catch (dbErr) {
              console.warn('Aviso en subida a Supabase:', dbErr);
            }
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
      console.error(e);
    }
  }

  // ==================================================================
  // 3. CONSULTA Y REGISTRO DE CONTEO EN VIVO
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
      setVal('nombreProducto', '-');
      setVal('ubicacionProducto', '-');
      setVal('stockProducto', '0');
      if ($('resultadoTexto')) $('resultadoTexto').innerText = '-';
      notificar(`El código "${cod}" no existe en el catálogo cargado.`);
      return;
    }

    const stockTeorico = extraerStock(prod);
    window.productoActual = { ...prod, stock_sistema: stockTeorico };

    if ($('nombreProducto')) $('nombreProducto').innerText = prod.producto || '-';
    if ($('ubicacionProducto')) $('ubicacionProducto').innerText = prod.ubicacion || 'General';
    if ($('stockProducto')) $('stockProducto').innerText = stockTeorico;

    // Si ya tenía un conteo previo, sugerirlo en el input
    if (prod.conteo_fisico !== null && prod.conteo_fisico !== undefined) {
      setVal('conteoFisico', prod.conteo_fisico);
      calcularDiferenciaPreview(prod.conteo_fisico, stockTeorico);
    } else {
      setVal('conteoFisico', '');
      const resTxt = $('resultadoTexto');
      if (resTxt) {
        resTxt.innerText = 'Esperando conteo...';
        resTxt.style.color = '#64748b';
      }
    }

    $('conteoFisico')?.focus();
  }

  function calcularDiferenciaPreview(fisicoVal, teoricoVal) {
    const resTxt = $('resultadoTexto');
    if (!resTxt) return;

    if (fisicoVal !== '') {
      const diff = Number(fisicoVal) - Number(teoricoVal);
      resTxt.innerText = diff > 0 ? `+${diff} (Sobrante)` : diff < 0 ? `${diff} (Faltante)` : '0 (Exacto)';
      resTxt.style.color = diff === 0 ? '#16A34A' : diff < 0 ? '#DC2626' : '#D97706';
    } else {
      resTxt.innerText = '-';
      resTxt.style.color = '#64748b';
    }
  }

  async function registrarConteo() {
    if (guardandoConteoActivo) return;

    if (!window.productoActual) {
      buscarProducto();
      if (!window.productoActual) return;
    }

    const valorFisico = getVal('conteoFisico').trim();
    if (valorFisico === '') {
      notificar('Ingrese la cantidad verificada en conteo físico.');
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
      const usuarioLog = window.usuarioLogueado?.usuario || 'Sistema';

      const itemActualizado = {
        ...window.productoActual,
        stock_sistema: stockSistema,
        conteo_fisico: conteoFisico,
        diferencia: diferencia,
        estado: estado,
        usuario: usuarioLog
      };

      // 1. Actualizar el inventario general en caché local
      const idx = window.inventarioCache.findIndex(p => p.codigo === window.productoActual.codigo);
      if (idx > -1) {
        window.inventarioCache[idx] = itemActualizado;
      }
      localStorage.setItem('inventario', JSON.stringify(window.inventarioCache));

      // 2. Registrar en el historial de sesión y guardarlo en localStorage
      const entradaHistorial = {
        codigo: itemActualizado.codigo,
        producto: itemActualizado.producto,
        sistema: stockSistema,
        fisico: conteoFisico,
        diferencia: diferencia,
        estado: estado,
        usuario: usuarioLog,
        created_at: new Date().toISOString()
      };

      // Evitar duplicados en el historial para el mismo código en esta sesión
      window.historialConteos = [entradaHistorial, ...window.historialConteos.filter(h => h.codigo !== itemActualizado.codigo)];
      localStorage.setItem('historial_conteos', JSON.stringify(window.historialConteos));

      // 3. Persistir el conteo en su tabla dedicada. El catálogo inventario no almacena campos de conteo.
      if (window.supabaseClient) {
        try {
          const { error: historialError } = await window.supabaseClient
            .from('historial_conteos')
            .insert([entradaHistorial]);
          if (historialError) throw historialError;
        } catch (err) {
          console.warn('Aviso guardando conteo en BD:', err);
        }
      }

      // 4. Limpieza del terminal y refresco de interfaz
      setVal('codigoInput', '');
      setVal('conteoFisico', '');
      setVal('nombreProducto', '-');
      setVal('ubicacionProducto', '-');
      setVal('stockProducto', '0');
      if ($('resultadoTexto')) {
        $('resultadoTexto').innerText = '-';
        $('resultadoTexto').style.color = '#64748b';
      }

      window.productoActual = null;
      $('codigoInput')?.focus();

      window.renderHistorial();
      window.renderInventario();
      window.actualizarKPIs();

      notificar(`Conteo verificado para "${itemActualizado.codigo}": ${estado} (${diferencia})`, 'success');

    } catch (err) {
      console.error('Error registrando conteo:', err);
    } finally {
      guardandoConteoActivo = false;
      if (btnGuardar) btnGuardar.disabled = false;
    }
  }

  // ==================================================================
  // 4. DESHACER / ELIMINAR CONTEO DE UN PRODUCTO (CORRECCIÓN DE ERRORES)
  // ==================================================================
  window.eliminarConteoItem = async function (codigo) {
    if (!confirm(`¿Desea anular el conteo físico de la referencia "${codigo}" y volver a dejarla pendiente?`)) {
      return;
    }

    try {
      // 1. Revertir en el inventario local
      const idx = window.inventarioCache.findIndex(p => p.codigo === codigo);
      if (idx > -1) {
        window.inventarioCache[idx].conteo_fisico = null;
        window.inventarioCache[idx].diferencia = null;
        window.inventarioCache[idx].estado = 'Pendiente';
      }
      localStorage.setItem('inventario', JSON.stringify(window.inventarioCache));

      // 2. Remover del historial de sesión
      window.historialConteos = window.historialConteos.filter(h => h.codigo !== codigo);
      localStorage.setItem('historial_conteos', JSON.stringify(window.historialConteos));

      // 3. Sincronizar únicamente la tabla de historial; inventario es catálogo base.
      if (window.supabaseClient) {
        const { error } = await window.supabaseClient
          .from('historial_conteos')
          .delete()
          .eq('codigo', codigo);
        if (error) throw error;
      }

      window.renderInventario();
      window.renderHistorial();
      window.actualizarKPIs();
      notificar(`El conteo de "${codigo}" fue anulado correctamente.`, 'success');

    } catch (err) {
      console.error('Error al revertir conteo:', err);
      notificar('No se pudo anular el conteo.', 'error');
    }
  };

  // ==================================================================
  // 5. REPORTE DE NOVEDADES (CORREGIDO PARA MOSTRAR MODAL)
  // ==================================================================
  window.abrirModalNovedad = function () {
    const modal = $('modalNovedadInventario');
    if (!modal) return;

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
    
    // Mostramos el modal asegurando visibilidad
    modal.style.display = 'flex';
    modal.classList.add('active');
  };

  window.cerrarModalNovedad = function () {
    const modal = $('modalNovedadInventario');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
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
      notificar('Debe ingresar el código y la descripción del material.');
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
    notificar('Novedad de inventario reportada con éxito.', 'success');
  }

  window.cargarNovedadesBD = async function () {
    const body = $('novedadesBody');
    if (!body) return;

    if (!window.supabaseClient) {
      body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px;">Sin conexión activa</td></tr>`;
      return;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('novedades_inventario')
        .select('*')
        .order('id', { ascending: false });

      if (error || !data || data.length === 0) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:20px;">No hay novedades reportadas.</td></tr>`;
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
          <td>
            <button type="button" class="btn-mini-count" onclick="window.verObsNovedad('${encodeURIComponent(item.observacion || '')}')">👁️ Ver</button>
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn-mini-count" style="background:#FEE2E2;color:#DC2626;border-color:#FECACA;" onclick="window.eliminarNovedad(${item.id})">🗑️</button>
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
  // 6. RENDERIZADO DE TABLAS Y KPIS
  // ==================================================================
  window.renderInventario = function (datos = null) {
    const body = $('inventarioBody');
    if (!body) return;

    const lista = datos || window.inventarioCache || [];

    if (lista.length === 0) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:25px;color:#94a3b8;">No hay productos cargados en inventario</td></tr>`;
      return;
    }

    const mostrar = lista.slice(0, 300);

    body.innerHTML = mostrar.map(item => {
      const stockValor = extraerStock(item);

      return `
        <tr>
          <td><strong>${sanitize(item.codigo)}</strong></td>
          <td>${sanitize(item.producto || item.codigo)}</td>
          <td>${sanitize(item.ubicacion || 'Principal')}</td>
          <td><strong>${stockValor}</strong></td>
          <td style="text-align: center;">
            <button type="button" class="btn-mini-count" onclick="window.seleccionarParaConteo('${sanitize(item.codigo)}')">✏️ Contar</button>
          </td>
        </tr>`;
    }).join('');
  };

  window.seleccionarParaConteo = function (codigo) {
    setVal('codigoInput', codigo);
    buscarProducto();
    // Llevar el foco a la estación de conteo
    $('conteoFisico')?.focus();
  };

  window.renderHistorial = function () {
    const body = $('historialBody');
    if (!body) return;

    if (window.historialConteos.length === 0) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#94a3b8;">Sin conteos verificados en este inventario</td></tr>`;
      return;
    }

    body.innerHTML = window.historialConteos.map(item => {
      const diff = Number(item.diferencia) || 0;
      const diffTxt = diff > 0 ? `+${diff}` : `${diff}`;
      const color = diff === 0 ? '#16A34A' : diff < 0 ? '#DC2626' : '#D97706';

      return `
        <tr>
          <td><strong>${sanitize(item.codigo)}</strong></td>
          <td>${sanitize(item.producto)}</td>
          <td>${item.sistema}</td>
          <td><strong>${item.fisico ?? '-'}</strong></td>
          <td><strong style="color:${color}">${diffTxt}</strong></td>
          <td><span>${item.estado}</span></td>
          <td style="text-align:center;">
            <button type="button" class="btn-mini-count" style="background:#FEE2E2;color:#DC2626;border-color:#FECACA;" title="Anular conteo por error" onclick="window.eliminarConteoItem('${sanitize(item.codigo)}')">
              🗑️ Deshacer
            </button>
          </td>
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
  // 7. EXPORTACIÓN Y VACIADO GENERAL
  // ==================================================================
  function exportarExcel() {
    if (window.inventarioCache.length === 0) {
      notificar('No hay datos en inventario para exportar.');
      return;
    }

    const exportData = window.inventarioCache.map(i => ({
      'Código': i.codigo,
      'Producto': i.producto || '',
      'Ubicación': i.ubicacion || 'Principal',
      'Stock Sistema': extraerStock(i),
      'Conteo Físico': i.conteo_fisico ?? '',
      'Diferencia': i.diferencia ?? '',
      'Estado': i.estado || 'Pendiente',
      'Auditor': i.usuario || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
    XLSX.writeFile(wb, `Inventario_Pericial_${new Date().toISOString().split('T')[0]}.xlsx`);

    notificar('Resultados exportados a Excel exitosamente.', 'success');
  }

  async function reiniciarInventario() {
    if (reinicioEnProgreso) return;

    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('inventario', 'eliminar')) {
      notificar('No cuenta con permisos para reiniciar el inventario.', 'error');
      return;
    }

    const confirmado = window.confirm('¿Desea vaciar y reiniciar todos los registros del inventario y su historial?');
    if (!confirmado) return;

    const btnVaciar = $('reiniciarInventario');

    try {
      reinicioEnProgreso = true;
      if (btnVaciar) {
        btnVaciar.disabled = true;
        btnVaciar.innerText = '⏳ Vaciando...';
      }

      if (window.supabaseClient) {
        await window.supabaseClient.from('inventario').delete().neq('codigo', '');
        await window.supabaseClient.from('historial_conteos').delete().neq('codigo', '');
      }

      window.inventarioCache = [];
      window.historialConteos = [];
      window.productoActual = null;
      localStorage.removeItem('inventario');
      localStorage.removeItem('historial_conteos');

      setVal('codigoInput', '');
      setVal('conteoFisico', '');
      setVal('nombreProducto', '-');
      setVal('ubicacionProducto', '-');
      setVal('stockProducto', '0');

      if ($('resultadoTexto')) {
        $('resultadoTexto').innerText = '-';
        $('resultadoTexto').style.color = '#64748b';
      }

      window.renderInventario();
      window.renderHistorial();
      window.actualizarKPIs();

      notificar('Inventario e historial vaciados con éxito.', 'success');

    } catch (err) {
      console.error('Error al reiniciar inventario:', err);
      notificar('Ocurrió un error al vaciar el inventario.', 'error');
    } finally {
      reinicioEnProgreso = false;
      if (btnVaciar) {
        btnVaciar.disabled = false;
        btnVaciar.innerText = '🗑️ Vaciar Datos';
      }
    }
  }

  // ==================================================================
  // 8. LISTENERS CON REGISTRO ÚNICO (PREVENCIÓN DE DUPLICADOS)
  // ==================================================================
  if (!window._inventarioListenersInicializados) {
    window._inventarioListenersInicializados = true;

    // Buscador en la tabla del catálogo
    document.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'buscadorInventario') {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
          window.renderInventario();
          return;
        }
        const filtrados = (window.inventarioCache || []).filter(p =>
          String(p.codigo || '').toLowerCase().includes(q) ||
          String(p.producto || '').toLowerCase().includes(q) ||
          String(p.ubicacion || '').toLowerCase().includes(q)
        );
        window.renderInventario(filtrados);
      }

      // Previsualización dinámica de diferencia mientras se escribe
      if (e.target && e.target.id === 'conteoFisico' && window.productoActual) {
        calcularDiferenciaPreview(e.target.value.trim(), window.productoActual.stock_sistema);
      }
    });

    // Tecla Enter en inputs
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

    // Delegación de eventos de clic
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

      // Cambio dinámico de pestañas (Tabs)
      const tabBtn = e.target.closest('.tab-btn');
      if (tabBtn) {
        const targetTab = tabBtn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tabBtn.classList.add('active');
        const panel = $(targetTab);
        if (panel) panel.classList.add('active');
      }
    });
  }

  // Listener para el input de archivo Excel
  const fileInp = $('excelFile');
  if (fileInp) {
    fileInp.onchange = leerExcel;
  }

  // Carga inicial
  window.cargarInventarioBD();
})();
