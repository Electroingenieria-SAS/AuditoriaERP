// =====================================================
// SISTEMA DE NOTIFICACIONES PREMIUM - PERSISTENCIA REAL
// =====================================================

(function(){

  const MAX_HISTORIAL = 50;

  const ICONOS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const TITULOS_DEFECTO = {
    success: '¡Listo!',
    error: 'Ocurrió un error',
    warning: 'Atención',
    info: 'Información'
  };

  const DURACION_MS = 4200;

  // 1. OBTENER CLAVE SEGURA DEL USUARIO ACTUAL
  function obtenerClaveUsuario() {
    let user = 'general';
    try {
      if (window.usuarioLogueado && window.usuarioLogueado.usuario) {
        user = String(window.usuarioLogueado.usuario).toLowerCase().trim();
      } else {
        const sesion = JSON.parse(localStorage.getItem('usuarioLogueado') || '{}');
        if (sesion.usuario) {
          user = String(sesion.usuario).toLowerCase().trim();
        }
      }
    } catch {
      user = 'general';
    }
    return `erp_notif_${user}`;
  }

  // 2. MIGRACIÓN / LIMPIEZA DE BASURAS ANTIGUAS
  function limpiarCacheAntigua() {
    try {
      // Elimina la clave global anterior si quedó huérfana
      if (localStorage.getItem('notificaciones_erp')) {
        localStorage.removeItem('notificaciones_erp');
      }
    } catch (e) {
      console.warn('Error limpiando caché vieja:', e);
    }
  }

  // 3. OBTENER Y GUARDAR HISTORIAL
  function obtenerHistorial() {
    try {
      const key = obtenerClaveUsuario();
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  function guardarHistorial(lista) {
    try {
      const key = obtenerClaveUsuario();
      localStorage.setItem(key, JSON.stringify(lista.slice(0, MAX_HISTORIAL)));
    } catch (e) {
      console.warn('No se pudo guardar el historial:', e);
    }
  }

  // 4. MOTOR DE AUDIO NATIVO
  let audioCtx = null;
  function reproducirSonidoNotificacion(tipo = 'info') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const ahora = audioCtx.currentTime;
      const configSonido = {
        success: [
          { f: 523.25, d: 0.08, t: 0 },
          { f: 659.25, d: 0.12, t: 0.08 },
          { f: 1046.50, d: 0.25, t: 0.18 }
        ],
        warning: [
          { f: 440.00, d: 0.12, t: 0 },
          { f: 554.37, d: 0.20, t: 0.10 }
        ],
        error: [
          { f: 311.13, d: 0.15, t: 0 },
          { f: 233.08, d: 0.28, t: 0.12 }
        ],
        info: [
          { f: 587.33, d: 0.09, t: 0 },
          { f: 880.00, d: 0.18, t: 0.08 }
        ]
      };

      const notas = configSonido[tipo] || configSonido.info;
      notas.forEach(nota => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = tipo === 'error' ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(nota.f, ahora + nota.t);
        gain.gain.setValueAtTime(0.001, ahora + nota.t);
        gain.gain.exponentialRampToValueAtTime(0.18, ahora + nota.t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ahora + nota.t + nota.d);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(ahora + nota.t);
        osc.stop(ahora + nota.t + nota.d);
      });
    } catch (e) {
      console.warn('Audio no disponible:', e);
    }
  }

  // 5. INYECTAR CONTENEDORES SI NO EXISTEN
  function asegurarContenedores(){
    if(!document.getElementById('notifStack')){
      const stack = document.createElement('div');
      stack.id = 'notifStack';
      document.body.appendChild(stack);
    }

    if(!document.getElementById('notifModalOverlay')){
      const overlay = document.createElement('div');
      overlay.id = 'notifModalOverlay';
      overlay.innerHTML =
        '<div class="notif-modal-box" id="notifModalBox">' +
          '<div class="notif-modal-icono" id="notifModalIcono">❓</div>' +
          '<h2 id="notifModalTitulo">Confirmar</h2>' +
          '<p id="notifModalMensaje"></p>' +
          '<div id="notifModalCampoWrap"></div>' +
          '<div class="notif-modal-botones">' +
            '<button class="notif-btn-cancelar" id="notifBtnCancelar" type="button">Cancelar</button>' +
            '<button class="notif-btn-aceptar" id="notifBtnAceptar" type="button">Aceptar</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
    }
  }

  // 6. CONTADOR DE LA CAMPANA (SOLO NO LEÍDAS)
  window.actualizarContadorCampana = function(){
    const contador = document.getElementById('contadorNotificaciones') || document.getElementById('notificacionesCount');
    if(!contador) return;

    const lista = obtenerHistorial();
    const noLeidas = lista.filter(n => !n.leida).length;

    contador.innerText = noLeidas;
    if (noLeidas > 0) {
      contador.style.display = 'inline-flex';
    } else {
      contador.style.display = 'none';
    }
  };

  // 7. TOAST VISUAL
  function toast(tipo, mensaje, titulo){
    asegurarContenedores();
    reproducirSonidoNotificacion(tipo);

    const stack = document.getElementById('notifStack');
    if(!stack) return;

    const el = document.createElement('div');
    el.className = 'notif-toast notif-' + tipo;
    el.innerHTML =
      '<div class="notif-icono">' + (ICONOS[tipo] || 'ℹ️') + '</div>' +
      '<div class="notif-texto">' +
        '<div class="notif-titulo">' + (titulo || TITULOS_DEFECTO[tipo] || 'Notificación') + '</div>' +
        '<div class="notif-mensaje"></div>' +
      '</div>' +
      '<button class="notif-cerrar" type="button">✕</button>' +
      '<div class="notif-barra" style="animation-duration:' + DURACION_MS + 'ms"></div>';

    el.querySelector('.notif-mensaje').innerText = mensaje || '';
    stack.appendChild(el);

    function cerrar(){
      el.classList.add('notif-out');
      setTimeout(function(){
        if(el.parentNode) el.parentNode.removeChild(el);
      }, 350);
    }

    el.querySelector('.notif-cerrar').addEventListener('click', cerrar);
    const timeoutId = setTimeout(cerrar, DURACION_MS);

    el.addEventListener('mouseenter', function(){
      clearTimeout(timeoutId);
      const barra = el.querySelector('.notif-barra');
      if(barra) barra.style.animationPlayState = 'paused';
    });
  }

  // 8. CREAR NOTIFICACIÓN (GLOBAL)
  window.crearNotificacion = function(mensaje, tipo = 'info', titulo = ''){
    titulo = titulo || (tipo === 'success' ? 'Éxito' : tipo === 'error' ? 'Error' : 'Notificación del Sistema');

    try {
      const lista = obtenerHistorial();
      const nueva = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        titulo: titulo,
        mensaje: String(mensaje || ''),
        tipo: tipo,
        leida: false,
        fecha: new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
      };

      lista.unshift(nueva);
      guardarHistorial(lista);
      window.actualizarContadorCampana();

      if(typeof window.renderNotificaciones === 'function'){
        window.renderNotificaciones();
      }

      window.dispatchEvent(new CustomEvent('nuevaNotificacion', { detail: nueva }));
    } catch(err) {
      console.error('Error registrando notificación:', err);
    }

    toast(tipo, mensaje, titulo);
  };

  // 9. ACCIONES DE GESTIÓN (MARCAR, ELIMINAR Y VACIAR)
  window.marcarNotificacionLeida = function(id) {
    const lista = obtenerHistorial();
    const actualizada = lista.map(n => n.id === Number(id) ? { ...n, leida: true } : n);
    guardarHistorial(actualizada);
    window.actualizarContadorCampana();
    if(typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
  };

  window.marcarTodasNotificacionesLeidas = function() {
    const lista = obtenerHistorial();
    const actualizada = lista.map(n => ({ ...n, leida: true }));
    guardarHistorial(actualizada);
    window.actualizarContadorCampana();
    if(typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
  };

  window.eliminarNotificacion = function(id, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const lista = obtenerHistorial();
    const actualizada = lista.filter(n => n.id !== Number(id));
    guardarHistorial(actualizada);
    window.actualizarContadorCampana();
    if(typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
  };

  window.vaciarNotificaciones = function() {
    guardarHistorial([]);
    window.actualizarContadorCampana();
    if(typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
  };

  // 10. RENDERIZADO DEL PANEL DESPLEGABLE
  window.renderNotificaciones = function () {
    const contenedor = document.getElementById('listaNotificaciones') || document.getElementById('notificacionesBody');
    if (!contenedor) return;

    const lista = obtenerHistorial();
    if (lista.length === 0) {
      contenedor.innerHTML = `<div style="text-align:center; padding:24px; color:#94a3b8; font-size:12px;">No tienes notificaciones guardadas.</div>`;
      return;
    }

    contenedor.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:11px;">
        <span onclick="window.marcarTodasNotificacionesLeidas()" style="color:#2563eb; cursor:pointer; font-weight:700;">✓ Marcar todas leídas</span>
        <span onclick="window.vaciarNotificaciones()" style="color:#ef4444; cursor:pointer; font-weight:700;">🗑️ Vaciar todo</span>
      </div>
      ` + lista.map(n => `
      <div onclick="window.marcarNotificacionLeida(${n.id})" style="padding:12px 14px; border-bottom:1px solid #f1f5f9; background:${n.leida ? '#ffffff' : '#f0fdf4'}; cursor:pointer; display:flex; flex-direction:column; gap:4px; position:relative; transition:background 0.2s;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:6px;">
            ${!n.leida ? '<span style="width:7px; height:7px; border-radius:50%; background:#16a34a; display:inline-block;"></span>' : ''}
            <strong style="font-size:12.5px; color:#0f172a;">${n.titulo}</strong>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:10.5px; color:#94a3b8;">${n.fecha}</span>
            <button type="button" onclick="window.eliminarNotificacion(${n.id}, event)" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:13px; padding:0 2px;" title="Eliminar">✕</button>
          </div>
        </div>
        <p style="margin:0; font-size:12px; color:#475569; line-height:1.4;">${n.mensaje}</p>
      </div>
    `).join('');
  };

  // 11. API MODALES ASÍNCRONOS
  window.Notif = {
    success: function(m, t){ toast('success', m, t); },
    error:   function(m, t){ toast('error', m, t); },
    warning: function(m, t){ toast('warning', m, t); },
    info:    function(m, t){ toast('info', m, t); },

    confirm: function(mensaje, titulo){
      asegurarContenedores();
      reproducirSonidoNotificacion('warning');
      return new Promise(resolve => {
        const overlay = document.getElementById('notifModalOverlay');
        const box = document.getElementById('notifModalBox');
        box.style.setProperty('--notif-color', '#ef4444');
        box.style.setProperty('--notif-bg', '#fef2f2');

        document.getElementById('notifModalIcono').innerText = '⚠️';
        document.getElementById('notifModalTitulo').innerText = titulo || '¿Confirmar acción?';
        document.getElementById('notifModalMensaje').innerText = mensaje || '';
        document.getElementById('notifModalCampoWrap').innerHTML = '';

        const btnCancel = document.getElementById('notifBtnCancelar');
        const btnOk = document.getElementById('notifBtnAceptar');
        btnCancel.style.display = 'inline-block';
        btnCancel.innerText = 'Cancelar';
        btnOk.innerText = 'Continuar';

        overlay.classList.add('active');

        function limpiar() {
          overlay.classList.remove('active');
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
        }
        function onOk() { limpiar(); resolve(true); }
        function onCancel() { limpiar(); resolve(false); }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
      });
    },

    prompt: function(mensaje, titulo, valorInicial, opciones){
      asegurarContenedores();
      return new Promise(resolve => {
        const overlay = document.getElementById('notifModalOverlay');
        const box = document.getElementById('notifModalBox');
        box.style.setProperty('--notif-color', '#2563eb');
        box.style.setProperty('--notif-bg', '#eff6ff');

        document.getElementById('notifModalIcono').innerText = '✏️';
        document.getElementById('notifModalTitulo').innerText = titulo || 'Ingreso de datos';
        document.getElementById('notifModalMensaje').innerText = mensaje || '';

        const wrap = document.getElementById('notifModalCampoWrap');
        wrap.innerHTML = '';

        let input;
        if(opciones && Array.isArray(opciones)) {
          input = document.createElement('select');
          opciones.forEach(op => {
            const opt = document.createElement('option');
            opt.value = op;
            opt.innerText = op;
            if(op === valorInicial) opt.selected = true;
            input.appendChild(opt);
          });
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.value = valorInicial || '';
        }
        wrap.appendChild(input);

        const btnCancel = document.getElementById('notifBtnCancelar');
        const btnOk = document.getElementById('notifBtnAceptar');
        btnCancel.style.display = 'inline-block';
        btnOk.innerText = 'Guardar';

        overlay.classList.add('active');
        setTimeout(() => input.focus(), 100);

        function limpiar() {
          overlay.classList.remove('active');
          btnOk.removeEventListener('click', onOk);
          btnCancel.removeEventListener('click', onCancel);
        }
        function onOk() { const val = input.value; limpiar(); resolve(val); }
        function onCancel() { limpiar(); resolve(null); }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
      });
    }
  };

  window.notifAlert = function(m){
    const t = String(m).toLowerCase();
    const tipo = t.includes('error') || t.includes('no se pudo') ? 'error' : t.includes('correct') || t.includes('éxito') ? 'success' : 'warning';
    toast(tipo, m);
  };

  window.mostrarNotificacion = function(t, m, tipo){
    toast(tipo || 'info', m, t);
  };

  // Inicialización y limpieza automática
  function inicializar() {
    limpiarCacheAntigua();
    asegurarContenedores();
    window.actualizarContadorCampana();
    if(typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inicializar);
  } else {
    inicializar();
  }

})();
