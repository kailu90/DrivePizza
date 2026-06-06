import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { getProductos } from '../Shared/productosService.js';

import { supabase } from '../Api/supabaseConfig.js';
import { colFechaToUTC } from '../Shared/semanas.js';

verificarAccesoPlanta(({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
});

// ── Helpers de fecha ──────────────────────────────────────────────────────────
function toISO(date) { return date.toISOString().split('T')[0]; }
function hoy() { return toISO(new Date()); }

function inicioSemana() {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return toISO(d);
}

function inicioMes() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return toISO(d);
}

function nextDay(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return toISO(new Date(y, m - 1, d + 1));
}

// ── Formato texto ─────────────────────────────────────────────────────────────
const EXCEPCIONES_TC = new Set(['x', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'con', 'sin', 'por']);
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map((w, i) =>
        (i === 0 || !EXCEPCIONES_TC.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
    ).join(' ');
}

function formatFecha(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// ── Inicializar fechas ────────────────────────────────────────────────────────
const desdeEl = document.getElementById('ii-desde');
const hastaEl = document.getElementById('ii-hasta');

desdeEl.value = hoy();
hastaEl.value = hoy();

document.getElementById('ii-btn-hoy').addEventListener('click', () => {
    desdeEl.value = hoy(); hastaEl.value = hoy();
});
document.getElementById('ii-btn-semana').addEventListener('click', () => {
    desdeEl.value = inicioSemana(); hastaEl.value = hoy();
});
document.getElementById('ii-btn-mes').addEventListener('click', () => {
    desdeEl.value = inicioMes(); hastaEl.value = hoy();
});

// ── Generar informe ───────────────────────────────────────────────────────────
document.getElementById('ii-btn-generar').addEventListener('click', generarInforme);

async function generarInforme() {
    const desde = desdeEl.value;
    const hasta = hastaEl.value;

    if (!desde || !hasta) {
        alert('Selecciona un rango de fechas.');
        return;
    }

    const btn = document.getElementById('ii-btn-generar');
    const status = document.getElementById('ii-status');
    btn.disabled = true;
    btn.textContent = 'Generando...';

    try {
        // ── 1. Categorías + Productos ─────────────────────────────────────
        status.textContent = 'Cargando categorías y productos...';
        const [{ data: rawCategorias, error: errCat }, productos] = await Promise.all([
            supabase.from('categorias').select('id_category, name'),
            getProductos(),
        ]);
        if (errCat) throw errCat;

        const categorias = rawCategorias.map(c => ({ idCategory: c.id_category, name: c.name }));

        const categoriasMap = {}; // idCategory → name
        categorias.forEach(c => { categoriasMap[c.idCategory] = c.name; });

        const embalajeCatId = categorias.find(
            c => c.name.toLowerCase().includes('embalaje')
        )?.idCategory;

        const masaCatId = categorias.find(
            c => c.name.toLowerCase().includes('masa')
        )?.idCategory;

        // Hoja 1: Embalajes
        const filasEmbalajes = productos
            .filter(p => embalajeCatId && String(p.idCategory) === String(embalajeCatId))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
            .map(p => ({
                'Producto': toTitleCase(p.name),
                'Stock':    p.stock ?? 0,
                'Precio':   p.price ?? '',
                'Unidad':   p.measurementUnit || '',
            }));

        // Hoja 2: Stock Productos (excluye embalajes y stock negativo)
        const filasStock = productos
            .filter(p => {
                if (embalajeCatId && String(p.idCategory) === String(embalajeCatId)) return false;
                if ((p.stock ?? 0) < 0) return false;
                return true;
            })
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
            .map(p => ({
                'Producto':  toTitleCase(p.name),
                'Categoria': toTitleCase(categoriasMap[p.idCategory] || '—'),
                'Stock':     p.stock ?? 0,
                'Precio':    p.price ?? '',
                'Unidad':    p.measurementUnit || '',
            }));

        // Hoja 3: Masa
        const filasMasa = productos
            .filter(p => masaCatId && String(p.idCategory) === String(masaCatId))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
            .map(p => ({
                'Producto': toTitleCase(p.name),
                'Stock':    p.stock ?? 0,
                'Precio':   p.price ?? '',
                'Unidad':   p.measurementUnit || '',
            }));

        // Hoja 4: Todos los Productos (catálogo completo, sin filtros de stock)
        const filasTodos = productos
            .sort((a, b) => {
                const catA = (categoriasMap[a.idCategory] || '').localeCompare(categoriasMap[b.idCategory] || '', 'es');
                return catA !== 0 ? catA : (a.name || '').localeCompare(b.name || '', 'es');
            })
            .map(p => ({
                'Producto':  toTitleCase(p.name),
                'Categoria': toTitleCase(categoriasMap[p.idCategory] || '—'),
                'Stock':     p.stock ?? 0,
                'Precio':    p.price ?? '',
                'Unidad':    p.measurementUnit || '',
            }));

        // ── 2. Pedidos ─────────────────────────────────────────────────────
        status.textContent = 'Cargando pedidos y movimientos...';
        const { data: rawPedidos, error: errP } = await supabase
            .from('pedidos_planta')
            .select('id, id_pedido, delivery_date, user_sede, status, net_cost, products, eliminado')
            .gte('delivery_date', desde)
            .lt('delivery_date', nextDay(hasta))
            .order('id_pedido', { ascending: true });
        if (errP) throw errP;

        // ── 3. Movimientos paginados (max_rows del servidor = 1000) ────────
        const PAGE = 1000;
        const fechaInicio = colFechaToUTC(desde, 'inicio');
        const fechaFin    = colFechaToUTC(hasta, 'fin');
        let rawMovs = [];
        let offset = 0;
        while (true) {
            const { data: page, error: errM } = await supabase
                .from('movimientos')
                .select('fecha, tipo, producto_nombre, cantidad, pedido_numero, motivo, usuario, sede')
                .gte('fecha', fechaInicio)
                .lte('fecha', fechaFin)
                .order('fecha', { ascending: true })
                .range(offset, offset + PAGE - 1);
            if (errM) throw errM;
            rawMovs = rawMovs.concat(page || []);
            if (!page || page.length < PAGE) break;
            offset += PAGE;
        }

        const pedidosData = (rawPedidos || []).map(p => ({
            idPedido:    p.id_pedido,
            deliveryDate: p.delivery_date,
            user:        p.user_sede,
            status:      p.status,
            netCost:     p.net_cost,
            products:    p.products,
            eliminado:   p.eliminado,
        }));

        const movimientosData = (rawMovs || []).map(m => ({
            fecha:         m.fecha,
            tipo:          m.tipo,
            productoNombre: m.producto_nombre,
            cantidad:      m.cantidad,
            pedidoNumero:  m.pedido_numero,
            motivo:        m.motivo,
            usuario:       m.usuario,
            sede:          m.sede,
        }));

        // Índice nombre producto → categoría (para Detalle Pedidos)
        const nombreCatMap = {};
        productos.forEach(p => {
            if (p.name) nombreCatMap[p.name.toLowerCase()] = toTitleCase(categoriasMap[p.idCategory] || '—');
        });

        // Hoja 3: Detalle Pedidos
        const filasDetalle = [];
        pedidosData
            .filter(p => !p.eliminado)
            .sort((a, b) => (a.idPedido ?? 0) - (b.idPedido ?? 0))
            .forEach(pedido => {
                const prods = pedido.products || [];
                if (prods.length === 0) {
                    filasDetalle.push({
                        'ID Pedido':       pedido.idPedido ?? '',
                        'Fecha Entrega':   pedido.deliveryDate ?? '',
                        'Sede':            (pedido.user || '').toLowerCase(),
                        'Estado':          pedido.status ?? '',
                        'Producto':        '(sin productos)',
                        'Categoria':       '',
                        'Cantidad':        '',
                        'Precio Unitario': '',
                        'Total Producto':  '',
                        'Total Pedido':    pedido.netCost ?? 0,
                    });
                } else {
                    prods.forEach(prod => {
                        const nombreKey = (prod.name ?? '').toLowerCase();
                        filasDetalle.push({
                            'ID Pedido':       pedido.idPedido ?? '',
                            'Fecha Entrega':   pedido.deliveryDate ?? '',
                            'Sede':            (pedido.user || '').toLowerCase(),
                            'Estado':          pedido.status ?? '',
                            'Producto':        toTitleCase(prod.name ?? ''),
                            'Categoria':       nombreCatMap[nombreKey] || '—',
                            'Cantidad':        prod.quantity ?? 0,
                            'Precio Unitario': prod.unitPrice ?? 0,
                            'Total Producto':  prod.totalPrice ?? 0,
                            'Total Pedido':    pedido.netCost ?? 0,
                        });
                    });
                }
            });

        // Hoja 4: Movimientos
        const filasMovimientos = movimientosData.map(m => ({
            'Fecha':      formatFecha(m.fecha),
            'Tipo':       toTitleCase(m.tipo),
            'Producto':   toTitleCase(m.productoNombre),
            'Cantidad':   m.cantidad ?? '',
            'N Pedido':   m.pedidoNumero || '',
            'Motivo':     m.motivo || '',
            'Usuario':    m.usuario || '—',
            'Sede':       m.sede || '',
        }));

        // ── 3. Construir workbook ──────────────────────────────────────────
        status.textContent = 'Generando archivo...';
        const wb = window.XLSX.utils.book_new();

        const wsEmbalajes = window.XLSX.utils.json_to_sheet(
            filasEmbalajes.length ? filasEmbalajes : [{ 'Producto': '(sin datos)', 'Stock': '', 'Precio': '', 'Unidad': '' }]
        );
        wsEmbalajes['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
        window.XLSX.utils.book_append_sheet(wb, wsEmbalajes, 'Embalajes');

        const wsStock = window.XLSX.utils.json_to_sheet(
            filasStock.length ? filasStock : [{ 'Producto': '(sin datos)', 'Categoria': '', 'Stock': '', 'Precio': '', 'Unidad': '' }]
        );
        wsStock['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
        window.XLSX.utils.book_append_sheet(wb, wsStock, 'Stock Productos');

        const wsMasa = window.XLSX.utils.json_to_sheet(
            filasMasa.length ? filasMasa : [{ 'Producto': '(sin datos)', 'Stock': '', 'Precio': '', 'Unidad': '' }]
        );
        wsMasa['!cols'] = [{ wch: 42 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
        window.XLSX.utils.book_append_sheet(wb, wsMasa, 'Masa');

        const wsTodos = window.XLSX.utils.json_to_sheet(
            filasTodos.length ? filasTodos : [{ 'Producto': '(sin datos)', 'Categoria': '', 'Stock': '', 'Precio': '', 'Unidad': '' }]
        );
        wsTodos['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];
        window.XLSX.utils.book_append_sheet(wb, wsTodos, 'Todos los Productos');

        const wsDetalle = window.XLSX.utils.json_to_sheet(
            filasDetalle.length ? filasDetalle : [{ 'ID Pedido': '(sin datos)' }]
        );
        wsDetalle['!cols'] = [
            { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
            { wch: 36 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }
        ];
        window.XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Pedidos');

        const wsMovimientos = window.XLSX.utils.json_to_sheet(
            filasMovimientos.length ? filasMovimientos : [{ 'Fecha': '(sin datos)' }]
        );
        wsMovimientos['!cols'] = [
            { wch: 18 }, { wch: 12 }, { wch: 32 }, { wch: 10 },
            { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 14 }
        ];
        window.XLSX.utils.book_append_sheet(wb, wsMovimientos, 'Movimientos');

        window.XLSX.writeFile(wb, `informe_inventario_${desde}_${hasta}.xlsx`);

        status.textContent = `Informe generado · ${filasEmbalajes.length} embalajes · ${filasMasa.length} masa · ${filasStock.length} stock · ${filasTodos.length} total productos · ${filasDetalle.length} filas pedidos · ${filasMovimientos.length} movimientos`;

    } catch (e) {
        console.error('Error generando informe:', e);
        status.textContent = 'Error generando el informe. Revisa la consola.';
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇ Generar Informe';
    }
}
