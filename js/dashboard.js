// =====================================
// DASHBOARD JS
// =====================================

// ======================
// VALIDAR CLIENTE SUPABASE
// ======================
if (!window.supabaseClient) {
  if (typeof notifAlert === 'function') {
    notifAlert('Supabase no cargó correctamente');
  }
  throw new Error('Supabase no cargó correctamente');
}

// ======================
// EVITAR DUPLICAR INICIALIZACIÓN
// ======================
if (typeof window.dashboardCargado === 'undefined') {
  window.dashboardCargado = true;

  // ======================
  // USUARIO Y SESIÓN
  // ======================
  window.usuarioLogueado = JSON.parse(
    localStorage.getItem('usuarioLogueado')
  );

  if (!window.usuarioLogueado) {
    window.location.href = 'index.html';
  }

  // ======================
  // VARIABLES
  // ======================
  const mainContent = document.getElementById('mainContent');
  const dashboardOriginal = mainContent ? mainContent.innerHTML : '';
  window.permisosUsuario = window.permisosUsuario || {};

  // ======================
  // MOSTRAR USUARIO
  // ======================
  const usuarioNombre = document.getElementById('usuarioNombre');
  if (usuarioNombre && window.usuarioLogueado) {
    usuarioNombre.innerText =
      window.usuarioLogueado.usuario + ' | ' + window.usuarioLogueado.rol;
  }

  const heroUsuario = document.getElementById('heroUsuario');
  if (heroUsuario && window.usuarioLogueado) {
    heroUsuario.innerText = window.usuarioLogueado.usuario;
  }

  // ======================
  // VALIDAR PERMISOS
  // ======================
  window.tienePermiso = function (modulo, accion) {
    if (window.usuarioLogueado && window.usuarioLogueado.rol === 'admin') {
      return true;
    }

    if (!window.permisosUsuario || !window.permisosUsuario[modulo]) {
      return false;
    }

    return Boolean(window.permisosUsuario[modulo][accion]);
  };

  // ======================
  // MOSTRAR / OCULTAR ELEMENTOS
  // ======================
  function mostrarElemento(id) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.style.display = '';
  }

  function ocultarElemento(id) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.style.display = 'none';
  }

  function mostrarCard(id) {
    const card = document.getElementById(id);
    if (card) card.style.display = '';
  }

  function ocultarCard(id) {
    const card = document.getElementById(id);
    if (card) card.style.display = 'none';
  }

  // ======================
  // VALIDAR MÓDULOS
  // ======================
  function validarModulo(modulo) {
    const menu = modulo + 'Menu';
    const card = 'card' + modulo.charAt(0).toUpperCase() + modulo.slice(1);

    if (window.tienePermiso(modulo, 'ver')) {
      mostrarElemento(menu);
      mostrarCard(card);
    } else {
      ocultarElemento(menu);
      ocultarCard(card);
    }
  }

  // ======================
  // APLICAR PERMISOS
  // ======================
  async function aplicarPermisos() {
    try {
      const modulos = [
        'inventario',
        'recepcion',
        'auditorias',
        'confiabilidad',
        'usuarios',
        'historial'
      ];

      if (window.usuarioLogueado.rol === 'admin') {
        modulos.forEach(validarModulo);
        return;
      }

      const response = await window.supabaseClient
        .from('permisos')
        .select('*')
        .eq('usuario', window.usuarioLogueado.usuario);

      if (response.error) {
        console.error(response.error);
        return;
      }

      const permisos = response.data || [];
      window.permisosUsuario = {};

      permisos.forEach(function (item) {
        window.permisosUsuario[item.modulo] = {
          ver: item.ver,
          crear: item.crear,
          editar: item.editar,
          eliminar: item.eliminar
        };
      });

      modulos.forEach(validarModulo);
    } catch (error) {
      console.error(error);
    }
  }

  // ======================
  // GUARDAR HISTORIAL
  // ======================
  window.guardarHistorial = async function (accion, modulo, descripcion) {
    try {
      await window.supabaseClient
        .from('historial')
        .insert([
          {
            usuario: window.usuarioLogueado?.usuario || 'Sistema',
            accion: accion,
            modulo: modulo,
            descripcion: descripcion
          }
        ]);
    } catch (error) {
      console.error(error);
    }
  };

  // ======================
  // RENDER NOTIFICACIONES
  // ======================
  window.renderNotificaciones = function () {
    const lista = document.getElementById('listaNotificaciones');
    const contador = document.getElementById('contadorNotificaciones');

    if (!lista) return;

    const notificaciones = JSON.parse(
      localStorage.getItem('notificaciones')
    ) || [];

    lista.innerHTML = '';

    const noLeidas = notificaciones.filter(function (item) {
      return item.leida !== true;
    });

    if (contador) {
      contador.innerText = noLeidas.length;
    }

    if (notificaciones.length === 0) {
      lista.innerHTML = '<p class="sin-notificaciones">No hay notificaciones</p>';
      return;
    }

    notificaciones.forEach(function (item) {
      lista.innerHTML +=
        '<div class="notificacion-item" onclick="mostrarModulo(\'recepcion\')">' +
          '<p>' + item.mensaje + '</p>' +
          '<span>' + item.fecha + '</span>' +
        '</div>';
    });
  };

  window.limpiarNotificaciones = function () {
    localStorage.removeItem('notificaciones');
    window.renderNotificaciones();
  };

  // ======================
  // PANEL NOTIFICACIONES
  // ======================
  const campanaBtn = document.getElementById('campanaBtn');
  const panelNotificaciones = document.getElementById('panelNotificaciones');

  if (campanaBtn) {
    campanaBtn.onclick = function (e) {
      e.stopPropagation();

      if (panelNotificaciones) {
        panelNotificaciones.classList.toggle('active');
      }

      let notificaciones = JSON.parse(
        localStorage.getItem('notificaciones')
      ) || [];

      notificaciones = notificaciones.map(function (item) {
        item.leida = true;
        return item;
      });

      localStorage.setItem('notificaciones', JSON.stringify(notificaciones));
      window.renderNotificaciones();
    };
  }

  document.addEventListener('click', function (e) {
    if (
      panelNotificaciones &&
      !panelNotificaciones.contains(e.target) &&
      e.target !== campanaBtn
    ) {
      panelNotificaciones.classList.remove('active');
    }
  });

  window.addEventListener('nuevaNotificacion', function () {
    window.renderNotificaciones();
  });

  // ======================
  // ENRUTAMIENTO DE MÓDULOS
  // ======================
  window.mostrarModulo = function (modulo) {
    const contenido = document.getElementById('mainContent');
    if (!contenido) return;

    if (modulo === 'dashboard') {
      contenido.innerHTML = dashboardOriginal;
      setTimeout(async function () {
        aplicarPermisos();
        window.renderNotificaciones();
        await cargarKPIsDashboard();
        window.iniciarSlider();
      }, 100);
      return;
    }

    cargarModulo(
      contenido,
      'modules/' + modulo + '.html',
      modulo + 'Script',
      'js/' + modulo + '.js?v=' + Date.now()
    );
  };

  function cargarModulo(contenido, htmlPath, scriptId, scriptSrc) {
    fetch(htmlPath)
      .then(function (res) {
        return res.text();
      })
      .then(async function (html) {
        contenido.innerHTML = html;
        await cargarScript(scriptId, scriptSrc);

        if (typeof window.inicializarInventario === 'function') {
          window.inicializarInventario();
        }
      })
      .catch(function (error) {
        console.error('Error cargando módulo:', error);
      });
  }

  function cargarScript(id, src) {
    return new Promise((resolve, reject) => {
      const anterior = document.getElementById(id);
      if (anterior) {
        anterior.remove();
      }

      const script = document.createElement('script');
      script.src = src;
      script.id = id;

      script.onload = () => {
        resolve();
      };

      script.onerror = () => {
        console.error('Error cargando script:', src);
        reject();
      };

      document.body.appendChild(script);
    });
  }

  // ======================
  // AUTO REFRESH
  // ======================
  window.iniciarAutoRefresh = function () {
    if (window.autoRefreshSistema) {
      clearInterval(window.autoRefreshSistema);
    }

    window.autoRefreshSistema = setInterval(async function () {
      try {
        if (typeof window.renderNotificaciones === 'function') {
          window.renderNotificaciones();
        }
        if (typeof window.renderRecepciones === 'function') {
          await window.renderRecepciones();
        }
        if (typeof window.actualizarKPIsRecepcion === 'function') {
          await window.actualizarKPIsRecepcion();
        }
        if (typeof window.renderAuditorias === 'function') {
          await window.renderAuditorias();
        }
        if (typeof window.renderHistorialSistema === 'function') {
          await window.renderHistorialSistema();
        }
        if (typeof window.renderInventario === 'function') {
          window.renderInventario();
        }
        if (typeof window.actualizarKPIs === 'function') {
          window.actualizarKPIs();
        }
      } catch (error) {
        console.error('Error auto refresh:', error);
      }
    }, 5000);
  };

  // ======================
  // CERRAR SESIÓN
  // ======================
  function cerrarSesion() {
    localStorage.removeItem('usuarioLogueado');
    window.location.href = 'index.html';
  }

  const cerrarSesionBtn = document.getElementById('cerrarSesionBtn');
  if (cerrarSesionBtn) {
    cerrarSesionBtn.onclick = cerrarSesion;
  }

  // ======================
  // MENÚS Y QUICK CARDS
  // ======================
  function activarMenu(id, modulo) {
    const elemento = document.getElementById(id);
    if (elemento) {
      elemento.onclick = function () {
        mostrarModulo(modulo);
      };
    }
  }

  activarMenu('dashboardMenu', 'dashboard');
  activarMenu('inventarioMenu', 'inventario');
  activarMenu('recepcionMenu', 'recepcion');
  activarMenu('auditoriasMenu', 'auditorias');
  activarMenu('confiabilidadMenu', 'confiabilidad');
  activarMenu('usuariosMenu', 'usuarios');

  document.addEventListener('click', function (e) {
    const card = e.target.closest('.quick-card');
    if (!card) return;

    if (card.id === 'cardInventario') mostrarModulo('inventario');
    else if (card.id === 'cardRecepcion') mostrarModulo('recepcion');
    else if (card.id === 'cardAuditorias') mostrarModulo('auditorias');
    else if (card.id === 'cardUsuarios') mostrarModulo('usuarios');
    else if (card.id === 'cardHistorial') mostrarModulo('historial');
  });

  // ======================
  // KPIS DASHBOARD HERO
  // ======================
  async function cargarKPIsDashboard() {
    try {
      const recepcionesResult = await window.supabaseClient
        .from('recepciones')
        .select('*', { count: 'exact', head: true });

      const heroRecepciones = document.getElementById('heroRecepciones');
      if (heroRecepciones) {
        heroRecepciones.innerText = recepcionesResult.count || 0;
      }

      const auditoriasResult = await window.supabaseClient
        .from('auditorias')
        .select('*', { count: 'exact', head: true });

      const heroAuditorias = document.getElementById('heroAuditorias');
      if (heroAuditorias) {
        heroAuditorias.innerText = auditoriasResult.count || 0;
      }

      const alertasResult = await window.supabaseClient
        .from('recepciones')
        .select('estado');

      let alertas = 0;
      if (alertasResult.data) {
        alertas = alertasResult.data.filter(function (item) {
          const estado = (item.estado || '').toLowerCase().trim();
          return estado !== 'solucionado' && estado !== 'cerrado';
        }).length;
      }

      const heroNovedades = document.getElementById('heroNovedades');
      if (heroNovedades) {
        heroNovedades.innerText = alertas;
      }
    } catch (error) {
      console.error('Error KPI Dashboard:', error);
    }
  }

  // ======================
  // REALTIME ERP
  // ======================
  function iniciarRealtimeERP() {
    if (window.realtimeERPActivo) return;
    window.realtimeERPActivo = true;

    window.supabaseClient
      .channel('erp-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recepciones' },
        async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderRecepciones === 'function') {
            await window.renderRecepciones();
          }
          if (typeof window.actualizarKPIsRecepcion === 'function') {
            await window.actualizarKPIsRecepcion();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auditorias' },
        async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderAuditorias === 'function') {
            await window.renderAuditorias();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'usuarios' },
        async () => {
          if (typeof window.renderUsuarios === 'function') {
            await window.renderUsuarios();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seguimiento_recepcion' },
        async () => {
          await cargarKPIsDashboard();
          if (typeof window.renderRecepciones === 'function') {
            await window.renderRecepciones();
          }
        }
      )
      .subscribe();
  }

  // ======================
  // SLIDER HERO
  // ======================
  window.slideActual = 0;
  window.sliderInterval = null;

  window.iniciarSlider = function () {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;

    if (window.sliderInterval) {
      clearInterval(window.sliderInterval);
    }

    window.slideActual = 0;
    slides.forEach(function (slide) {
      slide.classList.remove('active');
    });
    slides[0].classList.add('active');

    window.sliderInterval = setInterval(function () {
      window.slideSiguiente();
    }, 5000);
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

  // ======================
  // INICIO
  // ======================
  aplicarPermisos();
  window.renderNotificaciones();
  cargarKPIsDashboard();
  iniciarRealtimeERP();

  setTimeout(function () {
    window.iniciarSlider();
  }, 500);
}