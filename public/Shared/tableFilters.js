/**
 * initColumnFilters(tbodyId, columns)
 *
 * Inserta una fila de inputs de filtro en el <thead> de la tabla que contiene
 * el tbody indicado y retorna una función `apply()` para re-aplicar el filtro
 * después de re-renderizar el tbody.
 *
 * @param {string} tbodyId  - ID del <tbody> a filtrar
 * @param {Object} columns  - Objeto { colIndex: config }
 *   config puede ser:
 *     - string  → input tipo texto con ese placeholder
 *     - { type: 'date' }  → input tipo date (compara YYYY-MM-DD y DD/MM/YYYY)
 *     - { type: 'date', placeholder: '...' }
 * @returns {Function} apply - Llama a apply() después de cada re-render del tbody
 */
export function initColumnFilters(tbodyId, columns) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return () => {};

    const table = tbody.closest('table');
    const thead = table?.querySelector('thead');
    if (!thead) return () => {};

    const colCount = thead.rows[0]?.cells.length || 0;

    const filterRow = document.createElement('tr');
    filterRow.className = 'inventory-management__row cf-filter-row';

    const inputs = {};
    for (let i = 0; i < colCount; i++) {
        const th = document.createElement('th');
        const cfg = columns[i];
        if (cfg) {
            const input = document.createElement('input');
            input.className = 'col-filter';
            if (typeof cfg === 'string') {
                input.type = 'text';
                input.placeholder = cfg;
            } else {
                input.type = cfg.type || 'text';
                if (cfg.placeholder) input.placeholder = cfg.placeholder;
            }
            input.addEventListener('input', apply);
            th.appendChild(input);
            inputs[i] = input;
        }
        filterRow.appendChild(th);
    }
    thead.appendChild(filterRow);

    function apply() {
        tbody.querySelectorAll('.inventory-management__row').forEach(row => {
            const cells = row.querySelectorAll('.inventory-management__cell');
            const visible = Object.entries(inputs).every(([idx, inp]) => {
                const v = inp.value;
                if (!v) return true;
                const cellText = (cells[idx]?.textContent || '').toLowerCase();
                if (inp.type === 'date') {
                    // Soporta celdas en formato YYYY-MM-DD o DD/MM/YYYY
                    const [y, m, d] = v.split('-');
                    const formatted = `${d}/${m}/${y}`;
                    return cellText.includes(v) || cellText.includes(formatted);
                }
                return cellText.includes(v.toLowerCase());
            });
            row.style.display = visible ? '' : 'none';
        });
    }

    return apply;
}
