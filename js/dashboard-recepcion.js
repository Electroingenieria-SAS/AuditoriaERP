// ==========================================================
// DASHBOARD-RECEPCION.JS — Motor Ejecutivo de Analítica
// ==========================================================

let graficoRecepciones = null;
let graficoNovedades = null;
let graficoTendencia = null;

const ORDEN_MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function actualizarKPI(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

// Obtener cliente Supabase garantizado
function obtenerClienteSupabase() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    const url = window.SUPABASE_URL || localStorage.getItem('supabase_url');
    const key = window.SUPABASE_ANON_KEY || localStorage.getItem('supabase_key');
    if (url && key) return window.supabase.createClient(url, key);
  }
  return null;
}

// ======================
// CARGA DE DATOS
// ======================
async function cargarDashboard() {
  const client = obtenerClienteSupabase();
  if (!client) {
    console.error('No fue posible inicializar el cliente de Supabase.');
    return;
  }

  try {
    const { data, error } = await client
      .from('recepciones')
      .select('created_at, novedad_original, estado, proveedor, material, faltantes, novedades, cantidad, porcentaje_revisado')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error consultando recepciones:', error.message);
      return;
    }

    construirDashboard(data || []);
  } catch (err) {
    console.error('Error general en dashboard:', err);
  }
}

// ======================
// CONSTRUCCIÓN DEL DASHBOARD
// ======================
function construirDashboard(recepciones) {
  let totalRecepciones = recepciones.length;
  let totalFaltantes = 0;
  let totalSobrantes = 0;
  let totalDanados = 0;

  const resumenMeses = {};

  recepciones.forEach(item => {
    const fecha = item.created_at ? new Date(item.created_at) : new Date();
    const mes = fecha.toLocaleString('es-CO', { month: 'long' }).toLowerCase();

    if (!resumenMeses[mes]) {
      resumenMeses[mes] = { recepciones: 0, faltantes: 0, sobrantes: 0, danados: 0 };
    }

    resumenMeses[mes].recepciones++;

    // Detección tolerante de faltantes (numérico o texto de estado)
    const numFalt = Number(item.faltantes) || 0;
    const estado = String(item.novedad_original || item.estado || '').toLowerCase().trim();

    if (numFalt > 0) {
      totalFaltantes += numFalt;
      resumenMeses[mes].faltantes += numFalt;
    } else if (estado.includes('faltante')) {
      totalFaltantes++;
      resumenMeses[mes].faltantes++;
    }

    if (estado.includes('sobrante')) {
      totalSobrantes++;
      resumenMeses[mes].sobrantes++;
    }

    if (estado.includes('dañ') || estado.includes('dan')) {
      totalDanados++;
      resumenMeses[mes].danados++;
    }
  });

  // 1. Actualizar KPIs Principales
  actualizarKPI('kpiTotalRecepciones', totalRecepciones.toLocaleString());
  actualizarKPI('kpiFaltantes', totalFaltantes.toLocaleString());
  actualizarKPI('kpiSobrantes', totalSobrantes.toLocaleString());
  actualizarKPI('kpiDanados', totalDanados.toLocaleString());

  // 2. Meses ordenados cronológicamente
  const mesesOrdenados = ORDEN_MESES.filter(m => resumenMeses[m]);

  let mesMasActivo = '-';
  let valorMasActivo = 0;
  let mesMasCritico = '-';
  let valorMasCritico = 0;

  // 3. Tabla Consolidada
  const body = document.getElementById('dashboardRecepcionBody');
  if (body) {
    body.innerHTML = '';

    if (mesesOrdenados.length === 0) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:25px;color:#64748b;">No hay registros disponibles</td></tr>`;
    }

    mesesOrdenados.forEach(mes => {
      const item = resumenMeses[mes];
      const totalNovedades = item.faltantes + item.sobrantes + item.danados;

      if (item.recepciones > valorMasActivo) {
        valorMasActivo = item.recepciones;
        mesMasActivo = mes.charAt(0).toUpperCase() + mes.slice(1);
      }

      if (totalNovedades > valorMasCritico) {
        valorMasCritico = totalNovedades;
        mesMasCritico = mes.charAt(0).toUpperCase() + mes.slice(1);
      }

      body.innerHTML += `
        <tr>
          <td><strong>${sanitize(mes.toUpperCase())}</strong></td>
          <td>${item.recepciones}</td>
          <td><span style="color:#f97316;font-weight:700;">${item.faltantes}</span></td>
          <td><span style="color:#2563eb;font-weight:700;">${item.sobrantes}</span></td>
          <td><span style="color:#ef4444;font-weight:700;">${item.danados}</span></td>
          <td><strong>${totalNovedades}</strong></td>
        </tr>
      `;
    });
  }

  // 4. Indicadores de Cabecera
  actualizarKPI('mesMasActivo', mesMasActivo !== '-' ? `${mesMasActivo} (${valorMasActivo})` : '-');
  actualizarKPI('mesMasCritico', mesMasCritico !== '-' ? `${mesMasCritico} (${valorMasCritico})` : '-');

  calcularSaludOperativa(totalRecepciones, totalFaltantes, totalSobrantes, totalDanados);
  construirTopProveedores(recepciones);
  construirTopMateriales(recepciones);

  // 5. Gráficos Chart.js
  crearGraficoRecepciones(mesesOrdenados, resumenMeses);
  crearGraficoNovedades(totalFaltantes, totalSobrantes, totalDanados, totalRecepciones);
  crearGraficoTendencia(mesesOrdenados, resumenMeses);
}

