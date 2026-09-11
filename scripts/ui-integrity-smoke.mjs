import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const dashboard = read('dashboard.html');
const integrity = read('js/ui-integrity.js');
const auditorias = read('modules/auditorias.html');
const recepcion = read('modules/recepcion.html');
const inventario = read('modules/inventario.html');
const confiabilidad = read('modules/confiabilidad.html');
const usuarios = read('modules/usuarios.html');
const bi = read('modules/bi.html');

check(dashboard.includes('js/ui-integrity.js?v=271'), 'dashboard debe cargar ui-integrity.js');
check(dashboard.includes('https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;'), 'CSP connect-src debe permitir los CDN ya autorizados');
check(dashboard.includes('rel="icon"') && dashboard.includes('img/logo-electro.png.png'), 'dashboard debe declarar favicon existente');
check(!inventario.includes('autocomplete="off" autofocus'), 'Inventario no debe forzar autofocus al inyectarse en SPA');

for (const selector of ['.btn-cerrar-modal', '.btn-close-modal', '.conf-btn-close', '.btn-cancel']) {
  check(integrity.includes(selector), `ui-integrity debe cubrir ${selector}`);
}
check(integrity.includes("event.key !== 'Escape'"), 'ui-integrity debe soportar Escape');
check(integrity.includes("event.target?.matches?.(MODAL_SELECTOR)"), 'ui-integrity debe soportar cierre por backdrop');
check(integrity.includes("text === 'cancelar'"), 'ui-integrity debe cubrir botones Cancelar por texto');

check(auditorias.includes('id="cerrarDetalleAuditoria"'), 'Auditorías debe conservar cierre de detalle');
check(auditorias.includes('modalEditarAuditoria') && auditorias.includes('Cancelar'), 'Auditorías debe conservar Cancelar de edición');
check(recepcion.includes('cerrarModalGestion()') && recepcion.includes('cerrarModalObservacion()') && recepcion.includes('cerrarModalSoportesRecepcion()'), 'Recepción debe conservar sus tres cierres');
check(inventario.includes('cerrarModalNovedad()') && inventario.includes('btn-cancel') && inventario.includes('cerrarObservacion()'), 'Inventario debe conservar X y Cancelar');
check(confiabilidad.includes('id="cerrarModalConfiabilidad"') && confiabilidad.includes('id="cancelarAnalisis"'), 'Confiabilidad debe conservar X y Cancelar');
check(usuarios.includes('id="guardarUsuario"') && usuarios.includes('limpiarFormulario()'), 'Usuarios debe conservar acciones principales');
check(bi.includes('id="btnGenerar"') && bi.includes('id="btnAplicar"') && bi.includes('id="btnResetFiltros"') && bi.includes('id="crmMetricsRefresh"'), 'BI debe conservar acciones principales');

if (failures.length) {
  console.error('UI INTEGRITY SMOKE FALLÓ');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}

console.log('UI INTEGRITY SMOKE OK · controles críticos y recursos verificados');
