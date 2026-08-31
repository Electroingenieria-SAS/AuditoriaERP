
// =====================================
// BI UPLOAD
// =====================================

let datosExcel = [];
let columnasExcel = [];

document.addEventListener("DOMContentLoaded", () => {

    const inputExcel = document.getElementById("excelBI");

    if (inputExcel) {

        inputExcel.addEventListener(
            "change",
            leerExcel
        );

    }

});

function leerExcel(evento) {

    const archivo = evento.target.files[0];

    if (!archivo) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        const data = e.target.result;

        const workbook = XLSX.read(
            data,
            { type: "binary" }
        );

        const nombreHoja =
            workbook.SheetNames[0];

        const hoja =
            workbook.Sheets[nombreHoja];

        datosExcel =
            XLSX.utils.sheet_to_json(
                hoja,
                { defval: "" }
            );

        if (!datosExcel.length) {

            notifAlert(
                "El archivo no contiene datos."
            );

            return;

        }

        columnasExcel =
            Object.keys(datosExcel[0]);

        console.log(
            "Datos cargados:",
            datosExcel
        );

        console.log(
            "Columnas:",
            columnasExcel
        );

        inicializarDashboardBI();

    };

    reader.readAsBinaryString(
        archivo
    );

}

function cargarSelectores() {

    const dimension =
        document.getElementById(
            "dimension"
        );

    const metrica =
        document.getElementById(
            "metrica"
        );

    if (
        !dimension ||
        !metrica
    ) return;

    dimension.innerHTML = "";
    metrica.innerHTML = "";

    columnasTexto.forEach(col => {

        dimension.innerHTML += `
        <option value="${col}">
            ${col}
        </option>
        `;

    });

    columnasNumericas.forEach(col => {

        metrica.innerHTML += `
        <option value="${col}">
            ${col}
        </option>
        `;

    });

}
