// ═══════════════════════════════════════════════════════
// Shared/paginacion.js — Paginación reutilizable
// Usado por: pedidosPizzeria.js, pizzerias.js
// ═══════════════════════════════════════════════════════

/**
 * Calcula cuántas filas de tabla caben en la altura disponible de pantalla.
 * @param {string} cardSel   Selector del contenedor padre de la tabla
 * @param {string} theadSel  Selector del thead
 * @param {number} rowHeight Altura aproximada por fila en px (default 46)
 * @param {number} extraPx   Espacio extra a reservar: paginación + padding (default 64)
 */
export function calcularPageSize(cardSel, theadSel, rowHeight = 46, extraPx = 64) {
    const thead = document.querySelector(theadSel);
    if (!thead) return 10;
    const theadBottom = thead.getBoundingClientRect().bottom;
    const available   = window.innerHeight - theadBottom - extraPx;
    return Math.max(5, Math.floor(available / rowHeight));
}

/**
 * Crea un controlador de paginación reutilizable.
 * @param {string}   contenedorId  ID del elemento donde se renderizan los botones
 * @param {function} onCambio      Callback() llamado cuando cambia de página
 * @returns {{ render, reiniciar, pagina }}
 */
export function crearPaginacion(contenedorId, onCambio) {
    let pagina = 1;

    function render(total, pageSize) {
        const el = document.getElementById(contenedorId);
        if (!el) return;
        const totalPags = Math.ceil(total / pageSize);
        if (totalPags <= 1) { el.innerHTML = ''; return; }

        el.innerHTML = `
            <button class="pag-btn" data-dir="-1" ${pagina === 1 ? 'disabled' : ''}>← Anterior</button>
            <span class="pag-info">Página ${pagina} de ${totalPags} &nbsp;·&nbsp; ${total} pedidos</span>
            <button class="pag-btn" data-dir="1" ${pagina === totalPags ? 'disabled' : ''}>Siguiente →</button>
        `;
        el.querySelectorAll('.pag-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const nueva = pagina + Number(btn.dataset.dir);
                if (nueva >= 1 && nueva <= totalPags) {
                    pagina = nueva;
                    onCambio();
                }
            });
        });
    }

    return {
        render,
        reiniciar() { pagina = 1; },
        get pagina() { return pagina; },
        set pagina(v) { pagina = v; },
    };
}
