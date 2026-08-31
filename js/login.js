// =====================================
// LOGIN JS - AUDIT SYSTEM
// =====================================

const form = document.getElementById('loginForm');
const authOverlay = document.getElementById('authOverlay');
const scannerStatus = document.getElementById('scannerStatus');
const btnLogin = document.getElementById('btnLogin');

// Control local de tasa de intentos (Rate Limiting)
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  WINDOW_MS: 60000, // 1 minuto de bloqueo
  attempts: 0,
  lockUntil: 0
};

if (form) {
  form.addEventListener('submit', handleLogin);
}

// Sanitización contra inyecciones y caracteres extraños
function sanitizeInput(str) {
  return String(str || '')
    .replace(/[<>'"`;()]/g, '')
    .trim();
}

function checkRateLimit() {
  const now = Date.now();
  if (now < RATE_LIMIT.lockUntil) {
    const remainingSecs = Math.ceil((RATE_LIMIT.lockUntil - now) / 1000);
    return { blocked: true, msg: `Demasiados intentos. Bloqueo temporal por ${remainingSecs}s.` };
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

async function handleLogin(e) {
  e.preventDefault();

  const rateCheck = checkRateLimit();
  if (rateCheck.blocked) {
    notifAlert(rateCheck.msg);
    return;
  }

  const usuarioInput = document.getElementById('usuario');
  const passwordInput = document.getElementById('password');

  if (!usuarioInput || !passwordInput) {
    notifAlert('Error en campos de autenticación');
    return;
  }

  const usuario = sanitizeInput(usuarioInput.value.toLowerCase());
  const password = passwordInput.value.trim();

  if (!usuario || !password) {
    notifAlert('Debe completar todos los campos');
    return;
  }

  if (!window.supabaseClient) {
    notifAlert('Error de conexión con el gateway central');
    return;
  }

  // Activar estado visual de "Autenticando..."
  setLoadingState(true, 'AUTENTICANDO CREDENCIALES...');

  try {
    // Retardo visual deliberado para efecto tech de escaneo
    await new Promise(r => setTimeout(r, 900));

    const { data, error } = await window.supabaseClient
      .from('usuarios')
      .select('usuario, rol, estado')
      .eq('usuario', usuario)
      .eq('password', password)
      .limit(1);

    if (error) {
      console.error(error);
      registerFailedAttempt();
      setLoadingState(false);
      notifAlert('Error conectando con la base de datos');
      return;
    }

    if (!data || data.length === 0) {
      registerFailedAttempt();
      setLoadingState(false);
      notifAlert('Usuario o contraseña no autorizados');
      return;
    }

    const usuarioData = data[0];

    if (usuarioData.estado === 'Inactivo') {
      setLoadingState(false);
      notifAlert('Cuenta suspendida o inactiva');
      return;
    }

    // Resetear rate limiting
    RATE_LIMIT.attempts = 0;

    // Almacenar solo la información requerida (sin exponer hashes ni password)
    localStorage.setItem('usuarioLogueado', JSON.stringify({
      usuario: usuarioData.usuario,
      rol: usuarioData.rol
    }));

    scannerStatus.innerText = 'ACCESO CONFIRMADO';

    setTimeout(() => {
      setLoadingState(false);
      window.mostrarBienvenida(usuarioData.usuario, usuarioData.rol);
    }, 500);

  } catch (error) {
    console.error(error);
    setLoadingState(false);
    notifAlert('Fallo crítico de autenticación');
  }
}

function setLoadingState(isLoading, message = '') {
  if (isLoading) {
    authOverlay.classList.add('active');
    if (scannerStatus) scannerStatus.innerText = message;
    if (btnLogin) btnLogin.disabled = true;
  } else {
    authOverlay.classList.remove('active');
    if (btnLogin) btnLogin.disabled = false;
  }
}

window.mostrarBienvenida = function (usuario, rol) {
  const userEl = document.getElementById('bienvenidaUsuario');
  const rolEl = document.getElementById('bienvenidaRol');
  const modal = document.getElementById('modalBienvenida');

  if (userEl) userEl.innerText = usuario;
  if (rolEl) rolEl.innerText = rol || 'General';
  if (modal) modal.style.display = 'flex';
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
