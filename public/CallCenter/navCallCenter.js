/**
 * navCallCenter.js
 * Inyecta los botones de navegación del CallCenter en #header-controls,
 * antes del botón de logout, omitiendo la página actual.
 *
 * Uso: import { initNavButtons } from './navCallCenter.js';
 *      initNavButtons('pedidos' | 'historial' | 'clientes');
 */

const PAGES = {
    pedidos: {
        tooltip: 'Tomar Pedidos',
        href:    './pedidosCallCenter.html',
        icon:    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </svg>`,
    },
    historial: {
        tooltip: 'Historial Pedidos',
        href:    './historialPedidos.html',
        icon:    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>`,
    },
    clientes: {
        tooltip: 'Clientes',
        href:    './clientesCall.html',
        icon:    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>`,
    },
};

export function initNavButtons(paginaActual) {
    const logout = document.getElementById('btn-logout');
    if (!logout) return;

    Object.entries(PAGES)
        .filter(([key]) => key !== paginaActual)
        .reverse() // mantener orden: pedidos → historial → clientes
        .forEach(([, page]) => {
            const btn = document.createElement('button');
            btn.className       = 'btn-historial with-tooltip';
            btn.dataset.tooltip = page.tooltip;
            btn.innerHTML       = page.icon;
            btn.addEventListener('click', () => { window.location.href = page.href; });
            logout.parentElement.insertBefore(btn, logout);
        });
}
