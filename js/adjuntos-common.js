(function () {
  'use strict';

  const MIN_ADJUNTOS = 1;
  const MAX_ADJUNTOS = 10;
  const MAX_ARCHIVO_BYTES = 100 * 1024 * 1024;
  const DRIVE_HOSTS = new Set([
    'drive.google.com',
    'docs.google.com'
  ]);

  function escaparHTML(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function obtenerExtension(nombre) {
    const partes = String(nombre || '').toLowerCase().split('.');
    return partes.length > 1 ? partes.pop() : '';
  }

  function validarArchivo(archivo) {
    if (!archivo) {
      return { valido: false, mensaje: 'No se recibió ningún archivo.' };
    }

    const mime = String(archivo.type || '').toLowerCase();
    const extension = obtenerExtension(archivo.name);
    const permitidoPorMime =
      mime === 'application/pdf' ||
      mime === 'application/msword' ||
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'text/csv' ||
      mime === 'text/plain' ||
      mime.startsWith('image/') ||
      mime.startsWith('video/');
    const permitidoPorExtension = [
      'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif',
      'mp4', 'webm', 'mov', 'm4v', 'avi', 'mpeg', 'mpg', '3gp', 'mkv',
      'xls', 'xlsx', 'csv', 'doc', 'docx', 'txt'
    ].includes(extension);

    if (!permitidoPorMime && !permitidoPorExtension) {
      return {
        valido: false,
        mensaje: `“${archivo.name}” no corresponde a un formato documental permitido.`
      };
    }

    if (archivo.size > MAX_ARCHIVO_BYTES) {
      return {
        valido: false,
        mensaje: `“${archivo.name}” supera el límite de 100 MB por archivo.`
      };
    }

    return { valido: true };
  }

  function normalizarDriveUrl(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return null;

    try {
      const url = new URL(texto);
      if (url.protocol !== 'https:' || !DRIVE_HOSTS.has(url.hostname.toLowerCase())) {
        return null;
      }
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  function nombreEnlaceDrive(url, indice) {
    try {
      const parsed = new URL(url);
      const partes = parsed.pathname.split('/').filter(Boolean);
      const id = partes.includes('d') ? partes[partes.indexOf('d') + 1] : partes.at(-1);
      return id ? `Enlace de Drive ${indice} · ${id.slice(0, 10)}` : `Enlace de Drive ${indice}`;
    } catch (_) {
      return `Enlace de Drive ${indice}`;
    }
  }

  function formatearTamano(bytes) {
    const valor = Number(bytes || 0);
    if (valor < 1024) return `${valor} B`;
    if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
    return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
  }

  function tipoVisual(soporte) {
    if (soporte?.tipo === 'drive') return { icono: '🔗', etiqueta: 'Google Drive' };
    const mime = String(soporte?.mime || soporte?.archivo?.type || '').toLowerCase();
    const extension = obtenerExtension(soporte?.nombre || soporte?.archivo?.name || '');
    if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg','heic','heif'].includes(extension)) {
      return { icono: '🖼️', etiqueta: 'Imagen' };
    }
    if (mime.startsWith('video/') || ['mp4','webm','mov','m4v','avi','mpeg','mpg','3gp','mkv'].includes(extension)) {
      return { icono: '🎥', etiqueta: 'Video' };
    }
    if (mime.includes('excel') || mime.includes('spreadsheet') || mime === 'text/csv' || ['xls','xlsx','csv'].includes(extension)) {
      return { icono: '📊', etiqueta: 'Hoja de cálculo' };
    }
    if (mime.includes('word') || mime.includes('wordprocessing') || mime === 'text/plain' || ['doc','docx','txt'].includes(extension)) {
      return { icono: '📝', etiqueta: 'Documento' };
    }
    return { icono: '📄', etiqueta: 'PDF' };
  }

  function serializarRecepcion(soportes) {
    return JSON.stringify((soportes || []).map(function (soporte) {
      return {
        tipo: soporte.tipo,
        nombre: soporte.nombre,
        url: soporte.url,
        ruta: soporte.ruta || '',
        mime: soporte.mime || '',
        tamano: Number(soporte.tamano || 0)
      };
    }));
  }

  function deserializarRecepcion(valor) {
    if (!valor) return [];

    const texto = String(valor).trim();
    if (!texto) return [];

    try {
      const data = JSON.parse(texto);
      if (Array.isArray(data)) {
        return data
          .filter(function (item) { return item && item.url; })
          .map(function (item, index) {
            return {
              tipo: item.tipo === 'drive' ? 'drive' : 'archivo',
              nombre: item.nombre || `Soporte ${index + 1}`,
              url: item.url,
              ruta: item.ruta || '',
              mime: item.mime || '',
              tamano: Number(item.tamano || 0)
            };
          });
      }
    } catch (_) {
      // Compatibilidad con registros antiguos que guardaban una URL única.
    }

    if (/^https?:\/\//i.test(texto)) {
      return [{
        tipo: 'archivo',
        nombre: 'Remisión o soporte anterior',
        url: texto,
        ruta: '',
        mime: 'application/pdf',
        tamano: 0
      }];
    }

    return [];
  }

  window.AdjuntosCommon = Object.freeze({
    MIN_ADJUNTOS,
    MAX_ADJUNTOS,
    MAX_ARCHIVO_BYTES,
    escaparHTML,
    obtenerExtension,
    validarArchivo,
    normalizarDriveUrl,
    nombreEnlaceDrive,
    formatearTamano,
    tipoVisual,
    serializarRecepcion,
    deserializarRecepcion
  });
})();
