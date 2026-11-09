import { supabase } from '../Api/supabaseConfig.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede, revelarSplash } from '../Shared/components.js';
import { getProductos } from '../Shared/productosService.js';
import { ejecutarRecepcionMercancia } from './inventoryService.js';

CargarSidebar();

let _usuario   = 'Admin';
let _productos = [];   // [{ id, name, measurementUnit, active }]
let _rowCount  = 0;

verificarAccesoPlanta(async ({ username, sede }) => {
    _usuario = username || 'Admin';
    CargarHeader(capitalizarSede(sede));
    CargarFooter();
    _init().catch(err => { console.error(err); revelarSplash(); });
});

// ── Inicialización ───────────────────────────────────────────────────────────
async function _init() {
    document.getElementById('rc-fecha').value = _toISO(new Date());

    const [{ data: proveedores, error: errProv }, productos] = await Promise.all([
        supabase.from('proveedores').select('id, nombre').eq('active', true).order('nombre'),
        getProductos(),
    ]);
    if (errProv) throw errProv;

    // Poblar select de proveedores
    const selProv = document.getElementById('rc-proveedor');
    (proveedores || []).forEach(p => {
        const opt = document.createElement('option');
        opt.value       = p.id;
        opt.textContent = p.nombre;
        selProv.appendChild(opt);
    });

    // Guardar productos activos y poblar datalist
    _productos = (productos || [])
        .filter(p => p.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

    const list = document.getElementById('rc-productos-list');
    _productos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        list.appendChild(opt);
    });

    _agregarFila();
    revelarSplash();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function _toISO(date) {
    return date.toISOString().split('T')[0];
}

// ── Fila de producto ─────────────────────────────────────────────────────────
function _agregarFila() {
    _rowCount++;
    const tbody = document.getElementById('rc-tbody');
    const tr    = document.createElement('tr');

    tr.innerHTML = `
        <td class="rc-cell">
            <input type="text" class="rc-input rc-prod-input"
                placeholder="Buscar producto..." autocomplete="off" list="rc-productos-list">
        </td>
        <td class="rc-cell">
            <input type="number" class="rc-input rc-qty-input"
                placeholder="0" min="0.001" step="any">
        </td>
        <td class="rc-cell">
            <input type="text" class="rc-input rc-unit-input"
                placeholder="und" maxlength="20">
        </td>
        <td class="rc-cell rc-cell--action">
            <button class="rc-btn-remove" title="Eliminar fila">✕</button>
        </td>
    `;
    tbody.appendChild(tr);

    const prodInput = tr.querySelector('.rc-prod-input');
    const unitInput = tr.querySelector('.rc-unit-input');

    // Auto-completar unidad al seleccionar producto de la lista
    prodInput.addEventListener('change', () => {
        const prod = _productos.find(p => p.name === prodInput.value.trim());
        if (prod?.measurementUnit) unitInput.value = prod.measurementUnit;
    });

    // Eliminar fila
    tr.querySelector('.rc-btn-remove').addEventListener('click', () => tr.remove());

    prodInput.focus();
}

document.getElementById('rc-btn-add').addEventListener('click', _agregarFila);

// ── Cancelar ─────────────────────────────────────────────────────────────────
document.getElementById('rc-btn-cancelar').addEventListener('click', () => {
    if (confirm('¿Cancelar la recepción? Se perderán los datos ingresados.')) {
        _resetForm();
    }
});

// ── Registrar ────────────────────────────────────────────────────────────────
document.getElementById('rc-btn-registrar').addEventListener('click', async () => {
    const btn = document.getElementById('rc-btn-registrar');

    // Leer cabecera
    const selProv         = document.getElementById('rc-proveedor');
    const proveedorId     = parseInt(selProv.value) || null;
    const proveedorNombre = proveedorId ? selProv.options[selProv.selectedIndex].text : '';
    const fecha           = document.getElementById('rc-fecha').value;
    const numeroFactura   = document.getElementById('rc-factura').value.trim();
    const metodoPago      = document.getElementById('rc-metodo').value;
    const valorTotal      = parseFloat(document.getElementById('rc-valor').value) || null;
    const notas           = document.getElementById('rc-notas').value.trim();

    if (!proveedorId) return alert('Selecciona un proveedor.');
    if (!fecha)       return alert('Ingresa la fecha.');
    if (!metodoPago)  return alert('Selecciona el método de pago.');

    // Leer filas de productos
    const filas    = [...document.querySelectorAll('#rc-tbody tr')];
    const productos = [];

    for (const tr of filas) {
        const nombre = tr.querySelector('.rc-prod-input').value.trim();
        const cant   = parseFloat(tr.querySelector('.rc-qty-input').value);
        const unidad = tr.querySelector('.rc-unit-input').value.trim();

        if (!nombre && !cant) continue; // fila vacía — ignorar

        if (!nombre)         return alert('Hay una fila sin nombre de producto.');
        if (!cant || cant <= 0) return alert(`"${nombre}": la cantidad debe ser mayor a 0.`);

        const prod = _productos.find(p => p.name === nombre);
        if (!prod) return alert(`"${nombre}" no está en el catálogo. Selecciónalo de la lista.`);

        productos.push({
            productoId:     prod.id,
            productoNombre: prod.name,
            cantidad:       cant,
            unidadMedida:   unidad || prod.measurementUnit || 'und',
        });
    }

    if (productos.length === 0) return alert('Agrega al menos un producto.');

    if (!confirm(`¿Registrar recepción de ${productos.length} producto(s)?`)) return;

    btn.disabled    = true;
    btn.textContent = 'Registrando...';

    try {
        const recepcionId = await ejecutarRecepcionMercancia({
            proveedorId,
            proveedorNombre,
            fecha,
            numeroFactura: numeroFactura || null,
            valorTotal,
            metodoPago,
            notas:    notas || null,
            productos,
            usuario:  _usuario,
        });

        alert(`Recepción #${recepcionId} registrada correctamente.\n${productos.length} producto(s) actualizados en inventario.`);
        _resetForm();
    } catch (err) {
        console.error('Error al registrar recepción:', err);
        alert('Error al registrar: ' + (err.message || JSON.stringify(err)));
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Registrar';
    }
});

// ── Limpiar formulario ───────────────────────────────────────────────────────
function _resetForm() {
    document.getElementById('rc-proveedor').value = '';
    document.getElementById('rc-fecha').value     = _toISO(new Date());
    document.getElementById('rc-factura').value   = '';
    document.getElementById('rc-metodo').value    = '';
    document.getElementById('rc-valor').value     = '';
    document.getElementById('rc-notas').value     = '';
    document.getElementById('rc-tbody').innerHTML = '';
    _rowCount = 0;
    _agregarFila();
}
