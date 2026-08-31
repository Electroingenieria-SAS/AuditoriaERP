// =======================================================
// CONTROLADOR MAESTRO DE USUARIOS & MATRIZ RBAC (AUTO-INIT)
// =======================================================

const MODULOS_SISTEMA = ['inventario', 'recepcion', 'auditorias', 'usuarios', 'confiabilidad'];

// Sanitización de entradas
function sanitizeInput(val) {
  return String(val || '').replace(/[<>'"`;()]/g, '').trim();
}

// Control rápido de switches
window.toggleAllPermisos = function(estado) {
  const switches = document.querySelectorAll('.iam-matrix-grid input[type="checkbox"]');
  switches.forEach(sw => sw.checked = Boolean(estado));
};

// =======================================================
// RENDERIZAR TABLA DE USUARIOS
// =======================================================
window.renderUsuarios = async function() {
  const tbody = document.getElementById('usuariosBody');
  const countBadge = document.getElementById('totalUsuariosBadge');
  
  // Si no está en el DOM actual, abortar
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align: center; color: #64748b; padding: 25px;">
        <span style="display:inline-block; animation: iamPulse 1s infinite;">⚡</span> Sincronizando directorio con Supabase...
      </td>
    </tr>`;

  try {
    if (!window.supabaseClient) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding:20px;">Sin conexión con la base de datos</td></tr>`;
      return;
    }

    const { data, error } = await window.supabaseClient
      .from('usuarios')
      .select('id, usuario, rol, estado')
      .order('id', { ascending: false });

    if (error) {
      console.error(error);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; padding:20px;">Error al cargar registros</td></tr>`;
      return;
    }

    if (countBadge) countBadge.innerText = data ? data.length : 0;

    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b; padding:25px;">No hay identidades registradas</td></tr>`;
      return;
    }

    const puedeEditar = typeof window.tienePermiso === 'function' ? window.tienePermiso('usuarios', 'editar') : true;
    const puedeEliminar = typeof window.tienePermiso === 'function' ? window.tienePermiso('usuarios', 'eliminar') : true;

    tbody.innerHTML = data.map(item => {
      const isActivo = item.estado === 'Activo';
      const initial = (item.usuario || 'U').charAt(0).toUpperCase();
      const rolClass = (item.rol || 'auditor').toLowerCase();

      return `
        <tr>
          <td>
            <div class="iam-user-cell">
              <div class="iam-avatar">${initial}</div>
              <div>
                <span class="iam-user-name">${item.usuario || '-'}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="iam-badge-role ${rolClass}">${item.rol || 'Sin Rol'}</span>
          </td>
          <td>
            <span class="iam-status-pill ${isActivo ? 'activo' : 'inactivo'}">
              <span class="iam-status-dot"></span>
              ${item.estado || 'Activo'}
            </span>
          </td>
          <td>
            <div class="iam-actions-wrap">
              ${puedeEditar ? `
                <button type="button" class="iam-btn-action edit" onclick="editarUsuario(${item.id})">
                  ✏️ Editar
                </button>
              ` : ''}
              ${puedeEliminar ? `
                <button type="button" class="iam-btn-action delete" onclick="eliminarUsuario(${item.id})">
                  🗑️ Eliminar
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Error renderUsuarios:', err);
  }
};

// =======================================================
// GUARDAR USUARIO
// =======================================================
window.guardarUsuario = async function() {
  try {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('usuarios', 'crear')) {
      notifAlert('Acceso denegado: No tiene permisos para crear usuarios');
      return;
    }

    const usuarioEl = document.getElementById('usuarioInput');
    const passwordEl = document.getElementById('passwordInput');
    const rolEl = document.getElementById('rolUsuario');

    if (!usuarioEl || !passwordEl || !rolEl) return;

    const usuario = sanitizeInput(usuarioEl.value.toLowerCase());
    const password = passwordEl.value.trim();
    const rol = rolEl.value;

    if (!usuario || !password || !rol) {
      notifAlert('Complete todos los campos obligatorios');
      return;
    }

    if (!window.supabaseClient) {
      notifAlert('Error de conexión con la base de datos');
      return;
    }

    // 1. Validar existencia
    const { data: existente, error: errCheck } = await window.supabaseClient
      .from('usuarios')
      .select('id')
      .eq('usuario', usuario)
      .limit(1);

    if (errCheck) {
      console.error(errCheck);
      notifAlert('Error al verificar disponibilidad');
      return;
    }

    if (existente && existente.length > 0) {
      notifAlert('El usuario ya se encuentra registrado');
      return;
    }

    // 2. Insertar usuario
    const { error: errInsert } = await window.supabaseClient
      .from('usuarios')
      .insert([{
        usuario: usuario,
        password: password,
        rol: rol,
        estado: 'Activo'
      }]);

    if (errInsert) {
      console.error(errInsert);
      notifAlert('Error al registrar usuario');
      return;
    }

    // 3. Matriz de permisos
    const permisosPayload = MODULOS_SISTEMA.map(mod => ({
      usuario: usuario,
      modulo: mod,
      ver: Boolean(document.getElementById(`${mod}Ver`)?.checked),
      crear: Boolean(document.getElementById(`${mod}Crear`)?.checked),
      editar: Boolean(document.getElementById(`${mod}Editar`)?.checked),
      eliminar: Boolean(document.getElementById(`${mod}Eliminar`)?.checked)
    }));

    const { error: errPermisos } = await window.supabaseClient
      .from('permisos')
      .insert(permisosPayload);

    if (errPermisos) {
      console.error(errPermisos);
      notifAlert('Usuario guardado, pero ocurrió un error con los permisos');
    }

    if (typeof guardarHistorial === 'function') {
      await guardarHistorial('CREAR', 'USUARIOS', `Se registró al usuario ${usuario} (${rol})`);
    }

    window.limpiarFormularioUsuarios();
    await window.renderUsuarios();
    notifAlert('Usuario y permisos registrados exitosamente');

  } catch (err) {
    console.error('Error en guardarUsuario:', err);
    notifAlert('Error procesando la solicitud');
  }
};

