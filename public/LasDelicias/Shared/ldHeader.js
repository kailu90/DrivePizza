// public/LasDelicias/Shared/ldHeader.js
// Header compartido de Las Delicias — importar desde cada modulo LD

const _LOGO = new URL('../Imagenes/Logo1.png', import.meta.url).href

const SVG = {
    home: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`,
    pin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S9 3.17 9 4v.68C6.63 5.36 5 7.92 5 11v5l-2 2v1h16v-1l-2-2z"/></svg>`,
    users: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
    leaf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
    notepad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>`,
    pencil: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
}

/**
 * Monta el header compartido de Las Delicias.
 *
 * @param {object}   opts
 * @param {string}   opts.navLabel  - Label de la seccion activa (ej: 'Pedidos')
 * @param {Array}    opts.navItems  - [{ label, href, active? }] para el dropdown
 * @param {Function} opts.onLogout  - Callback al cerrar sesion
 * @returns {HTMLElement} El elemento header insertado
 */
export function mountHeader({ navLabel = 'Inicio', navSections = [], navItems = [], navActions = [], onHome, onLogout } = {}) {
    const hasDropdown = navSections.length > 0

    const showNavControls = !!onHome || hasDropdown

    const hdr = document.createElement('header')
    hdr.className = 'ld-header'
    const _sedeWrap = `<div class="ld-header__sede-wrap"><svg class="ld-header__sede-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg><span class="ld-header__sede" id="hdr-sede"></span></div>`

    hdr.innerHTML = `
        <img src="${_LOGO}" class="ld-header__logo" alt="Las Delicias">
        <div class="ld-header__nav-wrap">
            ${showNavControls ? `<div class="ld-header__nav-controls">
                ${onHome ? `<button class="ld-header__nav-home" id="hdr-home-btn" title="Inicio">${SVG.home}</button>` : ''}
                <button class="ld-header__nav-btn" id="hdr-nav-btn">
                    <span id="hdr-nav-label">${navLabel}</span>
                    ${hasDropdown ? SVG.chevron : ''}
                </button>
                ${hasDropdown ? '<div class="ld-header__nav-dropdown" id="hdr-nav-dropdown"></div>' : ''}
            </div>` : _sedeWrap}
        </div>
        <div class="ld-header__spacer"></div>
        <div class="ld-header__actions">
            ${navActions.length ? navActions.map((a, i) => `<button class="ld-header__icon-btn" data-nav-action="${i}" title="${a.label}">${SVG[a.icon] || ''}</button>`).join('') + '<div class="ld-header__actions-sep"></div>' : ''}
            ${showNavControls ? _sedeWrap : ''}
            ${onLogout ? `<button class="ld-header__logout-btn" id="hdr-logout-btn" title="Cerrar sesion">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
            </button>` : ''}
        </div>
    `

    document.body.prepend(hdr)

    // Botón casa
    if (onHome) {
        hdr.querySelector('#hdr-home-btn').addEventListener('click', onHome)
    }

    // Atajos de navegacion
    navActions.forEach((a, i) => {
        hdr.querySelector(`[data-nav-action="${i}"]`)?.addEventListener('click', a.onClick)
    })

    // Botón logout
    if (onLogout) {
        hdr.querySelector('#hdr-logout-btn').addEventListener('click', onLogout)
    }

    // Construir dropdown
    if (hasDropdown) {
        const btn = hdr.querySelector('#hdr-nav-btn')
        const dd  = hdr.querySelector('#hdr-nav-dropdown')

        // Solo secciones / marcas — Historial y Cerrar sesion van en otro lugar
        navSections.forEach(it => {
            const b = document.createElement('button')
            b.className = 'ld-header__nav-item' + (it.active ? ' active' : '')
            b.textContent = it.label
            if (it.description) b.dataset.tooltip = it.description
            if (it.onClick)     b.addEventListener('click', it.onClick)
            dd.appendChild(b)
        })

        btn.addEventListener('click', e => {
            e.stopPropagation()
            dd.classList.toggle('open')
        })
        document.addEventListener('click', () => dd.classList.remove('open'), { passive: true })
    }

    return hdr
}

/**
 * Actualiza avatar y tooltip tras cargar el perfil.
 * @param {{ username?: string, sede?: string }} opts
 */
export function setHeaderUser({ username = '', sede = '' } = {}) {
    const sedeEl = document.getElementById('hdr-sede')
    if (sedeEl && sede) sedeEl.textContent = sede
}
