// =====================================
// BI KPIS
// =====================================

let columnaMetrica = null;
let columnasTexto = [];
let columnasNumericas = [];

function analizarColumnas() {

    if (!datosExcel.length) return;

    columnasTexto = [];
    columnasNumericas = [];

    const columnas =
        Object.keys(datosExcel[0]);

    columnas.forEach(columna => {

        let esNumero = true;

        for (let fila of datosExcel) {

            const valor = fila[columna];

            if (
                valor !== "" &&
                valor !== null &&
                isNaN(valor)
            ) {

                esNumero = false;
                break;

            }

        }

        if (esNumero) {

            columnasNumericas.push(
                columna
            );

        } else {

            columnasTexto.push(
                columna
            );

        }

    });

    columnaMetrica =
        columnasNumericas[0] || null;

}

function calcularKPIs() {

    analizarColumnas();

    if (!columnaMetrica)
        return;

    const valores =
        datosExcel.map(fila =>
            Number(
                fila[columnaMetrica]
            ) || 0
        );

    const total =
        valores.reduce(
            (a,b)=>a+b,
            0
        );

    const promedio =
        total / valores.length;

    const maximo =
        Math.max(...valores);

    document
    .getElementById("kpiRegistros")
    .textContent =
    datosExcel.length
    .toLocaleString();

    document
    .getElementById("kpiTotal")
    .textContent =
    `${columnaMetrica}: ${total.toLocaleString()}`;

    document
    .getElementById("kpiPromedio")
    .textContent =
    `${columnaMetrica}: ${promedio.toFixed(2)}`;

    document
    .getElementById("kpiMaximo")
    .textContent =
    `${columnaMetrica}: ${maximo.toLocaleString()}`;

}
