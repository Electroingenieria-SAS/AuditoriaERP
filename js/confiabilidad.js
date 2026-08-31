//==========================================================
// EI AUDITORÍA ERP
// MÓDULO CONFIABILIDAD DE INVENTARIO 
//==========================================================
//==========================================================
// IIFE (FUNCIÓN AUTOEJECUTABLE)
// -----------------------------------------------------------
// Este módulo se recarga dinámicamente cada vez que el
// usuario entra a "Confiabilidad" (dashboard.js quita el
// <script> anterior y agrega uno nuevo). Si "const ICONOS"
// y "class ConfiabilidadInventario" quedan declarados en el
// scope global, la SEGUNDA vez que se carga el script el
// navegador lanza "Identifier ... has already been declared"
// y el archivo completo deja de ejecutarse: por eso el
// módulo "se ponía en cero" al volver a entrar, aunque los
// datos seguían guardados en localStorage.
// Envolviendo todo en esta función, cada recarga usa su
// propio scope aislado y el script puede ejecutarse las
// veces que sea necesario sin choques.
//==========================================================
(function(){
"use strict";

//==========================================================
// ÍCONOS SVG EN LÍNEA
// (antes se usaban clases Font Awesome tipo "fa-solid fa-x",
// que dependían de un CDN externo. Se reemplazan por SVG en
// línea para que siempre se vean, sin depender de internet)
//==========================================================

const ICONOS = {

    guardar:`<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h8V4M8 20v-6h8v6"/></svg>`,

    ojo:`<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,

    lapiz:`<svg viewBox="0 0 24 24"><path d="M4 20l1-4.2L15.6 5.2a1.5 1.5 0 0 1 2.1 0l1.1 1.1a1.5 1.5 0 0 1 0 2.1L8.2 19 4 20z"/></svg>`,

    papelera:`<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/></svg>`,

    cajaAbierta:`<svg viewBox="0 0 24 24"><path d="M3 9.5 12 6l9 3.5"/><path d="M3 9.5V18l9 3.5 9-3.5V9.5"/><path d="M12 6v6M3 9.5l9 3.5 9-3.5"/></svg>`

};

class ConfiabilidadInventario{

    //======================================================
    // CONSTRUCTOR
    //======================================================

    constructor(){

        this.dom = {};

        this.form = {};

        this.preview = {};

        this.dashboard = {};

       this.state = {

    analisis: JSON.parse(

        localStorage.getItem(
            "confiabilidadInventario"
        )

    ) || [],

    actual:null,

    editando:false,

    indiceEditar:null

};

        this.init();

    }

    //======================================================
    // INICIO
    //======================================================

    init(){

    this.cargarDOM();

    if(!this.validarDOM()){

        console.error(
            "No se encontró el HTML del módulo."
        );

        return;

    }


    this.eventos();

this.actualizarDashboardInicial();

this.cargarAnalisis();

}
    //======================================================
    // CARGAR HTML
    //======================================================

    cargarDOM(){

        const $ = id =>

        document.getElementById(id);

        //=========================
        // MODAL
        //=========================

        this.dom.modal =

        $("modalConfiabilidad");

        this.dom.btnNuevo =

        $("btnNuevoAnalisis");

        this.dom.btnCerrar =

        $("cerrarModalConfiabilidad");

        this.dom.btnCancelar =

        $("cancelarAnalisis");

        this.dom.btnGuardar =

        $("guardarAnalisis");

        //=========================
        // TABLA
        //=========================

        this.dom.tabla =

        $("tablaConfiabilidad");

        this.dom.buscar =

        $("buscarAnalisis");

        //=========================
        // ALERTAS
        //=========================

        this.dom.alertas =

        $("contenedorAlertas");

        //=========================
        // DIAGNOSTICO
        //=========================

        this.dom.diagnostico =

        $("diagnosticoTexto");

        this.dom.estadoDiagnostico =

        $("diagnosticoEstado");


            //=========================
        // DASHBOARD
        //=========================

        this.dashboard.indice =
        $("indiceGeneral");

        this.dashboard.estado =
        $("estadoGeneral");

        this.dashboard.mensaje =
        $("mensajeGeneral");

        this.dashboard.fisica =
        $("kpiFisica");

        this.dashboard.economica =
        $("kpiEconomica");

        this.dashboard.cobertura =
        $("kpiCobertura");

        this.dashboard.cumplimiento =
        $("kpiCumplimiento");

        this.dashboard.ajustes =
        $("kpiAjustes");

        this.dashboard.ejecutados =
        $("kpiEjecutados");

        this.dashboard.meta =
        $("metaAnual");

        this.dashboard.auditados =
        $("auditadosAcumulados");

        this.dashboard.pendientes =
        $("pendientesAnuales");

        this.dashboard.acumulado =
        $("indiceAcumulado");

        this.dashboard.avanceTexto =
        $("avanceTexto");

        this.dashboard.avancePorcentaje =
        $("avancePorcentaje");

        this.dashboard.avanceBarra =
        $("avanceBarra");

        //=========================
        // PREVIEW
        //=========================

        this.preview.indice =
        $("previewIndice");

        this.preview.fisica =
        $("previewFisica");

        this.preview.economica =
        $("previewEconomica");

        this.preview.cobertura =
        $("previewCobertura");

        this.preview.cumplimiento =
        $("previewCumplimiento");

        this.preview.ajustes =
        $("previewAjustes");

        this.preview.estado =
        $("previewEstado");

        //=========================
        // FORMULARIO
        //=========================

        this.form.anio =
        $("anioInput");

        this.form.mes =
        $("mesInput");

        this.form.nombre =
        $("nombreInventarioInput");

        this.form.total =
        $("totalEmpresaInput");

        this.form.programados =
        $("programadosInput");

        this.form.auditados =
        $("auditadosInput");

        this.form.correctos =
        $("correctosInput");

        this.form.sobrantes =
        $("sobrantesInput");

        this.form.faltantes =
        $("faltantesInput");

        this.form.valorInventario =
        $("valorInventarioInput");

        this.form.valorAuditado =
        $("valorAuditadoInput");

        this.form.valorDiferencias =
        $("valorDiferenciasInput");

        this.form.valorAjustes =
        $("valorAjustesInput");

    }

    //======================================================
    // VALIDAR HTML
    //======================================================

    validarDOM(){

        return (

            Object.values(this.dom).every(Boolean)

            &&

            Object.values(this.dashboard).every(Boolean)

            &&

            Object.values(this.preview).every(Boolean)

            &&

            Object.values(this.form).every(Boolean)

        );

    }

    //======================================================
    // EVENTOS
    //======================================================

    eventos(){

        //=========================
        // BOTONES
        //=========================

        this.dom.btnNuevo.addEventListener(

            "click",

            () => this.abrirModal()

        );

        this.dom.btnCerrar.addEventListener(

            "click",

            () => this.cerrarModal()

        );

        this.dom.btnCancelar.addEventListener(

            "click",

            () => this.cerrarModal()

        );

        //=========================
        // CERRAR AL HACER CLICK AFUERA
        //=========================

        this.dom.modal.addEventListener(

            "click",

            (e)=>{

                if(e.target===this.dom.modal){

                    this.cerrarModal();

                }

            }

        );

        //=========================
        // INPUTS
        //=========================

        Object.values(this.form).forEach(campo=>{

            if(!campo) return;

            campo.addEventListener(

                "input",

                ()=>this.actualizarPreview()

            );

            if(campo.tagName==="SELECT"){

                campo.addEventListener(

                    "change",

                    ()=>this.actualizarPreview()

                );

            }

        });

        //=========================
        // GUARDAR
        //=========================

        this.dom.btnGuardar.addEventListener(

            "click",

            ()=>this.guardar()

        );

        //=========================
        // BUSCADOR
        //=========================

        this.dom.buscar.addEventListener(

            "input",

            ()=>this.buscar()

        );

    }

    //======================================================
    // MODAL
    //======================================================

    abrirModal(){

    this.dom.modal.classList.add("active");

    document.body.style.overflow = "hidden";

}

//======================================================
// CERRAR MODAL
//======================================================

cerrarModal(){

    this.dom.modal.classList.remove("active");

    document.body.style.overflow = "";

    this.state.editando = false;

    this.state.indiceEditar = null;

    this.dom.btnGuardar.style.display = "";

    this.dom.btnGuardar.innerHTML = `
        ${ICONOS.guardar}
        Guardar Análisis
    `;

}
    //======================================================
    // UTILIDADES
    //======================================================

    numero(valor){

        return Number(valor)||0;

    }

    porcentaje(valor){

        return Number(valor).toFixed(2)+"%";

    }

    //======================================================
    // LEER FORMULARIO
    //======================================================

    obtenerDatos(){

        return{

            anio:this.numero(this.form.anio.value),

            mes:this.form.mes.value,

            nombre:this.form.nombre.value.trim(),

            totalEmpresa:this.numero(this.form.total.value),

            programados:this.numero(this.form.programados.value),

            auditados:this.numero(this.form.auditados.value),

            correctos:this.numero(this.form.correctos.value),

            sobrantes:this.numero(this.form.sobrantes.value),

            faltantes:this.numero(this.form.faltantes.value),

            valorInventario:this.numero(
                this.form.valorInventario.value
            ),

            valorAuditado:this.numero(
                this.form.valorAuditado.value
            ),

            valorDiferencias:this.numero(
                this.form.valorDiferencias.value
            ),

            valorAjustes:this.numero(
                this.form.valorAjustes.value
            )

        };

    }

  

    //======================================================
    // VALIDAR FORMULARIO
    //======================================================

    validar(datos){

        if(datos.nombre===""){

            notifAlert("Ingrese el nombre del inventario.");

            return false;

        }

        if(datos.programados>datos.totalEmpresa){

            notifAlert("Los programados no pueden superar el total empresa.");

            return false;

        }

        if(datos.auditados>datos.programados){

            notifAlert("Los auditados no pueden superar los programados.");

            return false;

        }

        if(datos.correctos>datos.auditados){

            notifAlert("Los correctos no pueden superar los auditados.");

            return false;

        }

        if(

            datos.sobrantes +

            datos.faltantes >

            datos.auditados

        ){

            notifAlert(

                "Sobrantes + Faltantes no pueden superar los auditados."

            );

            return false;

        }

        if(

            datos.valorAuditado >

            datos.valorInventario

        ){

            notifAlert(

                "El valor auditado no puede superar el valor inventario."

            );

            return false;

        }

        return true;

    }



   //======================================================
// CALCULAR INDICADORES
//======================================================

calcular(datos){

    //=========================================
    // SI AÚN NO SE HA AUDITADO NADA
    // NO SE CALCULAN LOS INDICADORES
    //=========================================

    if (datos.auditados === 0) {

        return {

            cobertura: 0,

            cumplimiento: 0,

            fisica: 0,

            economica: 0,

            ajustes: 0,

            indice: 0

        };

    }

    const cobertura =

        datos.totalEmpresa>0

        ? (datos.auditados/datos.totalEmpresa)*100

        :0;

    const cumplimiento =

            datos.programados>0

            ? (datos.auditados/datos.programados)*100

            :0;

        const fisica =

            datos.auditados>0

            ? (datos.correctos/datos.auditados)*100

            :0;

        const economica =

            datos.valorAuditado>0

            ? (

                (datos.valorAuditado-datos.valorDiferencias)

                /datos.valorAuditado

            )*100

            :0;

        const ajustes =

            datos.valorInventario>0

            ?(

                (datos.valorInventario-datos.valorAjustes)

                /datos.valorInventario

            )*100

            :0;

        const indice =

            fisica*0.35+

            economica*0.35+

            ajustes*0.15+

            cobertura*0.10+

            cumplimiento*0.05;

        return{

            cobertura,

            cumplimiento,

            fisica,

            economica,

            ajustes,

            indice

        };

    }

    //======================================================
    // ESTADO DEL ÍNDICE
    //======================================================

    obtenerEstado(indice){

        if(indice >= 98){

            return{

                nombre:"EXCELENTE",

                clase:"excelente",

                mensaje:"La confiabilidad del inventario es excelente."

            };

        }

        if(indice >= 95){

            return{

                nombre:"MUY BUENA",

                clase:"buena",

                mensaje:"La confiabilidad del inventario es muy buena."

            };

        }

        if(indice >= 90){

            return{

                nombre:"BUENA",

                clase:"normal",

                mensaje:"La confiabilidad del inventario es buena."

            };

        }

        if(indice >= 80){

            return{

                nombre:"CRÍTICA",

                clase:"critica",

                mensaje:"La confiabilidad requiere atención."

            };

        }

        return{

            nombre:"ALARMANTE",

            clase:"alarmante",

            mensaje:"Se recomienda intervenir inmediatamente."

        };

    }

    //======================================================
    // ACTUALIZAR PREVIEW
    //======================================================

   actualizarPreview(){

    const datos = this.obtenerDatos();

    const indicadores = this.calcular(datos);

    this.preview.indice.textContent =
    this.porcentaje(indicadores.indice);

    this.preview.fisica.textContent =
    this.porcentaje(indicadores.fisica);

    this.preview.economica.textContent =
    this.porcentaje(indicadores.economica);

    this.preview.cobertura.textContent =
    this.porcentaje(indicadores.cobertura);

    this.preview.cumplimiento.textContent =
    this.porcentaje(indicadores.cumplimiento);

    this.preview.ajustes.textContent =
    this.porcentaje(indicadores.ajustes);

    const estado = this.obtenerEstado(
        indicadores.indice
    );

    this.preview.estado.textContent =
    estado.nombre;

    this.preview.estado.className =
    `conf-preview-status ${estado.clase}`;

    this.actualizarDashboard(indicadores);

}

    //======================================================
    // DASHBOARD
    //======================================================

    actualizarDashboard(indicadores){

        const estado = this.obtenerEstado(
            indicadores.indice
        );

        this.dashboard.indice.textContent =
        this.porcentaje(indicadores.indice);

        this.dashboard.fisica.textContent =
        this.porcentaje(indicadores.fisica);

        this.dashboard.economica.textContent =
        this.porcentaje(indicadores.economica);

        this.dashboard.cobertura.textContent =
        this.porcentaje(indicadores.cobertura);

        this.dashboard.cumplimiento.textContent =
        this.porcentaje(indicadores.cumplimiento);

        this.dashboard.ajustes.textContent =
        this.porcentaje(indicadores.ajustes);

        this.dashboard.estado.textContent =
        estado.nombre;

        this.dashboard.estado.className =
        `conf-indice-estado ${estado.clase}`;

        this.dashboard.mensaje.textContent =
        estado.mensaje;

    }

    //======================================================
    // DASHBOARD INICIAL
    //======================================================

    actualizarDashboardInicial(){

        this.actualizarDashboard({

            indice:0,

            fisica:0,

            economica:0,

            cobertura:0,

            cumplimiento:0,

            ajustes:0

        });

    }

//======================================================
// GUARDAR / ACTUALIZAR
//======================================================
async guardar(){

    const datos = this.obtenerDatos();

    if(!this.validar(datos)){
        return;
    }

    const indicadores = this.calcular(datos);

    const usuarioLogueado =

    JSON.parse(
        localStorage.getItem("usuarioLogueado")
    );

    const analisis = {

        anio: datos.anio,

        mes: datos.mes,

        nombre: datos.nombre,

        total_empresa: datos.totalEmpresa,

        programados: datos.programados,

        auditados: datos.auditados,

        correctos: datos.correctos,

        sobrantes: datos.sobrantes,

        faltantes: datos.faltantes,

        valor_inventario: datos.valorInventario,

        valor_auditado: datos.valorAuditado,

        valor_diferencias: datos.valorDiferencias,

        valor_ajustes: datos.valorAjustes,

        cobertura: indicadores.cobertura,

        cumplimiento: indicadores.cumplimiento,

        fisica: indicadores.fisica,

        economica: indicadores.economica,

        ajustes: indicadores.ajustes,

        indice: indicadores.indice,

        fecha: new Date(),

        usuario: usuarioLogueado?.usuario || "Sistema"

    };

    const { error } =

    await window.supabaseClient

    .from("confiabilidad_inventario")

    .insert([analisis]);

    if(error){

        console.error(error);

        notifAlert(error.message);

        return;

    }

    notifAlert("Análisis guardado correctamente.");

   await this.cargarAnalisis();

this.actualizarResumen();

this.limpiarFormulario();

this.cerrarModal();

}


   
  guardarLocal(){

    localStorage.setItem(

        "confiabilidadInventario",

        JSON.stringify(

            this.state.analisis

        )

    );

}

//======================================================
// CARGAR DESDE SUPABASE
//======================================================

async cargarAnalisis(){

    const { data, error } = await window.supabaseClient

        .from("confiabilidad_inventario")

        .select("*")

        .order("id", { ascending: false });

    if(error){

        console.error(error);

        return;

    }

    this.state.analisis = data || [];

    this.renderHistorial();

    this.actualizarResumen();

}

   //======================================================
// LIMPIAR FORMULARIO
//======================================================

limpiarFormulario(){

    Object.values(this.form).forEach(campo=>{

        if(!campo) return;

        if(campo.tagName==="SELECT"){

            campo.selectedIndex=0;

        }else{

            campo.value="";

        }

    });

}
//======================================================
// HISTORIAL
//======================================================

renderHistorial(){

    if(!this.dom.tabla){

        return;

    }

    if(this.state.analisis.length===0){

        this.dom.tabla.innerHTML=`

            <tr>

                <td colspan="9" class="conf-table-empty">

                    ${ICONOS.cajaAbierta}

                    <p>Aún no existen análisis registrados.</p>

                </td>

            </tr>

        `;

        return;

    }

    this.dom.tabla.innerHTML="";

    this.state.analisis.forEach((item,index)=>{

        const estado = this.obtenerEstado(item.indice);

        const avance = item.programados > 0

            ? (item.auditados / item.programados) * 100

            : 0;

        this.dom.tabla.innerHTML += `

            <tr>

                <td>${item.anio}</td>

                <td>${item.mes}</td>

                <td>${item.nombre}</td>

                <td>

                    <strong>

                        ${item.auditados} / ${item.programados}

                    </strong>

                    <small>

                        ${this.porcentaje(avance)}

                    </small>

                    <div class="conf-progress-bar">

                        <div
                            class="conf-progress-fill"
                            style="width:${Math.min(avance,100)}%">

                        </div>

                    </div>

                </td>

                <td>

                    ${this.porcentaje(item.indice)}

                </td>

                <td>

                    <span class="conf-estado ${estado.clase}">

                        ${estado.nombre}

                    </span>

                </td>

                <td>${item.fecha}</td>

                <td>${item.usuario}</td>

                <td>

                    <div class="conf-table-actions">

                        <button
                            class="conf-btn-table ver"
                            data-ver="${index}"
                            title="Ver">

                            ${ICONOS.ojo}

                        </button>

                        <button
                            class="conf-btn-table editar"
                            data-editar="${index}"
                            title="Editar">

                            ${ICONOS.lapiz}

                        </button>

                        <button
                            class="conf-btn-table eliminar"
                            data-eliminar="${index}"
                            title="Eliminar">

                            ${ICONOS.papelera}

                        </button>

                    </div>

                </td>

            </tr>

        `;

    });

    this.eventosTabla();

}
 //======================================================
// EVENTOS TABLA
//======================================================

eventosTabla(){

    //=========================
    // VER
    //=========================
    this.dom.tabla
    .querySelectorAll("[data-ver]")
    .forEach(boton=>{

        boton.addEventListener("click",()=>{

            this.verAnalisis(
                Number(boton.dataset.ver)
            );

        });

    });

    //=========================
    // EDITAR
    //=========================
    this.dom.tabla
    .querySelectorAll("[data-editar]")
    .forEach(boton=>{

        boton.addEventListener("click",()=>{

            this.editarAnalisis(
                Number(boton.dataset.editar)
            );

        });

    });

    //=========================
    // ELIMINAR
    //=========================
    this.dom.tabla
    .querySelectorAll("[data-eliminar]")
    .forEach(boton=>{

        boton.addEventListener("click",()=>{

            this.eliminarAnalisis(
                Number(boton.dataset.eliminar)
            );

        });

    });

}
    
        //======================================================
    // RESUMEN EJECUTIVO
    //======================================================

    actualizarResumen(){

        const total = this.state.analisis.length;

        if(total===0){

            this.dashboard.ejecutados.textContent="0";

            this.dashboard.meta.textContent="0";

            this.dashboard.auditados.textContent="0";

            this.dashboard.pendientes.textContent="0";

            this.dashboard.acumulado.textContent="0.00%";

            this.dashboard.avanceTexto.textContent="0 / 0 Ítems";

            this.dashboard.avancePorcentaje.textContent="0.00%";

            this.dashboard.avanceBarra.style.width="0%";

            return;

        }

        const ultimo=this.state.analisis[total-1];

        const meta=ultimo.total_empresa;

       const auditados = this.state.analisis.reduce(
    (suma, item) => suma + (Number(item.auditados) || 0),
    0
);

      const pendientes = meta - auditados;

this.dashboard.pendientes.textContent =
pendientes > 0 ? pendientes : 0;

        const promedio=this.state.analisis.reduce(

            (suma,item)=>suma+item.indice,

            0

        )/total;

        const avance=

            meta>0

            ? (auditados/meta)*100

            :0;

        this.dashboard.ejecutados.textContent=total;

        this.dashboard.meta.textContent=meta;

        this.dashboard.auditados.textContent=auditados;

        this.dashboard.pendientes.textContent=pendientes;

        this.dashboard.acumulado.textContent=

            this.porcentaje(promedio);

        this.dashboard.avanceTexto.textContent=

            `${auditados} / ${meta} Ítems`;

        this.dashboard.avancePorcentaje.textContent=

            this.porcentaje(avance);

        this.dashboard.avanceBarra.style.width=

            Math.min(avance,100)+"%";

    }

    //======================================================
    // DIAGNÓSTICO
    //======================================================

    actualizarDiagnostico(indicadores){

        if(!this.dom.diagnostico){

            return;

        }

        const estado=this.obtenerEstado(

            indicadores.indice

        );

        this.dom.estadoDiagnostico.textContent=

            estado.nombre;

        this.dom.estadoDiagnostico.className=

            `conf-diagnostico-status ${estado.clase}`;

        this.dom.diagnostico.textContent=

            estado.mensaje;

    }

    //======================================================
    // ALERTAS
    //======================================================

    actualizarAlertas(indicadores){

        if(!this.dom.alertas){

            return;

        }

        let html="";

        if(indicadores.cobertura<70){

            html+=`

                <div class="conf-alert warning">

                    Cobertura inferior al 70%.

                </div>

            `;

        }

        if(indicadores.cumplimiento<90){

            html+=`

                <div class="conf-alert warning">

                    Cumplimiento inferior al 90%.

                </div>

            `;

        }

        if(indicadores.fisica<95){

            html+=`

                <div class="conf-alert danger">

                    Existen diferencias físicas importantes.

                </div>

            `;

        }

        if(html===""){

            html=`

                <div class="conf-alert success">

                    No existen alertas.

                </div>

            `;

        }

        this.dom.alertas.innerHTML=html;

    }

    //======================================================
    // BUSCADOR
    //======================================================



buscar(){

    const texto =

        this.dom.buscar.value.toLowerCase();

    this.dom.tabla

        .querySelectorAll("tr")

        .forEach(fila=>{

            fila.style.display =

                fila.textContent

                    .toLowerCase()

                    .includes(texto)

                ? ""

                : "none";

        });

}
//======================================================
// EDITAR ANÁLISIS
//======================================================

verAnalisis(indice){

    const analisis = this.state.analisis[indice];

    if(!analisis){
        return;
    }

    this.form.anio.value = analisis.anio;
    this.form.mes.value = analisis.mes;
    this.form.nombre.value = analisis.nombre;
    this.form.total.value = analisis.total_empresa;
    this.form.programados.value = analisis.programados;
    this.form.auditados.value = analisis.auditados;
    this.form.correctos.value = analisis.correctos;
    this.form.sobrantes.value = analisis.sobrantes;
    this.form.faltantes.value = analisis.faltantes;
    this.form.valorInventario.value = analisis.valor_inventario;
    this.form.valorAuditado.value = analisis.valor_auditado;
    this.form.valorDiferencias.value = analisis.valor_diferencias;
    this.form.valorAjustes.value = analisis.valor_ajustes;

    this.actualizarPreview();

    this.dom.btnGuardar.style.display = "none";

    this.abrirModal();

}

  //======================================================
// EDITAR ANÁLISIS
//======================================================

editarAnalisis(indice){

    this.verAnalisis(indice);

    this.dom.btnGuardar.innerHTML = `

        ${ICONOS.guardar}

        Actualizar Análisis

    `;

}
    //======================================================
    // ELIMINAR ANÁLISIS
    //======================================================

   async eliminarAnalisis(indice){

    if(!await Notif.confirm("Esta acción no se puede deshacer.", "¿Desea eliminar este análisis?")){
        return;
    }

    const analisis = this.state.analisis[indice];

    const { error } = await window.supabaseClient
        .from("confiabilidad_inventario")
        .delete()
        .eq("id", analisis.id);

    if(error){
        console.error(error);
        notifAlert(error.message);
        return;
    }

    await this.cargarAnalisis();

    this.actualizarResumen();

    this.actualizarDashboardInicial();

    notifAlert("Análisis eliminado correctamente.");

}

}

//======================================================
// INICIALIZAR MÓDULO
//======================================================

window.confiabilidad = new ConfiabilidadInventario();

//==========================================================
// FIN IIFE
//==========================================================
})();
