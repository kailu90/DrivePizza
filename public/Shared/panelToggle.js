/**
 * panelToggle.js — Shared
 * Maneja expand/collapse de paneles laterales del #workspace.
 *
 * Uso:
 *   import { initPanel } from '../Shared/panelToggle.js';
 *
 *   const wa  = initPanel('panel-wa',  'strip-wa',  'dp_panel_wa');
 *   const pbx = initPanel('panel-pbx', 'strip-pbx', 'dp_panel_pbx');
 *
 *   // Abrir desde código externo (ej. botón en header mobile):
 *   wa.open();
 *   pbx.close();
 *   pbx.toggle();
 *
 * Desktop:
 *   collapsed (44px franja) ←→ expanded (320px contenido)
 *   Estado persistido en localStorage.
 *   Default: collapsed.
 *
 * Mobile:
 *   Overlay fijo que desliza desde el borde.
 *   Se cierra al tocar el #workspace-overlay.
 */

const MOBILE_BP = 768;

/**
 * @param {string} panelId     - ID del elemento .side-panel
 * @param {string} stripId     - ID del .panel-strip (botón toggle desktop)
 * @param {string} storageKey  - Clave localStorage para persistir estado
 * @param {string} [overlayId] - ID del overlay backdrop (default: 'workspace-overlay')
 * @returns {{ open: Function, close: Function, toggle: Function } | null}
 */
export function initPanel(panelId, stripId, storageKey, overlayId = 'workspace-overlay') {
    const panel   = document.getElementById(panelId);
    const strip   = document.getElementById(stripId);
    const overlay = document.getElementById(overlayId);

    if (!panel) {
        console.warn(`[panelToggle] Panel #${panelId} no encontrado`);
        return null;
    }

    const isMobile = () => window.innerWidth <= MOBILE_BP;

    // ── Restaurar estado al cargar (solo desktop) ───────────────────────────
    if (!isMobile()) {
        const saved = localStorage.getItem(storageKey);
        saved === 'expanded' ? _expand() : _collapse();
    }

    // ── Toggle al hacer clic en el círculo (desktop) ────────────────────────
    strip?.addEventListener('click', () => {
        if (!isMobile()) {
            strip.classList.add('tapped');
            strip.addEventListener('animationend', () => strip.classList.remove('tapped'), { once: true });
            _toggle();
        }
    });

    // ── Cerrar al tocar el overlay (mobile) ─────────────────────────────────
    overlay?.addEventListener('click', () => {
        if (isMobile() && panel.classList.contains('mobile-open')) _closeM();
    });

    // ── Internos ─────────────────────────────────────────────────────────────

    function _expand() {
        panel.classList.remove('collapsed');
        panel.classList.add('expanded');
        localStorage.setItem(storageKey, 'expanded');
    }

    function _collapse() {
        panel.classList.remove('expanded');
        panel.classList.add('collapsed');
        localStorage.setItem(storageKey, 'collapsed');
    }

    function _toggle() {
        panel.classList.contains('expanded') ? _collapse() : _expand();
    }

    function _openM() {
        panel.classList.add('mobile-open');
        overlay?.classList.add('active');
    }

    function _closeM() {
        panel.classList.remove('mobile-open');
        // Quitar overlay solo si ningún otro panel sigue abierto
        const aun_abiertos = document.querySelectorAll('.side-panel.mobile-open').length;
        if (aun_abiertos === 0) overlay?.classList.remove('active');
    }

    function _toggleM() {
        panel.classList.contains('mobile-open') ? _closeM() : _openM();
    }

    // ── API pública ──────────────────────────────────────────────────────────
    return {
        open:   () => isMobile() ? _openM()   : _expand(),
        close:  () => isMobile() ? _closeM()  : _collapse(),
        toggle: () => isMobile() ? _toggleM() : _toggle(),
    };
}
