(function () {
  'use strict';

  if (window.__erpUiIntegrityInstalled) return;
  window.__erpUiIntegrityInstalled = true;

  const MODAL_SELECTOR = [
    '.modal-documentos',
    '.modal-overlay',
    '.conf-modal-overlay',
    '[role="dialog"]'
  ].join(',');

  const CLOSE_CONTROL_SELECTOR = [
    '.btn-cerrar-modal',
    '.btn-close-modal',
    '.conf-btn-close',
    '.btn-cancel',
    '[data-modal-close]',
    '#cancelarAnalisis',
    '#cerrarModalConfiabilidad',
    '#cerrarDetalleAuditoria'
  ].join(',');

  function isVisible(element) {
    if (!element || element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findModal(element) {
    return element?.closest?.(MODAL_SELECTOR) || null;
  }

  function callIfAvailable(name) {
    const fn = window[name];
    if (typeof fn !== 'function') return false;
    try {
      fn();
      return true;
    } catch (error) {
      console.error(`[UI Integrity] Falló ${name}:`, error);
      return false;
    }
  }

  function closeByModuleContract(modal) {
    if (!modal) return false;

    switch (modal.id) {
      case 'modalGestion':
        return callIfAvailable('cerrarModalGestion');
      case 'modalSoportesRecepcion':
        return callIfAvailable('cerrarModalSoportesRecepcion');
      case 'modalNovedadInventario':
        return callIfAvailable('cerrarModalNovedad');
      case 'modalConfiabilidad':
        return callIfAvailable('cerrarModalConfiabilidad');
      case 'modalObservacion':
        if (modal.closest('.rec-module-container')) {
          return callIfAvailable('cerrarModalObservacion');
        }
        if (modal.closest('.inv-container')) {
          return callIfAvailable('cerrarObservacion');
        }
        return callIfAvailable('cerrarModalObservacion') || callIfAvailable('cerrarObservacion');
      default:
        return false;
    }
  }

  function closeModal(modal) {
    if (!modal) return;

    if (!closeByModuleContract(modal)) {
      modal.classList.remove('active', 'open', 'show', 'is-open');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }

    const focused = document.activeElement;
    if (focused && modal.contains(focused) && typeof focused.blur === 'function') {
      focused.blur();
    }
  }

  function buttonMeansCancel(button) {
    if (!button) return false;
    const text = String(button.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return text === 'cancelar' || text === 'cerrar' || text === '✕' || text === '×';
  }

  function isCloseControl(button) {
    return Boolean(
      button &&
      findModal(button) &&
      (button.matches(CLOSE_CONTROL_SELECTOR) || buttonMeansCancel(button))
    );
  }

  function normalizeModalControls(root) {
    const scope = root?.querySelectorAll ? root : document;
    const buttons = scope.querySelectorAll(`${MODAL_SELECTOR} button`);
    buttons.forEach(button => {
      if (isCloseControl(button) && !button.hasAttribute('type')) {
        button.type = 'button';
      }
    });
  }

  document.addEventListener('click', function (event) {
    const button = event.target?.closest?.('button');
    if (button && isCloseControl(button)) {
      const modal = findModal(button);
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal(modal);
      return;
    }

    const modal = event.target?.matches?.(MODAL_SELECTOR) ? event.target : null;
    if (modal && isVisible(modal)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeModal(modal);
    }
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;

    const visibleModals = Array.from(document.querySelectorAll(MODAL_SELECTOR)).filter(isVisible);
    const modal = visibleModals.at(-1);
    if (!modal) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeModal(modal);
  }, true);

  const mainContent = document.getElementById('mainContent');
  const observerTarget = mainContent || document.body;
  if (observerTarget) {
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) normalizeModalControls(node);
        });
      });
    });
    observer.observe(observerTarget, { childList: true, subtree: true });
  }

  normalizeModalControls(document);

  window.auditarControlesUI = function () {
    const buttons = Array.from(document.querySelectorAll('button'));
    const modals = Array.from(document.querySelectorAll(MODAL_SELECTOR));
    const closeControls = buttons.filter(isCloseControl);
    return {
      botones: buttons.length,
      modales: modals.length,
      controlesCierre: closeControls.length,
      modalesVisibles: modals.filter(isVisible).map(modal => modal.id || modal.className)
    };
  };
})();
