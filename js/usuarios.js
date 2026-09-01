/**
 * ====================================================================
 * USUARIOS.JS — Gestión de Cuentas & Matriz de Permisos RBAC
 * ====================================================================
 * Versión: 2.7.0
 */

(function () {
  'use strict';

  let usuariosCache = [];
  let usuarioEnEdicion = null;
  const MODULOS_ERP = ['inventario', 'recepcion', 'auditorias', 'usuarios', 'confiabilidad'];
  const ACCIONES = ['Ver', 'Crear', 'Editar', 'Eliminar'];

  function $(id) {
    return document.getElementById(id);
  }

  function getVal(id) {
    const el = $(id);
    return el ? el.value : '';
  }

  function setVal(id, val) {
    const el = $(id);
    if (el) el.value = val ?? '';
  }

  function sanitize(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function notificar(mensaje, tipo = 'warning', titulo = 'Usuarios') {
    if (typeof window.mostrarNotificacion === 'function') {
      window.mostrarNotificacion(titulo, mensaje, tipo);
    } else if (typeof window.notifAlert === 'function') {
      window.notifAlert(mensaje);
    }
  }

  // ==================================================================
  // 1. CARGA DE USUARIOS
  // ==================================================================
  window.renderUsuarios = async function (datos = null) {
    const tbody = $('usuariosBody');
    if (!tbody) return;

    if (!window.supabaseClient) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:25px;color:#94a3b8;">Sin conexión a Supabase</td></tr>`;
      return;
    }

    try {
      let usuarios = datos;
      if (!usuarios) {
        const { data, error } = await window.supabaseClient
          .from('usuarios')
          .select('id, usuario, rol, estado, created_at')
          .order('id');

        if (error) {
          console.error('Error renderUsuarios:', error.message);
          return;
        }
        usuarios = data || [];
        usuariosCache = usuarios;
      }

      const badgeTotal = $('totalUsuariosBadge');
      if (badgeTotal) badgeTotal.innerText = usuarios.length;

      if (usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:25px;color:#94a3b8;">No existen usuarios registrados.</td></tr>`;
        return;
      }

      const soyAdmin = window.usuarioLogueado?.rol === 'admin';

      tbody.innerHTML = usuarios.map(u => {
        const estadoClass = u.estado === 'Activo' ? 'estado-revisado' : 'estado-cerrado';
        const esMismoUsuario = u.usuario === window.usuarioLogueado?.usuario;

        return `
          <tr>
            <td>
              <div class="user-identity-cell">
                <div class="user-avatar-small">${sanitize(u.usuario.charAt(0).toUpperCase())}</div>
                <div>
                  <strong>${sanitize(u.usuario)}</strong>
                  <span class="user-cell-meta">${u.created_at ? new Date(u.created_at).toLocaleDateString('es-CO') : '-'}</span>
                </div>
              </div>
            </td>
            <td><span class="user-role-badge ${u.rol === 'admin' ? 'role-admin' : 'role-user'}">${sanitize(u.rol.toUpperCase())}</span></td>
            <td><span class="${estadoClass}">${sanitize(u.estado)}</span></td>
            <td style="text-align:right;">
              <div class="acciones-tabla-mini" style="justify-content:flex-end;">
                ${soyAdmin ? `
                  <button type="button" class="btn-mini" onclick="window.editarUsuarioForm('${sanitize(u.usuario)}')" title="Editar Identidad y Permisos">✏️</button>
                  ${!esMismoUsuario ? `
                    <button type="button" class="btn-mini btn-eliminar-mini" onclick="window.eliminarUsuario(${u.id}, '${sanitize(u.usuario)}')" title="Eliminar Usuario">🗑️</button>
                  ` : ''}
                ` : '<span style="color:#94a3b8;font-size:11px;">Solo Lectura</span>'}
              </div>
            </td>
          </tr>`;
      }).join('');

    } catch (err) {
      console.error(err);
    }
  };

  // ==================================================================
  // 2. MATRIZ DE PERMISOS (SWITCHES)
  // ==================================================================
  window.toggleAllPermisos = function (marcar) {
    MODULOS_ERP.forEach(mod => {
      ACCIONES.forEach(acc => {
        const sw = $(`${mod}${acc}`);
        if (sw) sw.checked = Boolean(marcar);
      });
    });
  };

  function leerPermisosFormulario() {
    const matriz = {};
    MODULOS_ERP.forEach(mod => {
      matriz[mod] = {
        ver: Boolean($(`${mod}Ver`)?.checked),
        crear: Boolean($(`${mod}Crear`)?.checked),
        editar: Boolean($(`${mod}Editar`)?.checked),
        eliminar: Boolean($(`${mod}Eliminar`)?.checked)
      };
    });
    return matriz;
  }

  function setPermisosFormulario(permisosMap = {}) {
    MODULOS_ERP.forEach(mod => {
      const p = permisosMap[mod] || {};
      ACCIONES.forEach(acc => {
        const sw = $(`${mod}${acc}`);
        if (sw) sw.checked = Boolean(p[acc.toLowerCase()]);
      });
    });
  }

  // ==================================================================
  // 3. EDICIÓN & LIMPIEZA DEL FORMULARIO
  // ==================================================================
  window.editarUsuarioForm = async function (usuarioNombre) {
    const user = usuariosCache.find(u => u.usuario === usuarioNombre);
    if (!user) return;

    usuarioEnEdicion = user;
    setVal('usuarioInput', user.usuario);
    setVal('passwordInput', '');
    setVal('rolUsuario', user.rol);

    const userInp = $('usuarioInput');
    if (userInp) userInp.disabled = true;

    const passInp = $('passwordInput');
    if (passInp) passInp.placeholder = 'Dejar en blanco para no cambiar';

    // Cargar permisos desde Supabase
    const permisosMap = {};
    if (window.supabaseClient) {
      const { data } = await window.supabaseClient
        .from('permisos')
        .select('*')
        .eq('usuario', user.usuario);

      (data || []).forEach(p => {
        permisosMap[p.modulo] = {
          ver: Boolean(p.ver),
          crear: Boolean(p.crear),
          editar: Boolean(p.editar),
          eliminar: Boolean(p.eliminar)
        };
      });
    }

    setPermisosFormulario(permisosMap);

    // Scroll suave hacia el formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
    notificar(`Cargado usuario "${user.usuario}" para edición.`, 'info');
  };

  window.limpiarFormulario = function () {
    usuarioEnEdicion = null;
    setVal('usuarioInput', '');
    setVal('passwordInput', '');
    setVal('rolUsuario', 'auditor');

    const userInp = $('usuarioInput');
    if (userInp) userInp.disabled = false;

    const passInp = $('passwordInput');
    if (passInp) passInp.placeholder = '••••••••••••';

    window.toggleAllPermisos(false);
  };

  // ==================================================================
  // 4. GUARDAR USUARIO Y PERMISOS
  // ==================================================================
  async function guardarUsuario() {
    const btn = $('guardarUsuario');
    try {
      const usuario = getVal('usuarioInput').toLowerCase().trim();
      const password = getVal('passwordInput').trim();
      const rol = getVal('rolUsuario');

      if (!usuario) {
        notificar('El nombre de usuario o identificador es obligatorio.');
        return;
      }

      if (!usuarioEnEdicion && !password) {
        notificar('Debe asignar una contraseña para la nueva identidad.');
        return;
      }

      if (btn) btn.disabled = true;

      const permisos = leerPermisosFormulario();

      if (usuarioEnEdicion) {
        // Actualizar
        const payload = { rol };
        if (password) payload.password = password;

        const { error } = await window.supabaseClient
          .from('usuarios')
          .update(payload)
          .eq('id', usuarioEnEdicion.id);

        if (error) throw error;

        // Upsert permisos por módulo
        for (const mod of MODULOS_ERP) {
          const p = permisos[mod];
          await window.supabaseClient
            .from('permisos')
            .upsert({
              usuario,
              modulo: mod,
              ver: rol === 'admin' ? true : p.ver,
              crear: rol === 'admin' ? true : p.crear,
              editar: rol === 'admin' ? true : p.editar,
              eliminar: rol === 'admin' ? true : p.eliminar
            }, { onConflict: 'usuario, modulo' });
        }

        if (typeof window.guardarHistorial === 'function') {
          await window.guardarHistorial('EDITAR_USUARIO', 'USUARIOS', `Identidad modificada: ${usuario} (Rol: ${rol})`);
        }

        notificar(`Usuario "${usuario}" y permisos actualizados.`, 'success');

      } else {
        // Insertar nuevo usuario
        const { error: errUser } = await window.supabaseClient
          .from('usuarios')
          .insert([{
            usuario,
            password,
            rol,
            estado: 'Activo',
            created_at: new Date().toISOString()
          }]);

        if (errUser) throw errUser;

        // Insertar permisos
        const rowsPermisos = MODULOS_ERP.map(mod => ({
          usuario,
          modulo: mod,
          ver: rol === 'admin' ? true : permisos[mod].ver,
          crear: rol === 'admin' ? true : permisos[mod].crear,
          editar: rol === 'admin' ? true : permisos[mod].editar,
          eliminar: rol === 'admin' ? true : permisos[mod].eliminar
        }));

        await window.supabaseClient.from('permisos').insert(rowsPermisos);

        if (typeof window.guardarHistorial === 'function') {
          await window.guardarHistorial('CREAR_USUARIO', 'USUARIOS', `Nueva identidad creada: ${usuario} (Rol: ${rol})`);
        }

        if (typeof window.crearNotificacion === 'function') {
          window.crearNotificacion(`👤 Usuario registrado: ${usuario} (${rol})`, 'info');
        }

        notificar(`Usuario "${usuario}" creado exitosamente.`, 'success');
      }

      window.limpiarFormulario();
      await window.renderUsuarios();

    } catch (err) {
      console.error(err);
      notificar('Error al procesar usuario: ' + err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ==================================================================
  // 5. ELIMINAR USUARIO
  // ==================================================================
  window.eliminarUsuario = async function (id, usuario) {
    if (!confirm(`¿Eliminar definitivamente el usuario "${usuario}" y sus permisos?`)) return;

    try {
      if (window.supabaseClient) {
        await window.supabaseClient.from('permisos').delete().eq('usuario', usuario);
        await window.supabaseClient.from('usuarios').delete().eq('id', Number(id));
      }

      if (typeof window.guardarHistorial === 'function') {
        await window.guardarHistorial('ELIMINAR_USUARIO', 'USUARIOS', `Usuario eliminado: ${usuario}`);
      }

      await window.renderUsuarios();
      notificar(`Usuario "${usuario}" eliminado.`, 'success');

    } catch (err) {
      console.error(err);
      notificar('Error eliminando usuario: ' + err.message, 'error');
    }
  };

  // ==================================================================
  // 6. LISTENERS
  // ==================================================================
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'buscarUsuario') {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        window.renderUsuarios(usuariosCache);
        return;
      }
      const filtrados = usuariosCache.filter(u =>
        String(u.usuario || '').toLowerCase().includes(q) ||
        String(u.rol || '').toLowerCase().includes(q) ||
        String(u.estado || '').toLowerCase().includes(q)
      );
      window.renderUsuarios(filtrados);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && (e.target.id === 'guardarUsuario' || e.target.closest('#guardarUsuario'))) {
      e.preventDefault();
      guardarUsuario();
    }
  });

  // Inicialización
  window.renderUsuarios();
})();
