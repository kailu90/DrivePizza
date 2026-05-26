// ═══════════════════════════════════════════════════════════════
// SKELETON LOADER — EverestCentral
// 100% frontend. Sin consultas a Firebase.
// ═══════════════════════════════════════════════════════════════

const SKELETONS = {

    // ── Header genérico reutilizable ──────────────────────────
    header: `
        <div class="sk-header">
            <div class="sk-block sk-logo"></div>
            <div class="sk-block sk-title"></div>
            <div class="sk-block sk-btn"></div>
        </div>`,

    // ── Filas de tabla reutilizables ──────────────────────────
    tablaFilas: (n = 8) => Array.from({ length: n }, () => `
        <div class="sk-row">
            <div class="sk-block"></div>
            <div class="sk-block"></div>
            <div class="sk-block"></div>
            <div class="sk-block"></div>
            <div class="sk-block"></div>
        </div>`).join(''),

    // ── Tarjetas de resumen ───────────────────────────────────
    cards: (n = 4) => `
        <div class="sk-cards">
            ${Array.from({ length: n }, () => '<div class="sk-block sk-card"></div>').join('')}
        </div>`,

    // ── Categorías sidebar ────────────────────────────────────
    categorias: (n = 10) => `
        <div class="sk-sidebar-cats">
            ${Array.from({ length: n }, () => '<div class="sk-block"></div>').join('')}
        </div>`,

    // ── Grid de productos ─────────────────────────────────────
    productGrid: (n = 12) => `
        <div class="sk-product-grid">
            ${Array.from({ length: n }, () => '<div class="sk-block"></div>').join('')}
        </div>`,

    // ── Panel de orden (carrito) ──────────────────────────────
    orderPanel: (n = 5) => `
        <div class="sk-order-panel">
            ${Array.from({ length: n }, () => '<div class="sk-block"></div>').join('')}
            <div class="sk-block sk-order-total"></div>
        </div>`,
};

// ── PÁGINAS ───────────────────────────────────────────────────────
// Cada página define su estructura de skeleton
const PAGINAS = {

    login: () => `
        <div class="sk-form">
            <div class="sk-block sk-form-logo"></div>
            <div class="sk-block sk-form-title"></div>
            <div class="sk-block sk-form-input"></div>
            <div class="sk-block sk-form-input"></div>
            <div class="sk-block sk-form-btn"></div>
        </div>`,

    callcenter: () => `
        ${SKELETONS.header}
        <div class="sk-panel-cards">
            <div class="sk-block"></div>
            <div class="sk-block"></div>
            <div class="sk-block"></div>
            <div class="sk-block"></div>
        </div>`,

    pedidos: () => `
        ${SKELETONS.header}
        <div class="sk-layout-productos">
            ${SKELETONS.categorias(10)}
            ${SKELETONS.productGrid(12)}
            ${SKELETONS.orderPanel(5)}
        </div>`,

    historial: () => `
        ${SKELETONS.header}
        <div class="sk-body">
            ${SKELETONS.cards(4)}
            <div class="sk-table">
                <div class="sk-block sk-table-header"></div>
                ${SKELETONS.tablaFilas(8)}
            </div>
        </div>`,

    dashboard: () => `
        ${SKELETONS.header}
        <div class="sk-body">
            ${SKELETONS.cards(4)}
            <div class="sk-table">
                <div class="sk-block sk-table-header"></div>
                ${SKELETONS.tablaFilas(8)}
            </div>
        </div>`,
};

// ── API PÚBLICA ───────────────────────────────────────────────────

/**
 * Inicializa el skeleton de la página actual.
 * @param {string} tipo — clave de PAGINAS ('login','callcenter','pedidos','historial','dashboard')
 */
export function mostrarSkeleton(tipo) {
    const el = document.getElementById('skeleton');
    if (!el || !PAGINAS[tipo]) return;
    el.innerHTML = PAGINAS[tipo]();
}

/**
 * Oculta el skeleton y muestra el contenido real.
 * @param {string} contenidoId — id del elemento a mostrar (default: 'contenido-principal')
 */
export function ocultarSkeleton(contenidoId = 'contenido-principal') {
    const sk = document.getElementById('skeleton');
    const contenido = document.getElementById(contenidoId);
    if (sk) sk.classList.add('oculto');
    if (contenido) contenido.style.display = '';
}
