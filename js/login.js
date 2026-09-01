/**
 * ====================================================================
 * LOGIN CONTROLLER — AUDIT SYSTEM SECURITY GATEWAY
 * ====================================================================
 * Versión: 2.7.0
 * Funcionalidades:
 *  - Rate Limiting defensivo progresivo (Anti-Brute Force).
 *  - Sanitización estricta de entradas.
 *  - Transición HUD de validación biométrica / "Acceso Autorizado".
 *  - Manejo de roles, sesiones y estados de cuenta (Activo/Inactivo).
 */

(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  const authOverlay = document.getElementById('authOverlay');
  const scannerStatus = document.getElementById('scannerStatus');
  const btnLogin = document.getElementById('btnLogin');

  // Control local de tasa de intentos (Rate Limiting)
  const rateLimitConfig = window.ERP_CONFIG?.RATE_LIMIT || {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MS: 60000
  };

  const RATE_LIMIT = {
    MAX_ATTEMPTS: rateLimitConfig.MAX_LOGIN_ATTEMPTS || 5,
    WINDOW_MS: rateLimitConfig.LOCKOUT_DURATION_MS || 60000,
    attempts: 0,
    lockUntil: 0
  };

  if (form) {
    form.addEventListener('submit', handleLogin);
  }

  // Sanitización contra inyecciones y caracteres no permitidos
  function sanitizeInput(str) {
    return String(str || '')
      .replace(/[<>'"`;()]/g, '')
      .trim();
  }

  function checkRateLimit() {
    const now = Date.now();
    if (now < RATE_LIMIT.lockUntil) {
      const remainingSecs = Math.ceil((RATE_LIMIT.lockUntil - now) / 1000);
      return {
        blocked: true,
        msg: `Demasiados intentos fallidos. Terminal bloqueada por ${remainingSecs}s.`
      };
    }
    return { blocked: false };
  }

  function registerFailedAttempt() {
    RATE_LIMIT.attempts += 1;
    if (RATE_LIMIT.attempts >= RATE_LIMIT.MAX_ATTEMPTS) {
      RATE_LIMIT.lockUntil = Date.now() + RATE_LIMIT.WINDOW_MS;
      RATE_LIMIT.attempts = 0;
    }
  }

  function setLoadingState(isLoading, message = '') {
    if (!authOverlay) return;

    if (isLoading) {
      authOverlay.classList.add('active');
      if (scannerStatus) scannerStatus.innerText = message;
      if (btnLogin) btnLogin.disabled = true;
    } else {
      authOverlay.classList.remove('active');
      if (btnLogin) btnLogin.disabled = false;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();

    const rateCheck = checkRateLimit();
    if (rateCheck.blocked) {
      if (typeof window.notifAlert === 'function') {
        window.notifAlert(rateCheck.msg);
      }
      return;
    }

    const usuarioInput = document.getElementById('usuario');
    const passwordInput = document.getElementById('password');

    if (!usuarioInput || !passwordInput) {
      window.notifAlert('Error en campos de autenticación.');
      return;
    }

    const usuario = sanitizeInput(usuarioInput.value.toLowerCase());
    const password = passwordInput.value.trim();

    if (!usuario || !password) {
      window.notifAlert('Debe ingresar su identificador y contraseña.');
      return;
    }

    if (!window.supabaseClient) {
      window.notifAlert('Error conectando con el Gateway central de Supabase.');
      return;
    }

    // Activar estado visual de escaneo
    setLoadingState(true, 'VERIFICANDO IDENTIDAD & PRIVILEGIOS...');

    try {
      // Retardo visual deliberado para efecto tech de escaneo
      await new Promise(r => setTimeout(r, 750));

      const { data, error } = await window.supabaseClient
        .from('usuarios')
        .select('id, usuario, rol, estado')
        .eq('usuario', usuario)
        .eq('password', password)
        .limit(1);

      if (error) {
        console.error('Error Supabase Login:', error.message);
        registerFailedAttempt();
        setLoadingState(false);
        window.notifAlert('Error de comunicación con la base de datos.');
        return;
      }

      if (!data || data.length === 0) {
        registerFailedAttempt();
        setLoadingState(false);
        window.notifAlert('Identificador o contraseña incorrectos.');
        return;
      }

      const usuarioData = data[0];

      if (usuarioData.estado !== 'Activo') {
        setLoadingState(false);
        window.notifAlert('Su cuenta se encuentra suspendida o inactiva.');
        return;
      }

      // Resetear rate limiting tras éxito
      RATE_LIMIT.attempts = 0;

      // Almacenar información de sesión segura
      localStorage.setItem('usuarioLogueado', JSON.stringify({
        usuario: usuarioData.usuario,
        rol: usuarioData.rol
      }));

      // Registrar inicio de sesión en historial
      try {
        await window.supabaseClient.from('historial').insert([{
          usuario: usuarioData.usuario,
          accion: 'LOGIN',
          modulo: 'autenticacion',
          descripcion: `Inicio de sesión exitoso desde terminal web (Rol: ${usuarioData.rol})`
        }]);
      } catch (_) {
        // Fallback silencioso
      }

      if (scannerStatus) scannerStatus.innerText = 'ACCESO AUTORIZADO';

      setTimeout(() => {
        setLoadingState(false);
        window.mostrarBienvenida(usuarioData.usuario, usuarioData.rol);
      }, 400);

    } catch (err) {
      console.error('Excepción crítica en login:', err);
      setLoadingState(false);
      window.notifAlert('Fallo inesperado durante la autenticación.');
    }
  }

  window.mostrarBienvenida = function (usuario, rol) {
    const userEl = document.getElementById('bienvenidaUsuario');
    const rolEl = document.getElementById('bienvenidaRol');
    const modal = document.getElementById('modalBienvenida');

    if (userEl) userEl.innerText = usuario.toUpperCase();
    if (rolEl) rolEl.innerText = (rol || 'Auditor').toUpperCase();
    if (modal) modal.style.display = 'flex';

    if (typeof window.crearNotificacion === 'function') {
      window.crearNotificacion(`Bienvenido al sistema, ${usuario}`, 'success', 'Acceso Autorizado', false);
    }
  };

  window.cerrarModalBienvenida = function () {
    const modal = document.getElementById('modalBienvenida');
    if (modal) modal.style.display = 'none';
    window.location.href = 'dashboard.html';
  };

  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modalBienvenida');
    if (modal) modal.style.display = 'none';
  });
})();
