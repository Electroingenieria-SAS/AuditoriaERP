/**
 * ====================================================================
 * DASHBOARD MASTER CONTROLLER — SPA ROUTER & REALTIME ENGINE
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  // Validar sesión activa
  const sesionRaw = localStorage.getItem('usuarioLogueado');
  if (!sesionRaw) {
    window.location.href = 'index.html';
    return;
  }

  window.usuarioLogueado = JSON.parse(sesionRaw);
  window.permisosUsuario = window.permisosUsuario || {};

  // Validar cliente Supabase
  if (!window.supabaseClient) {
    if (typeof window.notifAlert === 'function') {
      window.notifAlert('Error de enlace con el servidor central');
    }
  }

  const mainContent = document.getElementById('mainContent');
  const dashboardOriginal = mainContent ? mainContent.innerHTML : '';

  // ==================================================================
  // 1. CONFIGURACIÓN DEL PERFIL EN HEADER
  // ==================================================================
  function configurarPerfilUsuario() {
    const usuario = window.usuarioLogueado?.usuario || 'Usuario';
    const rol = window.usuarioLogueado?.rol || 'Auditor';

    const usuarioNombreEl = document.getElementById('usuarioNombre');
    if (usuarioNombreEl) {
      usuarioNombreEl.textContent = `${usuario} | ${rol.toUpperCase()}`;
    }

    const heroUsuarioEl = document.getElementById('heroUsuario');
    if (heroUsuarioEl) {
      heroUsuarioEl.textContent = usuario;
    }

    const avatarEl = document.getElementById('navbarUserAvatar');
    if (avatarEl) {
      avatarEl.textContent = usuario.charAt(0).toUpperCase();
    }
  }

  // ==================================================================
  // 2. MATRIZ DE PERMISOS GRANULARES (RBAC)
  // ==================================================================
  window.tienePermiso = function (modulo, accion) {
    if (!window.usuarioLogueado) return false;
    if (window.usuarioLogueado.rol === 'admin') return true;

    if (!window.permisosUsuario || !window.permisosUsuario[modulo]) {
      return false;
    }
    return Boolean(window.permisosUsuario[modulo][accion]);
  };

  async function cargarPermisosUsuario() {
    try {
      const modulos = ['inventario', 'recepcion', 'auditorias', 'confiabilidad', 'usuarios', 'bi'];

      if (window.usuarioLogueado.rol === 'admin') {
        modulos.forEach(m => {
          window.permisosUsuario[m] = { ver: true, crear: true, editar: true, eliminar: true };
          actualizarVisibilidadMenu(m, true);
        });
        return;
      }

      if (!window.supabaseClient) return;

      const { data, error } = await window.supabaseClient
        .from('permisos')
        .select('*')
        .eq('usuario', window.usuarioLogueado.usuario);

      if (error) {
        console.error('Error cargando permisos:', error.message);
        return;
      }

      window.permisosUsuario = {};
      (data || []).forEach(item => {
        window.permisosUsuario[item.modulo] = {
          ver: Boolean(item.ver),
          crear: Boolean(item.crear),
          editar: Boolean(item.editar),
          eliminar: Boolean(item.eliminar)
        };
      });

      modulos.forEach(m => {
        const puedeVer = window.tienePermiso(m, 'ver');
        actualizarVisibilidadMenu(m, puedeVer);
      });
    } catch (err) {
      console.error('Error en cargarPermisosUsuario:', err);
    }
  }

  function actualizarVisibilidadMenu(modulo, visible) {
    const btn = document.getElementById(`${modulo}Menu`);
    if (btn) {
      btn.style.display = visible ? '' : 'none';
    }
  }

  // ==================================================================
  // 3. CONSULTA DE KPIS EN VIVO DEL DASHBOARD HERO
  // ==================================================================
  async function cargarKPIsDashboard() {
    if (!window.supabaseClient) return;

    try {
      // 1. Total Recepciones
      const resRec = await window.supabaseClient
        .from('recepciones')
        .select('id, estado, novedad_original, faltantes', { count: 'exact' });

      const heroRecepciones = document.getElementById('heroRecepciones');
      if (heroRecepciones) {
        heroRecepciones.innerText = resRec.count || (resRec.data ? resRec.data.length : 0);
      }

      // 2. Total Auditorías
      const resAud = await window.supabaseClient
        .from('auditorias')
        .select('id', { count: 'exact', head: true });

      const heroAuditorias = document.getElementById('heroAuditorias');
      if (heroAuditorias) {
        heroAuditorias.innerText = resAud.count || 0;
      }

      // 3. Total Inventario
      const resInv = await window.supabaseClient
        .from('inventario')
        .select('id', { count: 'exact', head: true });

      const heroInventario = document.getElementById('heroInventario');
      if (heroInventario) {
        heroInventario.innerText = resInv.count || 0;
      }

      // 4. Alertas / Discrepancias Activas
      let alertasCount = 0;
      if (resRec.data) {
        alertasCount = resRec.data.filter(item => {
          const est = String(item.estado || '').toLowerCase().trim();
          const nov = String(item.novedad_original || '').toLowerCase().trim();
          const falt = Number(item.faltantes) || 0;
          return est !== 'solucionado' && est !== 'conforme' && (falt > 0 || est.includes('dañ') || est.includes('falt') || nov.includes('dañ') || nov.includes('falt'));
        }).length;
      }

      const heroNovedades = document.getElementById('heroNovedades');
      if (heroNovedades) {
        heroNovedades.innerText = alertasCount;
      }
    } catch (err) {
      console.warn('Error cargando KPIs de dashboard:', err);
    }
  }

  // ==================================================================
  // 4. HISTORIAL GLOBAL DE ACCIONES
  // ==================================================================
  window.guardarHistorial = async function (accion, modulo, descripcion) {
    if (!window.supabaseClient) return;
    try {
      await window.supabaseClient.from('historial').insert([{
        usuario: window.usuarioLogueado?.usuario || 'Sistema',
        accion: String(accion || '').toUpperCase(),
        modulo: String(modulo || '').toLowerCase(),
        descripcion: String(descripcion || '')
      }]);
    } catch (err) {
      console.warn('Error guardando en historial:', err);
    }
  };

  // ==================================================================
  // 5. ENRUTADOR SPA DE MÓDULOS
  // ==================================================================
  window.mostrarModulo = function (modulo) {
    const contenido = document.getElementById('mainContent');
    if (!contenido) return;

    // Actualizar clase activa en navbar
    document.querySelectorAll('.navbar-menu .nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`${modulo}Menu`);
    if (activeBtn) activeBtn.classList.add('active');

    if (modulo === 'dashboard') {
      contenido.innerHTML = dashboardOriginal;
      configurarPerfilUsuario();
      cargarKPIsDashboard();
      window.iniciarSlider();
      if (typeof window.renderNotificaciones === 'function') window.renderNotificaciones();
      return;
    }

    // Validar permiso de visualización
    if (modulo !== 'dashboard' && !window.tienePermiso(modulo, 'ver')) {
      if (typeof window.notifAlert === 'function') {
        window.notifAlert('Acceso denegado: No tiene permisos asignados para este módulo.');
      }
      return;
    }

    cargarModuloHTML(
      contenido,
      `modules/${modulo}.html`,
      `${modulo}Script`,
      `js/${modulo}.js?v=${Date.now()}`
    );
  };

  async function cargarModuloHTML(contenedor, htmlPath, scriptId, scriptSrc) {
    try {
      const res = await fetch(htmlPath);
      if (!res.ok) throw new Error(`HTTP ${res.status} cargando ${htmlPath}`);
      const html = await res.text();
      contenedor.innerHTML = html;

      // Inyectar / reinicializar script del módulo
      await cargarScriptDinamico(scriptId, scriptSrc);

    } catch (err) {
      console.error('Error cargando módulo:', err);
      contenedor.innerHTML = `
        <div style="text-align:center; padding:50px; color:#ef4444;">
          <h3>⚠️ Error al cargar el módulo</h3>
          <p>${err.message}</p>
        </div>`;
    }
  }

  function cargarScriptDinamico(id, src) {
    return new Promise(resolve => {
      const anterior = document.getElementById(id);
      if (anterior) anterior.remove();

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        console.error('Fallo cargando script:', src);
        resolve();
      };
      document.body.appendChild(script);
    });
  }

  // ==================================================================
  // 6. CONTROL DEL PANEL DE NOTIFICACIONES (CAMPANA)
  // ==================================================================
  const campanaBtn = document.getElementById('campanaBtn');
  const panelNotificaciones = document.getElementById('panelNotificaciones');

  if (campanaBtn && panelNotificaciones) {
    campanaBtn.onclick = async function (e) {
      e.stopPropagation();
      const estabaAbierto = panelNotificaciones.classList.contains('active');
      panelNotificaciones.classList.toggle('active');

      if (!estabaAbierto) {
        if (typeof window.cargarNotificacionesBD === 'function') {
          await window.cargarNotificacionesBD();
        } else if (typeof window.renderNotificaciones === 'function') {
          window.renderNotificaciones();
        }
      }
    };

    document.addEventListener('click', function (e) {
      if (!panelNotificaciones.contains(e.target) && e.target !== campanaBtn) {
        panelNotificaciones.classList.remove('active');
      }
    });
  }

  // ==================================================================
  // 7. SINCRONIZACIÓN REALTIME GLOBAL (SUPABASE WEBSOCKETS)
  // ==================================================================
  function inicializarRealtimeGlobal() {
    if (window._realtimeGlobalIniciado || !window.supabaseClient) return;
    window._realtimeGlobalIniciado = true;

    try {
      window.supabaseClient
        .channel('erp-dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recepciones' }, async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderRecepciones === 'function') await window.renderRecepciones();
          if (typeof window.actualizarKPIsRecepcion === 'function') await window.actualizarKPIsRecepcion();
          if (typeof window.actualizarDashboardRecepcion === 'function') await window.actualizarDashboardRecepcion();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auditorias' }, async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderAuditorias === 'function') await window.renderAuditorias();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario' }, async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderInventario === 'function') await window.renderInventario();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'confiabilidad' }, async () => {
          if (typeof window.renderConfiabilidad === 'function') await window.renderConfiabilidad();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, async () => {
          if (typeof window.renderUsuarios === 'function') await window.renderUsuarios();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'seguimiento_recepcion' }, async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderRecepciones === 'function') await window.renderRecepciones();
        })
        .subscribe();
    } catch (e) {
      console.warn('Error suscribiendo Realtime global:', e);
    }
  }

  // ==================================================================
  // 8. SLIDESHOW HERO DASHBOARD
  // ==================================================================
  window.slideActual = 0;
  window.sliderInterval = null;

  window.iniciarSlider = function () {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;

    if (window.sliderInterval) clearInterval(window.sliderInterval);
    window.slideActual = 0;
    slides.forEach((s, idx) => s.classList.toggle('active', idx === 0));

    window.sliderInterval = setInterval(() => {
      window.slideSiguiente();
    }, 6000);
  };

  window.slideSiguiente = function () {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;
    slides[window.slideActual].classList.remove('active');
    window.slideActual = (window.slideActual + 1) % slides.length;
    slides[window.slideActual].classList.add('active');
  };

  window.slideAnterior = function () {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;
    slides[window.slideActual].classList.remove('active');
    window.slideActual = (window.slideActual - 1 + slides.length) % slides.length;
    slides[window.slideActual].classList.add('active');
  };

  // ==================================================================
  // 9. CERRAR SESIÓN
  // ==================================================================
  function cerrarSesionSegura() {
    if (confirm('¿Desea cerrar la sesión de forma segura?')) {
      localStorage.removeItem('usuarioLogueado');
      window.location.href = 'index.html';
    }
  }

  const cerrarSesionBtn = document.getElementById('cerrarSesionBtn');
  if (cerrarSesionBtn) {
    cerrarSesionBtn.onclick = cerrarSesionSegura;
  }

  // ==================================================================
  // 10. LISTENERS DE MENÚ & INICIALIZACIÓN
  // ==================================================================
  const menuIds = ['dashboard', 'inventario', 'auditorias', 'recepcion', 'confiabilidad', 'usuarios', 'bi'];
  menuIds.forEach(mod => {
    const btn = document.getElementById(`${mod}Menu`);
    if (btn) {
      btn.onclick = () => window.mostrarModulo(mod);
    }
  });

  // Inicializar al cargar
  configurarPerfilUsuario();
  cargarPermisosUsuario();
  cargarKPIsDashboard();
  inicializarRealtimeGlobal();
  window.iniciarSlider();
})();