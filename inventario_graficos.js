// ========================================
// DASHBOARD DE INVENTARIO - PAGINA INDEPENDIENTE
// ========================================

window.dashboardCharts = window.dashboardCharts || {};

// ========================================
// HELPER TEXTO
// ========================================

function actualizarTexto(id, valor){

  const elemento = document.getElementById(id);

  if(elemento){
    elemento.innerText = valor;
  }

}

// ========================================
// CARGAR INVENTARIO (SI SUPABASE ESTA DISPONIBLE)
// ========================================

async function obtenerInventario(){

  try{

    if(window.supabaseClient){

      // Supabase limita cada respuesta a 1000 filas por defecto,
      // así que paginamos con .range() hasta traer TODO.

      const TAMANO_PAGINA = 1000;
      let desde = 0;
      let todosLosRegistros = [];

      while(true){

        const { data, error } =
        await window.supabaseClient
        .from("inventario")
        .select("*")
        .order("codigo")
        .range(desde, desde + TAMANO_PAGINA - 1);

        if(error){
          console.error(error);
          break;
        }

        if(!data || data.length === 0){
          break;
        }

        todosLosRegistros = todosLosRegistros.concat(data);

        if(data.length < TAMANO_PAGINA){
          break;
        }

        desde += TAMANO_PAGINA;

      }

      return todosLosRegistros;

    }

  }
  catch(error){
    console.log("Error obtenerInventario:", error);
  }

  // Fallback local si no hay supabase disponible en esta página
  try{
    return JSON.parse(localStorage.getItem("inventario")) || [];
  }
  catch(error){
    return [];
  }

}

// ========================================
// ACTUALIZAR DASHBOARD
// ========================================

window.actualizarDashboardInventario = async function(){

  try{

    const inventario = await obtenerInventario();

    const historial =
    JSON.parse(localStorage.getItem("historial")) || [];

    // ========================================
    // TOTAL DE CODIGOS UNICOS CARGADOS
    // ========================================

    const codigosUnicos = {};

    inventario.forEach(function(item){

      const cod = String(item.codigo || "").trim();

      if(cod){
        codigosUnicos[cod] = true;
      }

    });

    const totalCargados = Object.keys(codigosUnicos).length;
    const inventariados = historial.length;

    let pendientes = totalCargados - inventariados;

    if(pendientes < 0){
      pendientes = 0;
    }

    // ========================================
    // EXACTOS / FALTANTES / SOBRANTES
    // ========================================

    let exactos = 0;
    let faltantes = 0;
    let sobrantes = 0;

    let totalSistema = 0;
    let totalDiferencias = 0;

    historial.forEach(function(item){

      const sistema = Number(item.sistema || 0);
      const fisico = Number(item.fisico || 0);
      const diferencia = fisico - sistema;

      if(diferencia === 0){
        exactos++;
      }
      else if(diferencia < 0){
        faltantes++;
      }
      else{
        sobrantes++;
      }

      totalSistema += sistema;
      totalDiferencias += Math.abs(diferencia);

    });

    const avance =
    totalCargados > 0 ?
    ((inventariados / totalCargados) * 100).toFixed(1) :
    "0.0";

    let exactitud = "0.00";

    if(totalSistema > 0){

      exactitud = (
        (1 - (totalDiferencias / totalSistema)) * 100
      ).toFixed(2);

      if(Number(exactitud) < 0){
        exactitud = "0.00";
      }

    }

    // ========================================
    // PINTAR KPIS
    // ========================================

    actualizarTexto("dashTotalCargados", totalCargados);
    actualizarTexto("dashInventariados", inventariados);
    actualizarTexto("dashPendientes", pendientes);
    actualizarTexto("dashAvance", avance + "%");
    actualizarTexto("dashExactos", exactos);
    actualizarTexto("dashFaltantes", faltantes);
    actualizarTexto("dashSobrantes", sobrantes);
    actualizarTexto("dashExactitud", exactitud + "%");

    // ========================================
    // BITACORA
    // ========================================

    const body = document.getElementById("dashboardHistorialBody");

    if(body){

      if(historial.length === 0){

        body.innerHTML =
        '<tr><td colspan="6">No hay conteos registrados</td></tr>';

      }
      else{

        let html = "";

        historial.forEach(function(item){

          const diferencia = Number(item.diferencia || 0);

          let estadoClase = "badge-ok";
          let estadoTexto = "OK";

          if(diferencia < 0){
            estadoClase = "badge-faltante";
            estadoTexto = "Faltante";
          }
          else if(diferencia > 0){
            estadoClase = "badge-sobrante";
            estadoTexto = "Sobrante";
          }

          html +=
          "<tr>" +
            "<td>" + (item.codigo || "-") + "</td>" +
            "<td>" + (item.producto || "-") + "</td>" +
            "<td>" + (item.sistema || 0) + "</td>" +
            "<td>" + (item.fisico || 0) + "</td>" +
            "<td>" + diferencia + "</td>" +
            '<td><span class="badge-estado ' + estadoClase + '">' + estadoTexto + "</span></td>" +
          "</tr>";

        });

        body.innerHTML = html;

      }

    }

    // ========================================
    // GRAFICAS
    // ========================================

    if(window.Chart){

      renderChartAvanceInventario(inventariados, pendientes);
      renderChartResultadosInventario(exactos, faltantes, sobrantes);

    }

  }
  catch(error){
    console.log("Error actualizarDashboardInventario:", error);
  }

};

