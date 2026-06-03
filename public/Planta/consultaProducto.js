import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { getProductos } from '../Shared/productosService.js';

import { supabase } from '../Api/supabaseConfig.js';

verificarAccesoPlanta(({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
    document.body.classList.add('loaded');
});

// ── DOM ────────────────────────────────────────────────────────────────────
const inputProducto  = document.getElementById('cp-producto');
const datalistEl     = document.getElementById('cp-producto-list');
const inputDesde     = document.getElementById('cp-desde');
const inputHasta     = document.getElementById('cp-hasta');
const btnGenerar     = document.getElementById('cp-btn-generar');
const errorEl        = document.getElementById('cp-error');
const resultadosEl   = document.getElementById('cp-resultados');
const tituloEl       = document.getElementById('cp-resultado-titulo');
const tbodyEl        = document.getElementById('cp-tbody');
const tfootEl        = document.getElementById('cp-tfoot');
const btnExport      = document.getElementById('cp-btn-export');

// ── Fecha de hoy por defecto (hora local Colombia, no UTC) ────────────────
function getFechaHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hoy = getFechaHoy();
inputDesde.value = hoy;
inputHasta.value = hoy;

// ── Cargar productos en datalist ───────────────────────────────────────────
let _productosMap = {}; // nombre → id (Supabase)

getProductos().then(productos => {
    productos
        .filter(p => p.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
        .forEach(p => {
            _productosMap[p.name] = p.id;
            const opt = document.createElement('option');
            opt.value = p.name;
            datalistEl.appendChild(opt);
        });
}).catch(console.error);

function getProductoId() {
    return _productosMap[inputProducto.value.trim()] || null;
}

// ── Habilitar botón cuando los campos están completos ─────────────────────
function validarFormulario() {
    const ok = getProductoId() && inputDesde.value && inputHasta.value;
    btnGenerar.disabled = !ok;
}

inputProducto.addEventListener('input', validarFormulario);
inputDesde.addEventListener('change', validarFormulario);
inputHasta.addEventListener('change', validarFormulario);

// ── Generar resumen ────────────────────────────────────────────────────────
btnGenerar.addEventListener('click', async () => {
    const productoId = getProductoId();
    const desde      = inputDesde.value;
    const hasta      = inputHasta.value;

    if (!productoId) {
        mostrarError('Selecciona un producto válido de la lista.');
        return;
    }
    if (desde > hasta) {
        mostrarError('La fecha "desde" no puede ser mayor que "hasta".');
        return;
    }

    ocultarError();
    btnGenerar.disabled = true;
    btnGenerar.textContent = 'Generando...';
    resultadosEl.style.display = 'none';

    try {
        const { data: rawPedidos, error } = await supabase
            .from('pedidos_planta')
            .select('delivery_date, status, products')
            .eq('eliminado', false)
            .gte('delivery_date', desde)
            .lte('delivery_date', hasta);

        if (error) throw error;
        const pedidos = (rawPedidos || []).map(p => ({
            deliveryDate: p.delivery_date,
            status:       p.status,
            products:     p.products,
        }));

        // Agrupa por deliveryDate las cantidades del producto seleccionado
        // Todos los pedidos (migrados y nuevos) usan el mismo ID numérico de Supabase
        const porDia = {};
        pedidos
            .filter(p => p.status !== 'cancelado')
            .forEach(p => {
                const dia = p.deliveryDate || '—';
                (p.products || []).forEach(pr => {
                    if (String(pr.idProduct) !== productoId) return;
                    const cant = Number(pr.quantity) || 0;
                    if (!cant) return;
                    porDia[dia] = (porDia[dia] || 0) + cant;
                });
            });

        renderResultados(porDia, inputProducto.value.trim(), desde, hasta);
    } catch (err) {
        console.error(err);
        mostrarError('Error al consultar. Intenta de nuevo.');
    } finally {
        btnGenerar.disabled = false;
        btnGenerar.textContent = 'Generar resumen';
    }
});

// ── Render resultados ──────────────────────────────────────────────────────
let _porDiaActual = {};

function renderResultados(porDia, nombreProducto, desde, hasta) {
    _porDiaActual = porDia;

    const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a));

    tbodyEl.innerHTML = '';
    let totalSalidas = 0;

    if (dias.length === 0) {
        tbodyEl.innerHTML = '<tr><td colspan="3" class="mv-loading">Sin pedidos en el período seleccionado.</td></tr>';
        tfootEl.innerHTML = '';
    } else {
        dias.forEach(dia => {
            const salidas = porDia[dia];
            totalSalidas += salidas;
            const d = new Date(dia + 'T12:00:00Z');
            const diaNombre = d.toLocaleDateString('es-CO', { weekday: 'long' });
            const fechaFmt  = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="mv-cell" style="text-transform:capitalize">${diaNombre}</td>
                <td class="mv-cell">${fechaFmt}</td>
                <td class="mv-cell col-center">${salidas}</td>
            `;
            tbodyEl.appendChild(tr);
        });

        tfootEl.innerHTML = `
            <td class="mv-cell" colspan="2"><strong>TOTAL</strong></td>
            <td class="mv-cell col-center"><strong>${totalSalidas}</strong></td>
        `;
    }

    tituloEl.textContent = `${nombreProducto} · ${desde} → ${hasta}`;
    resultadosEl.style.display = '';
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
btnExport.addEventListener('click', () => {
    if (!Object.keys(_porDiaActual).length) {
        alert('No hay datos para exportar.');
        return;
    }

    const filas = Object.keys(_porDiaActual).sort((a, b) => b.localeCompare(a)).map(dia => {
        const d = new Date(dia + 'T12:00:00Z');
        return {
            'Fecha':    d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            'Cantidad': _porDiaActual[dia],
        };
    });

    const ws = window.XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 16 }, { wch: 12 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Consulta');
    window.XLSX.writeFile(wb, `consulta_${inputProducto.value.trim()}_${inputDesde.value}_${inputHasta.value}.xlsx`);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function mostrarError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = '';
}
function ocultarError() {
    errorEl.style.display = 'none';
}
