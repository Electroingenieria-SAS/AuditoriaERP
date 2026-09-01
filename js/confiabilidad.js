/**
 * ====================================================================
 * CONFIABILIDAD.JS — Módulo de Confiabilidad de Inventario & Métricas
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  let confiabilidadCache = [];
  let analisisEnEdicionId = null;

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

  function notificar(mensaje, tipo = 'warning', titulo = 'Confiabilidad') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(titulo, mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  function formatearPorcentaje(val) {
    const n = Number(val);
    return isNaN(n) ? '0.00%' : `${n.toFixed(2)}%`;
  }

  function formatearMoneda(val) {
    const n = Number(val);
    return isNaN(n) ? '$0' : `$${n.toLocaleString('es-CO')}`;
  }

  // ==================================================================
  // 1. CÁLCULO EN TIEMPO REAL DE INDICADORES
  // ==================================================================
  function calcularMetricas(datos) {
    const totalEmpresa = Number(datos.total_empresa) || 0;
    const programados = Number(datos.programados) || 0;
    const auditados = Number(datos.auditados) || 0;
    const correctos = Number(datos.correctos) || 0;
    const valorInventario = Number(datos.valor_inventario) || 0;
    const valorAuditado = Number(datos.valor_auditado) || 0;
    const valorDiferencias = Number(datos.valor_diferencias) || 0;
    const valorAjustes = Number(datos.valor_ajustes) || 0;

    // Confiabilidad Física
    const fisica = auditados > 0 ? (correctos / auditados) * 100 : 0;

    // Confiabilidad Económica
    let economica = 100;
    if (valorAuditado > 0) {
      economica = Math.max(0, 100 - (valorDiferencias / valorAuditado) * 100);
    }

    // Cobertura
    const cobertura = totalEmpresa > 0 ? (auditados / totalEmpresa) * 100 : 0;

    // Cumplimiento
    const cumplimiento = programados > 0 ? (auditados / programados) * 100 : 0;

    // Confiabilidad de Ajustes
    let ajustes = 100;
    if (valorInventario > 0) {
      ajustes = Math.max(0, 100 - (valorAjustes / valorInventario) * 100);
    }

    // Índice General Ponderado
    const indiceGeneral = (fisica * 0.35) + (economica * 0.35) + (cobertura * 0.15) + (cumplimiento * 0.15);

    let estado = 'Excelente';
    if (indiceGeneral < 70) estado = 'Crítico';
    else if (indiceGeneral < 85) estado = 'Aceptable';
    else if (indiceGeneral < 95) estado = 'Bueno';

    return {
      confiabilidad_fisica: fisica,
      confiabilidad_economica: economica,
      cobertura: Math.min(cobertura, 100),
      cumplimiento: Math.min(cumplimiento, 100),
      confiabilidad_ajustes: ajustes,
      indice_general: indiceGeneral,
      estado
    };
  }

  function actualizarPreviewEnVivo() {
    const datosForm = {
      total_empresa: getVal('totalEmpresaInput'),
      programados: getVal('programadosInput'),
      auditados: getVal('auditadosInput'),
      correctos: getVal('correctosInput'),
      valor_inventario: getVal('valorInventarioInput'),
      valor_auditado: getVal('valorAuditadoInput'),
      valor_diferencias: getVal('valorDiferenciasInput'),
      valor_ajustes: getVal('valorAjustesInput')
    };

    const res = calcularMetricas(datosForm);

    const setT = (id, val) => { const el = $(id); if (el) el.innerText = val; };
    setT('previewIndice', formatearPorcentaje(res.indice_general));
    setT('previewFisica', formatearPorcentaje(res.confiabilidad_fisica));
    setT('previewEconomica', formatearPorcentaje(res.confiabilidad_economica));
    setT('previewCobertura', formatearPorcentaje(res.cobertura));
    setT('previewCumplimiento', formatearPorcentaje(res.cumplimiento));
    setT('previewAjustes', formatearPorcentaje(res.confiabilidad_ajustes));

    const estEl = $('previewEstado');
    if (estEl) {
      estEl.innerText = `Estado: ${res.estado}`;
      estEl.style.color = res.indice_general >= 90 ? '#10b981' : res.indice_general >= 75 ? '#f59e0b' : '#ef4444';
    }
  }

  // ==================================================================
  // 2. CARGA Y CONSULTA DESDE SUPABASE
  // ==================================================================
  window.renderConfiabilidad = async function () {
    if (!window.supabaseClient) {
      confiabilidadCache = JSON.parse(localStorage.getItem('confiabilidadInventario')) || [];
      renderTabla(confiabilidadCache);
      actualizarDashboardGeneral(confiabilidadCache);
      return;
    }

    try {
      const { data, error } = await window.supabaseClient
        .from('confiabilidad')
        .select('*')
        .order('id', { ascending: false });

      if (error) {
        console.error('Error consultando confiabilidad:', error.message);
        return;
      }

      confiabilidadCache = data || [];
      localStorage.setItem('confiabilidadInventario', JSON.stringify(confiabilidadCache));

      renderTabla(confiabilidadCache);
      actualizarDashboardGeneral(confiabilidadCache);

    } catch (err) {
      console.error('Excepción en renderConfiabilidad:', err);
    }
  };

  function renderTabla(lista) {
    const tbody = $('tablaConfiabilidad');
    if (!tbody) return;

    if (lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="conf-table-empty"><p>Aún no existen análisis de confiabilidad registrados.</p></td></tr>`;
      return;
    }

    const rol = (window.usuarioLogueado?.rol || '').toLowerCase();
    const puedeEditar = ['admin', 'auditor', 'lider'].includes(rol);
    const puedeEliminar = ['admin', 'auditor'].includes(rol);

    tbody.innerHTML = lista.map(item => {
      let estadoClass = 'estado-pendiente';
      if (item.indice_general >= 90) estadoClass = 'estado-revisado';
      else if (item.indice_general >= 75) estadoClass = 'estado-revision';
      else estadoClass = 'estado-cerrado';

      const avanceConteo = Number(item.total_empresa) > 0 ? ((Number(item.auditados) / Number(item.total_empresa)) * 100).toFixed(1) : '0.0';

      return `
        <tr>
          <td><strong>${item.anio}</strong></td>
          <td>${sanitize(item.mes)}</td>
          <td><strong>${sanitize(item.nombre_inventario)}</strong></td>
          <td>${item.auditados} / ${item.total_empresa} (${avanceConteo}%)</td>
          <td><strong>${formatearPorcentaje(item.indice_general)}</strong></td>
          <td><span class="${estadoClass}">${sanitize(item.estado)}</span></td>
          <td>${new Date(item.created_at).toLocaleDateString('es-CO')}</td>
          <td>${sanitize(item.usuario || 'Sistema')}</td>
          <td>
            <div class="acciones-tabla-mini">
              ${puedeEditar ? `
                <button type="button" class="btn-mini" onclick="window.editarAnalisis(${item.id})" title="Editar">✏️</button>
              ` : ''}
              ${puedeEliminar ? `
                <button type="button" class="btn-mini" onclick="window.eliminarAnalisis(${item.id})" title="Eliminar">🗑️</button>
              ` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function actualizarDashboardGeneral(lista) {
    if (lista.length === 0) {
      const setT = (id, val) => { const el = $(id); if (el) el.innerText = val; };
      setT('kpiFisica', '0.00%');
      setT('kpiEconomica', '0.00%');
      setT('kpiCobertura', '0.00%');
      setT('kpiCumplimiento', '0.00%');
      setT('kpiAjustes', '0.00%');
      setT('kpiEjecutados', '0');
      setT('indiceGeneral', '0.00%');
      setT('estadoGeneral', 'Sin información');
      setT('mensajeGeneral', 'Registre un análisis para comenzar.');
      setT('avanceTexto', '0 / 0 Ítems');
      setT('avancePorcentaje', '0%');
      setT('metaAnual', '0');
      setT('auditadosAcumulados', '0');
      setT('pendientesAnuales', '0');
      setT('indiceAcumulado', '0.00%');
      return;
    }

    const ult = lista[0];
    const totalEjecutados = lista.length;

    // Promedios acumulados
    let sumFis = 0, sumEco = 0, sumCob = 0, sumCum = 0, sumAju = 0, sumInd = 0;
    let totalItemsMeta = 0, totalItemsAudit = 0;

    lista.forEach(i => {
      sumFis += Number(i.confiabilidad_fisica || 0);
      sumEco += Number(i.confiabilidad_economica || 0);
      sumCob += Number(i.cobertura || 0);
      sumCum += Number(i.cumplimiento || 0);
      sumAju += Number(i.confiabilidad_ajustes || 0);
      sumInd += Number(i.indice_general || 0);
      totalItemsMeta += Number(i.total_empresa || 0);
      totalItemsAudit += Number(i.auditados || 0);
    });

    const avgInd = sumInd / totalEjecutados;
    const avgFis = sumFis / totalEjecutados;
    const avgEco = sumEco / totalEjecutados;
    const avgCob = sumCob / totalEjecutados;
    const avgCum = sumCum / totalEjecutados;
    const avgAju = sumAju / totalEjecutados;

    const setT = (id, val) => { const el = $(id); if (el) el.innerText = val; };
    setT('kpiFisica', formatearPorcentaje(ult.confiabilidad_fisica));
    setT('kpiEconomica', formatearPorcentaje(ult.confiabilidad_economica));
    setT('kpiCobertura', formatearPorcentaje(ult.cobertura));
    setT('kpiCumplimiento', formatearPorcentaje(ult.cumplimiento));
    setT('kpiAjustes', formatearPorcentaje(ult.confiabilidad_ajustes));
    setT('kpiEjecutados', totalEjecutados.toString());

    setT('indiceGeneral', formatearPorcentaje(ult.indice_general));
    setT('estadoGeneral', `Estado: ${ult.estado}`);
    setT('mensajeGeneral', `Último análisis: ${ult.nombre_inventario} (${ult.mes} ${ult.anio})`);

    const avancePct = totalItemsMeta > 0 ? ((totalItemsAudit / totalItemsMeta) * 100).toFixed(1) : '0';
    setT('avanceTexto', `${totalItemsAudit.toLocaleString()} / ${totalItemsMeta.toLocaleString()} Ítems`);
    setT('avancePorcentaje', `${avancePct}%`);

    const barra = $('avanceBarra');
    if (barra) barra.style.width = `${Math.min(Number(avancePct), 100)}%`;

    setT('metaAnual', totalItemsMeta.toLocaleString());
    setT('auditadosAcumulados', totalItemsAudit.toLocaleString());
    setT('pendientesAnuales', Math.max(0, totalItemsMeta - totalItemsAudit).toLocaleString());
    setT('indiceAcumulado', formatearPorcentaje(avgInd));

    // Diagnóstico Ejecutivo Inteligente
    const diagTexto = $('diagnosticoTexto');
    const diagEstado = $('diagnosticoEstado');
    if (diagTexto && diagEstado) {
      diagEstado.innerText = ult.estado;
      diagEstado.className = `conf-diagnostico-status ${ult.indice_general >= 85 ? 'success' : ult.indice_general >= 70 ? 'warning' : 'danger'}`;
      diagTexto.innerHTML = `
        El análisis para <strong>${sanitize(ult.nombre_inventario)}</strong> arroja un índice general del <strong>${formatearPorcentaje(ult.indice_general)}</strong>. 
        La exactitud física es del <strong>${formatearPorcentaje(ult.confiabilidad_fisica)}</strong> con <strong>${ult.correctos}</strong> ítems exactos sobre <strong>${ult.auditados}</strong> auditados. 
        El impacto económico por diferencias suma <strong>${formatearMoneda(ult.valor_diferencias)}</strong> frente a una muestra auditada de <strong>${formatearMoneda(ult.valor_auditado)}</strong>.
      `;
    }

    // Alertas
    const contAlertas = $('contenedorAlertas');
    if (contAlertas) {
      const alertas = [];
      if (Number(ult.faltantes) > 0) alertas.push(`⚠️ Se detectaron ${ult.faltantes} discrepancias faltantes en ${ult.nombre_inventario}.`);
      if (Number(ult.sobrantes) > 0) alertas.push(`🔵 Se detectaron ${ult.sobrantes} excedentes no justificados.`);
      if (ult.confiabilidad_fisica < 80) alertas.push(`🔴 Alerta Crítica: Confiabilidad física por debajo del umbral mínimo (80%).`);

      if (alertas.length === 0) {
        contAlertas.innerHTML = `<div class="conf-alert-empty"><span>🟢 Operación dentro de parámetros nominales de confiabilidad.</span></div>`;
      } else {
        contAlertas.innerHTML = alertas.map(a => `<div class="conf-alert-item">${a}</div>`).join('');
      }
    }
  }

  // ==================================================================
  // 3. GUARDAR / EDITAR ANÁLISIS
  // ==================================================================
  window.abrirNuevoAnalisis = function () {
    analisisEnEdicionId = null;
    setVal('anioInput', new Date().getFullYear());
    setVal('mesInput', 'Enero');
    setVal('nombreInventarioInput', '');
    setVal('totalEmpresaInput', '0');
    setVal('programadosInput', '0');
    setVal('auditadosInput', '0');
    setVal('correctosInput', '0');
    setVal('sobrantesInput', '0');
    setVal('faltantesInput', '0');
    setVal('valorInventarioInput', '0');
    setVal('valorAuditadoInput', '0');
    setVal('valorDiferenciasInput', '0');
    setVal('valorAjustesInput', '0');

    actualizarPreviewEnVivo();
    const modal = $('modalConfiabilidad');
    if (modal) modal.style.display = 'flex';
  };

  window.cerrarModalConfiabilidad = function () {
    const modal = $('modalConfiabilidad');
    if (modal) modal.style.display = 'none';
  };

  async function guardarAnalisis() {
    const btn = $('guardarAnalisis');
    try {
      const anio = Number(getVal('anioInput')) || new Date().getFullYear();
      const mes = getVal('mesInput') || 'Enero';
      const nombreInventario = getVal('nombreInventarioInput').trim();

      if (!nombreInventario) {
        notificar('Ingrese el nombre o descripción del inventario.');
        return;
      }

      const raw = {
        anio,
        mes,
        nombre_inventario: nombreInventario,
        total_empresa: Number(getVal('totalEmpresaInput')) || 0,
        programados: Number(getVal('programadosInput')) || 0,
        auditados: Number(getVal('auditadosInput')) || 0,
        correctos: Number(getVal('correctosInput')) || 0,
        sobrantes: Number(getVal('sobrantesInput')) || 0,
        faltantes: Number(getVal('faltantesInput')) || 0,
        valor_inventario: Number(getVal('valorInventarioInput')) || 0,
        valor_auditado: Number(getVal('valorAuditadoInput')) || 0,
        valor_diferencias: Number(getVal('valorDiferenciasInput')) || 0,
        valor_ajustes: Number(getVal('valorAjustesInput')) || 0,
        usuario: window.usuarioLogueado?.usuario || 'Sistema'
      };

      const metricas = calcularMetricas(raw);
      const payload = { ...raw, ...metricas };

      if (btn) btn.disabled = true;

      if (window.supabaseClient) {
        if (analisisEnEdicionId) {
          const { error } = await window.supabaseClient
            .from('confiabilidad')
            .update(payload)
            .eq('id', analisisEnEdicionId);
          if (error) throw error;
        } else {
          const { error } = await window.supabaseClient
            .from('confiabilidad')
            .insert([payload]);
          if (error) throw error;
        }
      }

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('CONFIABILIDAD', 'INVENTARIO', `Análisis guardado: ${nombreInventario} (${mes} ${anio}) - Índice: ${metricas.indice_general.toFixed(1)}%`);
      }

      if (typeof window.crearNotificacion === 'function') {
        window.crearNotificacion(`📊 Confiabilidad guardada: ${nombreInventario} (${mes} ${anio}) - ${metricas.indice_general.toFixed(1)}%`, 'success');
      }

      window.cerrarModalConfiabilidad();
      await window.renderConfiabilidad();
      notificar('Análisis guardado exitosamente.', 'success');

    } catch (err) {
      console.error(err);
      notificar('Error al guardar análisis: ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.editarAnalisis = function (id) {
    const item = confiabilidadCache.find(a => a.id === Number(id));
    if (!item) return;

    analisisEnEdicionId = item.id;
    setVal('anioInput', item.anio);
    setVal('mesInput', item.mes);
    setVal('nombreInventarioInput', item.nombre_inventario);
    setVal('totalEmpresaInput', item.total_empresa);
    setVal('programadosInput', item.programados);
    setVal('auditadosInput', item.auditados);
    setVal('correctosInput', item.correctos);
    setVal('sobrantesInput', item.sobrantes);
    setVal('faltantesInput', item.faltantes);
    setVal('valorInventarioInput', item.valor_inventario);
    setVal('valorAuditadoInput', item.valor_auditado);
    setVal('valorDiferenciasInput', item.valor_diferencias);
    setVal('valorAjustesInput', item.valor_ajustes);

    actualizarPreviewEnVivo();
    const modal = $('modalConfiabilidad');
    if (modal) modal.style.display = 'flex';
  };

  window.eliminarAnalisis = async function (id) {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('confiabilidad', 'eliminar')) {
      notificar('No cuenta con permisos para eliminar análisis.');
      return;
    }

    if (!confirm('¿Desea eliminar definitivamente este análisis de confiabilidad?')) return;

    if (window.supabaseClient) {
      await window.supabaseClient.from('confiabilidad').delete().eq('id', Number(id));
    }

    await window.renderConfiabilidad();
    notificar('Análisis eliminado del sistema.', 'success');
  };

  // ==================================================================
  // 4. EXPORTACIÓN A EXCEL Y PDF
  // ==================================================================
  function exportarExcel() {
    if (confiabilidadCache.length === 0) {
      notificar('No hay registros de confiabilidad para exportar.');
      return;
    }

    const data = confiabilidadCache.map(c => ({
      'Año': c.anio,
      'Mes': c.mes,
      'Nombre Inventario': c.nombre_inventario,
      'Total Ítems': c.total_empresa,
      'Programados': c.programados,
      'Auditados': c.auditados,
      'Correctos': c.correctos,
      'Sobrantes': c.sobrantes,
      'Faltantes': c.faltantes,
      'Confiabilidad Física %': Number(c.confiabilidad_fisica).toFixed(2),
      'Confiabilidad Económica %': Number(c.confiabilidad_economica).toFixed(2),
      'Cobertura %': Number(c.cobertura).toFixed(2),
      'Cumplimiento %': Number(c.cumplimiento).toFixed(2),
      'Índice General %': Number(c.indice_general).toFixed(2),
      'Estado': c.estado,
      'Usuario': c.usuario || 'Sistema'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Confiabilidad');
    XLSX.writeFile(wb, `Confiabilidad_Inventario_${new Date().toISOString().split('T')[0]}.xlsx`);

    notificar('Archivo Excel exportado.', 'success');
  }

  function exportarPDF() {
    window.print();
  }

  // ==================================================================
  // 5. EVENTOS Y DELEGACIÓN
  // ==================================================================
  document.addEventListener('input', function (e) {
    if (e.target && e.target.closest('.conf-modal-form')) {
      actualizarPreviewEnVivo();
    }
    if (e.target && e.target.id === 'buscarAnalisis') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderTabla(confiabilidadCache);
        return;
      }
      const filtrados = confiabilidadCache.filter(a =>
        String(a.nombre_inventario || '').toLowerCase().includes(q) ||
        String(a.mes || '').toLowerCase().includes(q) ||
        String(a.anio || '').includes(q) ||
        String(a.estado || '').toLowerCase().includes(q)
      );
      renderTabla(filtrados);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target.closest('#btnNuevoAnalisis')) {
      e.preventDefault();
      window.abrirNuevoAnalisis();
    }
    if (e.target.closest('#cerrarModalConfiabilidad') || e.target.closest('#cancelarAnalisis')) {
      e.preventDefault();
      window.cerrarModalConfiabilidad();
    }
    if (e.target.closest('#guardarAnalisis')) {
      e.preventDefault();
      guardarAnalisis();
    }
    if (e.target.closest('#btnExportarExcel')) {
      e.preventDefault();
      exportarExcel();
    }
    if (e.target.closest('#btnExportarPDF')) {
      e.preventDefault();
      exportarPDF();
    }
  });

  // Inicialización
  window.renderConfiabilidad();
})();
