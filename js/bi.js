// =====================================
// BI DASHBOARD
// =====================================
// Envuelto en IIFE por la misma razón que confiabilidad.js:
// este script se recarga cada vez que se entra al módulo BI,
// y "let" a nivel global choca con la carga anterior
// ("Identifier ... has already been declared"), deteniendo
// la ejecución y dejando el módulo sin funcionar al volver.
// =====================================
(function(){

let datosExcel = [];
let grafico = null;

// =========================
// INICIALIZAR EVENTOS
// =========================

document.addEventListener("DOMContentLoaded", () => {

    const excelBI = document.getElementById("excelBI");

    if (excelBI) {

        excelBI.addEventListener(
            "change",
            leerExcel
        );

    }

    const btnGenerar =
        document.getElementById("btnGenerar");

    if (btnGenerar) {

        btnGenerar.addEventListener(
            "click",
            generarDashboard
        );

    }

});

// =========================
// LEER EXCEL
// =========================

function leerExcel(e) {

    const archivo = e.target.files[0];

    if (!archivo) {

        notifAlert("Seleccione un archivo Excel");

        return;

    }

    const reader = new FileReader();

    reader.onload = function (evt) {

        try {

            const data = evt.target.result;

            const workbook = XLSX.read(
                data,
                {
                    type: "binary"
                }
            );

            const hoja =
                workbook.SheetNames[0];

            const ws =
                workbook.Sheets[hoja];

            datosExcel =
                XLSX.utils.sheet_to_json(
                    ws,
                    {
                        defval: ""
                    }
                );

            if (!datosExcel.length) {

                notifAlert(
                    "El archivo no contiene datos."
                );

                return;

            }

            cargarColumnas();

            generarDashboard();

        } catch (error) {

            console.error(error);

            notifAlert(
                "Error leyendo el Excel."
            );

        }

    };

    reader.readAsBinaryString(
        archivo
    );

}

// =========================
// CARGAR COLUMNAS
// =========================

function cargarColumnas() {

    if (!datosExcel.length)
        return;

    const columnas =
        Object.keys(datosExcel[0]);

    const dimension =
        document.getElementById(
            "dimension"
        );

    const metrica =
        document.getElementById(
            "metrica"
        );

    if (!dimension || !metrica)
        return;

    dimension.innerHTML = "";

    metrica.innerHTML = "";

    columnas.forEach(col => {

        dimension.innerHTML += `
            <option value="${col}">
                ${col}
            </option>
        `;

        metrica.innerHTML += `
            <option value="${col}">
                ${col}
            </option>
        `;

    });

}

// =========================
// GENERAR DASHBOARD
// =========================

function generarDashboard() {

    if (!datosExcel.length)
        return;

    const dimension =
        document.getElementById(
            "dimension"
        )?.value;

    const metrica =
        document.getElementById(
            "metrica"
        )?.value;

    const tipo =
        document.getElementById(
            "tipoGrafico"
        )?.value || "bar";

    if (!dimension || !metrica)
        return;

    const agrupado = {};

    datosExcel.forEach(fila => {

        const grupo =
            fila[dimension];

        const valor =
            Number(
                fila[metrica]
            ) || 0;

        if (!agrupado[grupo]) {

            agrupado[grupo] = 0;

        }

        agrupado[grupo] += valor;

    });

    const labels =
        Object.keys(agrupado);

    const valores =
        Object.values(agrupado);

    actualizarKPIs(valores);

    crearGrafico(
        labels,
        valores,
        metrica,
        tipo
    );

}

// =========================
// KPI
// =========================

function actualizarKPIs(valores) {

    const registros =
        document.getElementById(
            "kpiRegistros"
        );

    const total =
        document.getElementById(
            "kpiTotal"
        );

    if (registros) {

        registros.textContent =
            datosExcel.length
            .toLocaleString();

    }

    if (total) {

        total.textContent =
            valores
            .reduce(
                (a, b) => a + b,
                0
            )
            .toLocaleString();

    }

}

// =========================
// GRAFICO
// =========================

function crearGrafico(
    labels,
    valores,
    titulo,
    tipo
) {

    const canvas =
        document.getElementById(
            "graficoBI"
        );

    if (!canvas)
        return;

    if (grafico) {

        grafico.destroy();

    }

    grafico =
        new Chart(canvas, {

            type: tipo,

            data: {

                labels: labels,

                datasets: [{

                    label: titulo,

                    data: valores,

                    borderWidth: 2,

                    fill: false

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {

                        display: true

                    }

                }

            }

        });

}

})();
