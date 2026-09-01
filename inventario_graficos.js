/**
 * ====================================================================
 * DASHBOARD DE INVENTARIO — PÁGINA INDEPENDIENTE & ANALÍTICA
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  window.dashboardCharts = window.dashboardCharts || {};

  function actualizarTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.innerText = valor;
  }

  // ==================================================================
  // 1. CARGA DE INVENTARIO DESDE SUPABASE
  // ==================================================================
  async function obtenerInventario() {
    if (window.supabaseClient) {
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
            console.error('Error obtenerInventario:', error.message);
            break;
          }

          if (!data || data.length === 0) break;
          todos = todos.concat(data);
          if (data.length < TAMANO_PAGINA) break;
          desde += TAMANO_PAGINA;
        }

        return todos;
      } catch (err) {
        console.error('Error en obtenerInventario:', err);
      }
    }

    try {
      return JSON.parse(localStorage.getItem('inventario')) || [];
    } catch (_) {
      return [];
    }
  }

  // ==================================================================
  // 2. ACTUALIZACIÓN DEL DASHBOARD
  // ==================================================================
  window.actualizarDashboardInventario = async function () {
    try {
      const inventario = await obtenerInventario();
      const totalCargados = inventario.length;

      let inventariados = 0;
      let exactos = 0;
      let faltantes = 0;
      let sobrantes = 0;
      let totalSistema = 0;
      let totalDiferencias = 0;
      const bitacora = [];

      inventario.forEach(item => {
        const sistema = Number(item.stock_sistema || 0);
        totalSistema += sistema;

        if (item.conteo_fisico !== null && item.conteo_fisico !== undefined) {
          inventariados++;
          const fisico = Number(item.conteo_fisico);
          const diferencia = Number(item.diferencia ?? (fisico - sistema));

          if (diferencia === 0) exactos++;
          else if (diferencia < 0) faltantes++;
          else sobrantes++;

          totalDiferencias += Math.abs(diferencia);

          bitacora.push({
            codigo: item.codigo,
            producto: item.producto,
            sistema: sistema,
            fisico: fisico,
            diferencia: diferencia,
            estado: item.estado || (diferencia === 0 ? 'Exacto' : diferencia < 0 ? 'Faltante' : 'Sobrante')
          });
        }
      });

      const pendientes = Math.max(0, totalCargados - inventariados);
      const avance = totalCargados > 0 ? ((inventariados / totalCargados) * 100).toFixed(1) : '0.0';
      const exactitud = inventariados > 0 ? ((exactos / inventariados) * 100).toFixed(1) : '0.0';

      // Pintar KPIs
      actualizarTexto('dashTotalCargados', totalCargados.toLocaleString());
      actualizarTexto('dashInventariados', inventariados.toLocaleString());
      actualizarTexto('dashPendientes', pendientes.toLocaleString());
      actualizarTexto('dashAvance', `${avance}%`);
      actualizarTexto('dashExactos', exactos.toLocaleString());
      actualizarTexto('dashFaltantes', faltantes.toLocaleString());
      actualizarTexto('dashSobrantes', sobrantes.toLocaleString());
      actualizarTexto('dashExactitud', `${exactitud}%`);

      // Bitácora
      const body = document.getElementById('dashboardHistorialBody');
      if (body) {
        if (bitacora.length === 0) {
          body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8;">No hay conteos registrados en la base de datos</td></tr>';
        } else {
          body.innerHTML = bitacora.slice(0, 50).map(item => {
            let badgeClass = 'badge-ok';
            if (item.diferencia < 0) badgeClass = 'badge-faltante';
            else if (item.diferencia > 0) badgeClass = 'badge-sobrante';

            return `
              <tr>
                <td><strong>${item.codigo}</strong></td>
                <td>${item.producto}</td>
                <td>${item.sistema}</td>
                <td>${item.fisico}</td>
                <td><strong style="color:${item.diferencia === 0 ? '#10b981' : item.diferencia < 0 ? '#ef4444' : '#f59e0b'}">${item.diferencia > 0 ? '+' + item.diferencia : item.diferencia}</strong></td>
                <td><span class="badge-estado ${badgeClass}">${item.estado}</span></td>
              </tr>`;
          }).join('');
        }
      }

      // Renderizar Gráficas
      if (window.Chart) {
        renderChartAvance(inventariados, pendientes);
        renderChartResultados(exactos, faltantes, sobrantes);
      }

    } catch (err) {
      console.error('Error actualizando dashboard de inventario:', err);
    }
  };

  // ==================================================================
  // 3. GRÁFICAS CHART.JS
  // ==================================================================
  function renderChartAvance(inventariados, pendientes) {
    const canvas = document.getElementById('chartAvanceInventario');
    if (!canvas || !window.Chart) return;

    if (window.dashboardCharts.avance) {
      window.dashboardCharts.avance.destroy();
    }

    window.dashboardCharts.avance = new window.Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Inventariados', 'Pendientes'],
        datasets: [{
          data: [inventariados, pendientes],
          backgroundColor: ['#2563eb', '#e2e8f0'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      }
    });
  }

  function renderChartResultados(exactos, faltantes, sobrantes) {
    const canvas = document.getElementById('chartResultadosInventario');
    if (!canvas || !window.Chart) return;

    if (window.dashboardCharts.resultados) {
      window.dashboardCharts.resultados.destroy();
    }

    window.dashboardCharts.resultados = new window.Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Exactos', 'Faltantes', 'Sobrantes'],
        datasets: [{
          label: 'Conteos',
          data: [exactos, faltantes, sobrantes],
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
          borderRadius: 6,
          maxBarThickness: 45
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
          x: { ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  // ==================================================================
  // 4. EXPORTACIÓN A PDF
  // ==================================================================
  window.descargarDashboardPDF = async function () {
    const boton = document.getElementById('btnDescargarPDF');
    const elemento = document.getElementById('reporteDashboard');
    const botonesHeader = document.querySelector('.graficos-header .button-group');

    if (!elemento || !window.html2canvas || !window.jspdf) {
      if (typeof window.notifAlert === 'function') {
        window.notifAlert('Librerías de exportación PDF no cargadas.');
      }
      return;
    }

    try {
      if (boton) {
        boton.disabled = true;
        boton.innerText = '⏳ Generando PDF...';
      }
      if (botonesHeader) botonesHeader.style.visibility = 'hidden';

      const canvas = await window.html2canvas(elemento, {
        scale: 2,
        backgroundColor: '#f4f6fb',
        useCORS: true
      });

      const imagenData = canvas.toDataURL('image/jpeg', 0.95);
      const { jsPDF } = window.jspdf;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margen = 20;
      const anchoDisponible = pageWidth - (margen * 2);
      const alturaImagen = (canvas.height * anchoDisponible) / canvas.width;

      let alturaRestante = alturaImagen;
      let posicionY = margen;

      pdf.addImage(imagenData, 'JPEG', margen, posicionY, anchoDisponible, alturaImagen);
      alturaRestante -= (pageHeight - margen * 2);

      while (alturaRestante > 0) {
        posicionY = alturaRestante - alturaImagen + margen;
        pdf.addPage();
        pdf.addImage(imagenData, 'JPEG', margen, posicionY, anchoDisponible, alturaImagen);
        alturaRestante -= (pageHeight - margen * 2);
      }

      pdf.save(`Dashboard_Inventario_${new Date().toISOString().slice(0, 10)}.pdf`);

      if (typeof window.crearNotificacion === 'function') {
        window.crearNotificacion('Reporte de Inventario generado en PDF con éxito.', 'success');
      }

    } catch (err) {
      console.error('Error generando PDF de inventario:', err);
    } finally {
      if (botonesHeader) botonesHeader.style.visibility = 'visible';
      if (boton) {
        boton.disabled = false;
        boton.innerText = '📄 Descargar PDF';
      }
    }
  };

  // Inicializar al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.actualizarDashboardInventario);
  } else {
    window.actualizarDashboardInventario();
  }
})();