// ======================
// GRÁFICOS CHART.JS
// ======================
function crearGraficoRecepciones(meses, resumen) {
  const canvas = document.getElementById('graficoRecepciones');
  if (!canvas) return;
  if (graficoRecepciones) graficoRecepciones.destroy();

  const labels = meses.map(m => m.charAt(0).toUpperCase() + m.slice(1));
  const data = meses.map(m => resumen[m].recepciones);

  graficoRecepciones = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels.length ? labels : ['Sin datos'],
      datasets: [{
        label: 'Recepciones',
        data: data.length ? data : [0],
        backgroundColor: '#2563eb',
        borderRadius: 8,
        barThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function crearGraficoNovedades(faltantes, sobrantes, danados, totalRecs) {
  const canvas = document.getElementById('graficoNovedades');
  if (!canvas) return;
  if (graficoNovedades) graficoNovedades.destroy();

  const conformes = Math.max(0, totalRecs - (faltantes + sobrantes + danados));

  graficoNovedades = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Conformes', 'Faltantes', 'Sobrantes', 'Dañados'],
      datasets: [{
        data: [conformes, faltantes, sobrantes, danados],
        backgroundColor: ['#16a34a', '#f97316', '#2563eb', '#ef4444'],
        borderWidth: 3,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 14, font: { family: 'Poppins', size: 11.5 } }
        }
      },
      cutout: '68%'
    }
  });
}

function crearGraficoTendencia(meses, resumen) {
  const canvas = document.getElementById('graficoTendenciaNovedades');
  if (!canvas) return;
  if (graficoTendencia) graficoTendencia.destroy();

  const labels = meses.map(m => m.charAt(0).toUpperCase() + m.slice(1));
  const data = meses.map(m => resumen[m].faltantes + resumen[m].sobrantes + resumen[m].danados);

  graficoTendencia = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['Sin datos'],
      datasets: [{
        label: 'Discrepancias Totales',
        data: data.length ? data : [0],
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        borderWidth: 3,
        pointBackgroundColor: '#ef4444',
        pointRadius: 5,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } },
        x: { grid: { color: '#f1f5f9' } }
      }
    }
  });
}

// ======================
// CÁLCULOS & RANKINGS
// ======================
function calcularSaludOperativa(total, faltantes, sobrantes, danados) {
  const novedades = faltantes + sobrantes + danados;
  const salud = total > 0 ? Math.max(100 - (novedades / total) * 100, 0) : 100;
  actualizarKPI('saludOperativa', `${salud.toFixed(1)}%`);
}

function construirTopProveedores(recepciones) {
  const proveedores = {};
  recepciones.forEach(item => {
    const estado = (item.novedad_original || item.estado || '').toLowerCase();
    const numFalt = Number(item.faltantes) || 0;
    if (numFalt > 0 || ['faltante', 'sobrante', 'dañado', 'danado'].some(s => estado.includes(s))) {
      const p = item.proveedor || 'Sin Proveedor';
      proveedores[p] = (proveedores[p] || 0) + 1;
    }
  });
  renderRanking('topProveedoresBody', proveedores);
}

function construirTopMateriales(recepciones) {
  const materiales = {};
  recepciones.forEach(item => {
    const estado = (item.novedad_original || item.estado || '').toLowerCase();
    const numFalt = Number(item.faltantes) || 0;
    if (numFalt > 0 || ['faltante', 'sobrante', 'dañado', 'danado'].some(s => estado.includes(s))) {
      const m = item.material || 'Sin Material';
      materiales[m] = (materiales[m] || 0) + 1;
    }
  });
  renderRanking('topMaterialesBody', materiales);
}

function renderRanking(elementId, dataset) {
  const body = document.getElementById(elementId);
  if (!body) return;

  const ranking = Object.entries(dataset).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (ranking.length === 0) {
    body.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:15px;color:#94a3b8;">Sin novedades registradas</td></tr>`;
    return;
  }

  body.innerHTML = ranking.map(([nombre, cantidad]) => `
    <tr>
      <td style="text-align:left;"><strong>${sanitize(nombre)}</strong></td>
      <td style="text-align:right;"><span class="rank-badge">${cantidad}</span></td>
    </tr>
  `).join('');
}

// ======================
// EXPORTACIÓN A PDF
// ======================
document.addEventListener('click', (e) => {
  if (e.target && e.target.closest('#exportarPdfBtn')) {
    e.preventDefault();
    exportarDashboardPDF();
  }
});

function exportarDashboardPDF() {
  const element = document.getElementById('dashboardPrintArea');
  const btn = document.getElementById('exportarPdfBtn');
  if (btn) btn.style.display = 'none';

  const opt = {
    margin: 8,
    filename: `Dashboard_Ejecutivo_Recepcion_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };

  html2pdf().set(opt).from(element).save().then(() => {
    if (btn) btn.style.display = '';
  });
}

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', cargarDashboard);