// =======================================================
// EDITAR USUARIO
// =======================================================
window.editarUsuario = async function(id) {
  try {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('usuarios', 'editar')) {
      notifAlert('Acceso denegado: No tiene permisos de edición');
      return;
    }

    const { data: usuario, error } = await window.supabaseClient
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !usuario) {
      notifAlert('Usuario no encontrado');
      return;
    }

    const nuevaPassword = await Notif.prompt(
      'Ingrese la nueva contraseña:',
      'Modificar Clave de Acceso',
      usuario.password || ''
    );
    if (nuevaPassword === null) return;

    const nuevoRol = await Notif.prompt(
      'Seleccione el nuevo rol:',
      'Asignación de Rol',
      usuario.rol,
      ['admin', 'lider', 'jefe', 'auditor', 'compras']
    );
    if (!nuevoRol) return;

    const nuevoEstado = await Notif.prompt(
      'Seleccione el estado de la cuenta:',
      'Estado Operativo',
      usuario.estado || 'Activo',
      ['Activo', 'Inactivo']
    );
    if (!nuevoEstado) return;

    const { error: errUpdate } = await window.supabaseClient
      .from('usuarios')
      .update({
        password: nuevaPassword.trim(),
        rol: nuevoRol,
        estado: nuevoEstado
      })
      .eq('id', id);

    if (errUpdate) {
      console.error(errUpdate);
      notifAlert('Error al actualizar datos');
      return;
    }

    if (typeof guardarHistorial === 'function') {
      await guardarHistorial('EDITAR', 'USUARIOS', `Se actualizó al usuario ${usuario.usuario}`);
    }

    await window.renderUsuarios();
    notifAlert('Identidad actualizada correctamente');

  } catch (err) {
    console.error('Error en editarUsuario:', err);
  }
};

// =======================================================
// ELIMINAR USUARIO
// =======================================================
window.eliminarUsuario = async function(id) {
  try {
    if (typeof window.tienePermiso === 'function' && !window.tienePermiso('usuarios', 'eliminar')) {
      notifAlert('Acceso denegado: No cuenta con permisos para eliminar usuarios');
      return;
    }

    const confirmar = await Notif.confirm(
      'Se revocarán todos los accesos permanentemente.',
      '¿Eliminar este usuario?'
    );
    if (!confirmar) return;

    const { data: usuario } = await window.supabaseClient
      .from('usuarios')
      .select('usuario')
      .eq('id', id)
      .single();

    const { error: errDel } = await window.supabaseClient
      .from('usuarios')
      .delete()
      .eq('id', id);

    if (errDel) {
      console.error(errDel);
      notifAlert('Error al eliminar usuario');
      return;
    }

    if (usuario && usuario.usuario) {
      await window.supabaseClient
        .from('permisos')
        .delete()
        .eq('usuario', usuario.usuario);

      if (typeof guardarHistorial === 'function') {
        await guardarHistorial('ELIMINAR', 'USUARIOS', `Se eliminó al usuario ${usuario.usuario}`);
      }
    }

    await window.renderUsuarios();
    notifAlert('Usuario revocado del sistema');

  } catch (err) {
    console.error('Error en eliminarUsuario:', err);
  }
};

// =======================================================
// LIMPIEZA DE FORMULARIO
// =======================================================
window.limpiarFormularioUsuarios = function() {
  const u = document.getElementById('usuarioInput');
  const p = document.getElementById('passwordInput');
  const r = document.getElementById('rolUsuario');

  if (u) u.value = '';
  if (p) p.value = '';
  if (r) r.value = 'auditor';

  window.toggleAllPermisos(false);
};

// =======================================================
// DELEGACIÓN GLOBAL DE EVENTOS (NUNCA SE PIERDEN)
// =======================================================
document.addEventListener('click', function(e) {
  if (e.target && (e.target.id === 'guardarUsuario' || e.target.closest('#guardarUsuario'))) {
    e.preventDefault();
    window.guardarUsuario();
  }
});

document.addEventListener('input', function(e) {
  if (e.target && e.target.id === 'buscarUsuario') {
    const q = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#usuariosBody tr');
    rows.forEach(r => {
      r.style.display = r.innerText.toLowerCase().includes(q) ? '' : 'none';
    });
  }
});

// =======================================================
// AUTO-INICIALIZADOR (DISPARA LA CARGA AL ENTRAR AL MÓDULO)
// =======================================================
window.initModuloUsuarios = function() {
  if (document.getElementById('usuariosBody')) {
    window.renderUsuarios();
  }
};

// 1. Ejecutar de inmediato si ya está montado
window.initModuloUsuarios();

// 2. Observador automático de cambios en el contenedor principal
if (!window._iamObserverIniciado) {
  window._iamObserverIniciado = true;
  const observer = new MutationObserver(() => {
    const tableBody = document.getElementById('usuariosBody');
    // Si la tabla apareció vacía o no ha sido inicializada
    if (tableBody && (!tableBody.dataset.loaded || tableBody.children.length === 0)) {
      tableBody.dataset.loaded = "true";
      window.renderUsuarios();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