// ========================================
// GRAFICA DE AVANCE (DONA, COMPACTA)
// ========================================

function renderChartAvanceInventario(inventariados, pendientes){

  const canvas = document.getElementById("chartAvanceInventario");

  if(!canvas){
    return;
  }

  if(window.dashboardCharts.avance){
    window.dashboardCharts.avance.destroy();
  }

  window.dashboardCharts.avance =

  new window.Chart(canvas, {

    type: "doughnut",

    data: {

      labels: ["Inventariados", "Pendientes"],

      datasets: [{
        data: [inventariados, pendientes],
        backgroundColor: ["#2563eb", "#e2e8f0"],
        borderWidth: 0
      }]

    },

    options: {

      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",

      plugins: {

        legend: {
          position: "bottom",
          labels: {
            boxWidth: 12,
            font: { size: 11 }
          }
        }

      }

    }

  });

}

// ========================================
// GRAFICA DE RESULTADOS (BARRAS, COMPACTA)
// ========================================

function renderChartResultadosInventario(exactos, faltantes, sobrantes){

  const canvas = document.getElementById("chartResultadosInventario");

  if(!canvas){
    return;
  }

  if(window.dashboardCharts.resultados){
    window.dashboardCharts.resultados.destroy();
  }

  window.dashboardCharts.resultados =

  new window.Chart(canvas, {

    type: "bar",

    data: {

      labels: ["Exactos", "Faltantes", "Sobrantes"],

      datasets: [{
        label: "Conteos",
        data: [exactos, faltantes, sobrantes],
        backgroundColor: ["#10b981", "#ef4444", "#facc15"],
        borderRadius: 6,
        maxBarThickness: 45
      }]

    },

    options: {

      responsive: true,
      maintainAspectRatio: false,

      plugins: {
        legend: { display: false }
      },

      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, font: { size: 11 } }
        },
        x: {
          ticks: { font: { size: 11 } }
        }
      }

    }

  });

}

// ========================================
// DESCARGAR DASHBOARD EN PDF
// ========================================

window.descargarDashboardPDF = async function(){

  const boton = document.getElementById("btnDescargarPDF");
  const elemento = document.getElementById("reporteDashboard");
  const botonesHeader = document.querySelector(".graficos-header .button-group");

  if(!elemento || !window.html2canvas || !window.jspdf){
    Notif.error("Verifica tu conexión a internet e intenta de nuevo.", "No se pudo generar el PDF");
    return;
  }

  try{

    if(boton){
      boton.disabled = true;
      boton.innerText = "⏳ Generando PDF...";
    }

    // Ocultar botones de acción para que no salgan en la foto del reporte
    if(botonesHeader){
      botonesHeader.style.visibility = "hidden";
    }

    // Sello de fecha/hora para el reporte
    const fecha = new Date();

    const fechaTexto =
    fecha.toLocaleDateString("es-CO") + " " +
    fecha.toLocaleTimeString("es-CO");

    let selloFecha = document.getElementById("selloFechaReporte");

    if(!selloFecha){

      selloFecha = document.createElement("p");
      selloFecha.id = "selloFechaReporte";
      selloFecha.style.cssText =
        "margin-top:-15px;color:#94a3b8;font-size:12px;";

      elemento.insertBefore(
        selloFecha,
        elemento.children[1]
      );

    }

    selloFecha.innerText = "Reporte generado: " + fechaTexto;

    // Capturar el contenedor completo como imagen
    const canvas = await window.html2canvas(elemento, {
      scale: 2,
      backgroundColor: "#f1f5f9",
      useCORS: true
    });

    const imagenData = canvas.toDataURL("image/png");

    // Armar el PDF (tamaño carta, orientación vertical)
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "letter"
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const margen = 20;
    const anchoDisponible = pageWidth - (margen * 2);

    const alturaImagen =
    (canvas.height * anchoDisponible) / canvas.width;

    let alturaRestante = alturaImagen;
    let posicionY = margen;

    // Primera página
    pdf.addImage(
      imagenData, "PNG",
      margen, posicionY,
      anchoDisponible, alturaImagen
    );

    alturaRestante -= (pageHeight - margen * 2);

    // Si el contenido no cabe en una sola página, agregar páginas extra
    while(alturaRestante > 0){

      posicionY = alturaRestante - alturaImagen + margen;

      pdf.addPage();

      pdf.addImage(
        imagenData, "PNG",
        margen, posicionY,
        anchoDisponible, alturaImagen
      );

      alturaRestante -= (pageHeight - margen * 2);

    }

    const nombreArchivo =
    "Dashboard_Inventario_" +
    fecha.toISOString().slice(0, 10) + ".pdf";

    pdf.save(nombreArchivo);

  }
  catch(error){

    console.log("Error descargarDashboardPDF:", error);
    Notif.error("Ocurrió un error generando el PDF.");

  }
  finally{

    if(botonesHeader){
      botonesHeader.style.visibility = "visible";
    }

    if(boton){
      boton.disabled = false;
      boton.innerText = "📄 Descargar PDF";
    }

  }

};

// ========================================
// INICIO
// ========================================

window.actualizarDashboardInventario();
