/**
 * ciudadToggle.js — Componente reutilizable de selección de ciudad
 *
 * Uso:
 *   import { initCiudadToggle, getCiudadActual } from '../Shared/ciudadToggle.js';
 *
 *   // Montar el toggle en un contenedor con class="ciudad-toggle"
 *   const ciudad = initCiudadToggle('ciudad-toggle');
 *
 *   // Reaccionar a cambios desde cualquier parte de la página
 *   document.addEventListener('ciudad:change', e => console.log(e.detail.ciudad));
 */

const _SVG_PIN = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
</svg>`;

const LS_KEY  = 'cc_ciudad';
const DEFAULT = 'bucaramanga';

const CIUDADES = [
    { key: 'bucaramanga', label: 'BUCARAMANGA' },
    { key: 'cartago',     label: 'CARTAGO'     },
];

/**
 * Inicializa el toggle de ciudad en el contenedor indicado.
 * Renderiza los botones, gestiona localStorage y dispara 'ciudad:change'.
 *
 * @param {string|HTMLElement} container — ID del elemento o el elemento directamente
 * @returns {string} ciudad actualmente seleccionada
 */
export function initCiudadToggle(container, { onBeforeChange } = {}) {
    const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;
    if (!el) return DEFAULT;

    const actual = localStorage.getItem(LS_KEY) || DEFAULT;
    window.ciudadActual = actual;

    el.innerHTML = CIUDADES.map(c => `
        <button class="ciudad-btn${c.key === actual ? ' ciudad-btn--active' : ''}" data-ciudad="${c.key}">
            ${_SVG_PIN} ${c.label}
        </button>
    `).join('');

    el.addEventListener('click', e => {
        const btn = e.target.closest('.ciudad-btn');
        if (!btn) return;
        const ciudad = btn.dataset.ciudad;
        if (ciudad === window.ciudadActual) return;
        if (onBeforeChange && !onBeforeChange(ciudad)) return;
        window.ciudadActual = ciudad;
        localStorage.setItem(LS_KEY, ciudad);
        el.querySelectorAll('.ciudad-btn').forEach(b =>
            b.classList.toggle('ciudad-btn--active', b.dataset.ciudad === ciudad)
        );
        document.dispatchEvent(new CustomEvent('ciudad:change', { detail: { ciudad } }));
    });

    return actual;
}

/**
 * Devuelve la ciudad actualmente seleccionada (sin necesidad de montar el toggle).
 * @returns {string}
 */
export function getCiudadActual() {
    return localStorage.getItem(LS_KEY) || DEFAULT;
}
