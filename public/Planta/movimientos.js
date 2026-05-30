import { supabase } from '../Api/supabaseConfig.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { getProductos } from '../Shared/productosService.js';
import { colFechaToUTC } from '../Shared/semanas.js';

// ── Auth guard ─────────────────────────────────────────────────────────────
verificarAccesoPlanta(({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
});


// ── Normaliza fila Supabase al formato camelCase usado en todo el módulo ────
function normalizarMovimiento(row) {
    return {
        fecha:           row.fecha,
        tipo:            row.tipo,
        entidad:         row.entidad,
        productoNombre:  row.producto_nombre,
        cantidad:        row.cantidad,
        pedidoNumero:    row.pedido_numero,
        motivo:          row.motivo,
        usuario:         row.usuario,
        notas:           row.notas,
        referenciaId:    row.referencia_id,
        sede:            row.sede,
        precio:          row.precio,
        valorTotal:      row.valor_total,
        unidadMedida:    row.unidad_medida,
        proveedorNombre: row.proveedor_nombre,
        proveedorId:     row.proveedor_id,
        stockAnterior:   row.stock_anterior,
        stockNuevo:      row.stock_nuevo,
        diferencia:      row.diferencia,
        cambios:         row.cambios,
        productos:       row.productos,
        subtipo:         row.subtipo,
        // Campos de formato anterior (una sola modificación de campo)
        campo:           row.campo,
        valorAnterior:   row.valor_anterior,
        valorNuevo:      row.valor_nuevo,
    };
}

// ════════════════════════ UTILIDADES ════════════════════════════════════════

// ── Formato de nombre ──────────────────────────────────────────────────────
const EXCEPCIONES_TC = new Set(['x', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'con', 'sin', 'por']);
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map((w, i) =>
        (i === 0 || !EXCEPCIONES_TC.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
    ).join(' ');
}

// ── Helpers de fecha ───────────────────────────────────────────────────────
function toISO(date) {
    return date.toISOString().split('T')[0];
}

function inicioSemana() {
    const d = new Date();
    const day = d.getDay(); // 0=dom
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
}

function inicioMes() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ── Formato ────────────────────────────────────────────────────────────────
function formatFecha(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
        + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// ════════════════════════ TIPO Y BADGES ═════════════════════════════════════

// ── Tipo de visualización derivado ─────────────────────────────────────────
function getTipoDisplay(m) {
    if (m.tipo === 'MODIFICACION') {
        // Edición de pedido (cambios con tipoCambio)
        if (m.cambios?.length > 0 && m.cambios[0].tipoCambio) return 'Edición pedido';
        // Formato nuevo: array cambios de producto
        if (m.cambios?.length > 0) {
            if (m.cambios.length === 1 && m.cambios[0].campo === 'active') {
                return m.cambios[0].valorNuevo === 'true' ? 'Activación' : 'Desactivación';
            }
            return 'Modificación';
        }
        // Formato anterior: campo único
        if (!m.campo) return 'Modificación';
        if (m.campo === 'active') return m.valorNuevo === 'true' ? 'Activación' : 'Desactivación';
        if (m.campo === 'price')           return 'Cambio precio';
        if (m.campo === 'measurementUnit') return 'Cambio unidad';
        if (m.campo === 'quantities')      return 'Cambio cantidades';
        if (m.campo === 'name')            return 'Cambio nombre';
        if (m.campo === 'idCategory')      return 'Cambio categoría';
        return 'Modificación';
    }
    if (m.tipo === 'ENTRADA')     return 'Entrada';
    if (m.tipo === 'SALIDA')      return 'Salida';
    if (m.tipo === 'AJUSTE')      return 'Ajuste';
    if (m.tipo === 'CREACION')    return 'Creación';
    if (m.tipo === 'ELIMINACION') return 'Eliminación';
    return m.tipo;
}

const BADGE = {
    'Entrada':           'mv-badge--entrada',
    'Salida':            'mv-badge--salida',
    'Activación':        'mv-badge--toggle',
    'Desactivación':     'mv-badge--toggle',
    'Cambio precio':     'mv-badge--modificacion',
    'Cambio unidad':     'mv-badge--modificacion',
    'Cambio cantidades': 'mv-badge--modificacion',
    'Cambio nombre':     'mv-badge--modificacion',
    'Cambio categoría':  'mv-badge--modificacion',
    'Modificación':      'mv-badge--modificacion',
    'Edición pedido':    'mv-badge--modificacion',
    'Creación':          'mv-badge--creacion',
    'Eliminación':       'mv-badge--eliminacion',
    'Devolución':        'mv-badge--entrada',
    'Ajuste':            'mv-badge--ajuste',
};

const LABEL_CAMPO = {
    name:            'Nombre',
    price:           'Precio',
    measurementUnit: 'Unidad de medida',
    idCategory:      'Categoría',
    quantities:      'Presentaciones',
    active:          'Estado',
    stock:           'Stock',
    rotacion:        'Rotación',
};

// ════════════════════════ DESCRIPCIÓN DE MOVIMIENTOS ════════════════════════

function describeCambio(c) {
    const nombre = toTitleCase(c.productoNombre) || '—';
    if (c.tipoCambio === 'AGREGADO')  return `Se agregó ${nombre} ×${c.cantidad ?? '?'}`;
    if (c.tipoCambio === 'ELIMINADO') return `Se eliminó ${nombre}`;
    if (c.tipoCambio === 'CANTIDAD')  return `Cantidad ${nombre}: ${c.anterior ?? '?'} → ${c.nuevo ?? '?'}`;
    if (c.tipoCambio === 'FECHA')     return `Fecha de entrega: ${c.anterior ?? '?'} → ${c.nuevo ?? '?'}`;
    return nombre;
}

function buildDetalle(m) {
    switch (m.tipo) {

        case 'ENTRADA': {
            const unit = m.unidadMedida || 'unidades';
            const prov = m.proveedorNombre ? ` · Proveedor: ${m.proveedorNombre}` : '';
            return `Ingreso de ${m.cantidad} ${unit}${prov}`;
        }

        case 'Devolución': {
            const unit = m.unidadMedida || 'unidades';
            const nota = m.notas ? ` · ${m.notas}` : '';
            return `Devolución de ${m.cantidad} ${unit}${nota}`;
        }

        case 'SALIDA': {
            if (m.productos?.length > 0) {
                const ref = m.pedidoNumero ? `Pedido #${m.pedidoNumero}` : 'Salida de pedido';
                const items = m.productos.map(p => `${toTitleCase(p.productoNombre) || '?'} ×${p.cantidad ?? '?'}`).join(', ');
                return `${ref}: ${items}`;
            }
            const unit = m.unidadMedida || 'unidades';
            return `Salida de ${m.cantidad ?? '—'} ${unit}`;
        }

        case 'CREACION':
            if (m.entidad === 'Pedido') return 'Creación nuevo pedido';
            return `Nuevo producto · Stock inicial: ${m.cantidad ?? 0}`;

        case 'MODIFICACION': {
            if (m.cambios?.length > 0) {
                // Edición de pedido (tipoCambio)
                if (m.cambios[0].tipoCambio) {
                    return m.cambios.map(describeCambio).join(' | ');
                }
                // Cambios de campos de producto
                return m.cambios.map(c => {
                    const campo = c.campo || '';
                    const label = LABEL_CAMPO[campo] || campo || '?';
                    if (campo === 'active') return c.valorNuevo === 'true' ? 'Producto activado' : 'Producto desactivado';
                    if (campo === 'price')  return `Precio: $${c.valorAnterior ?? '?'} → $${c.valorNuevo ?? '?'}`;
                    if (!campo) return c.valorNuevo ?? '—';
                    return `${label}: "${c.valorAnterior ?? ''}" → "${c.valorNuevo ?? ''}"`;
                }).join(' | ');
            }
            // Formato anterior: campo único
            const campo = m.campo || '';
            if (!campo) return m.motivo || m.notas || '—';
            if (campo === 'active') return m.valorNuevo === 'true' ? 'Producto activado' : 'Producto desactivado';
            const label = LABEL_CAMPO[campo] || campo;
            if (campo === 'price') return `Cambio de precio: $${m.valorAnterior} → $${m.valorNuevo}`;
            if (campo === 'measurementUnit') return `Cambio de unidad de medida: ${m.valorAnterior} → ${m.valorNuevo}`;
            if (campo === 'name') return `Cambio de nombre: "${m.valorAnterior}" → "${m.valorNuevo}"`;
            return `${label}: "${m.valorAnterior}" → "${m.valorNuevo}"`;
        }

        case 'AJUSTE': {
            const dif = m.diferencia ?? 0;
            const signo = dif >= 0 ? `+${dif}` : `${dif}`;
            const nota = m.notas ? ` · ${m.notas}` : '';
            return `${m.stockAnterior ?? '—'} → ${m.stockNuevo ?? '—'} (${signo}) · ${m.motivo ?? '—'}${nota}`;
        }

        case 'ELIMINACION':
            if (m.entidad === 'Pedido' && m.productos?.length > 0) {
                const items = m.productos.map(p => `${toTitleCase(p.productoNombre)} ×${p.cantidad}`).join(', ');
                return `Pedido #${m.pedidoNumero ?? '—'}: ${items}`;
            }
            if (m.entidad === 'Pedido') return `Pedido eliminado manualmente`;
            return `Producto eliminado`;

        default:
            return m.notas || m.motivo || '—';
    }
}

// ── Descripción de un ítem individual ─────────────────────────────────────
function describeCampoProducto(c) {
    const campo = c.campo || '';
    if (campo === 'active') return c.valorNuevo === 'true' ? 'Producto activado' : 'Producto desactivado';
    if (campo === 'price')  return `Precio: $${c.valorAnterior ?? '?'} → $${c.valorNuevo ?? '?'}`;
    if (!campo) return c.valorNuevo ?? '—';
    const label = LABEL_CAMPO[campo] || campo;
    return `${label}: "${c.valorAnterior ?? ''}" → "${c.valorNuevo ?? ''}"`;
}

function describirItem(m, item) {
    if (m.tipo === 'MODIFICACION') {
        return item.tipoCambio ? describeCambio(item) : describeCampoProducto(item);
    }
    if (m.tipo === 'SALIDA' || m.tipo === 'ELIMINACION' || m.tipo === 'CREACION') {
        return `${toTitleCase(item.productoNombre) || '?'} ×${item.cantidad ?? '?'}`;
    }
    return '—';
}

// ── Resumen cuando hay múltiples ítems ─────────────────────────────────────
function resumirItems(m, n) {
    if (m.tipo === 'SALIDA' || m.tipo === 'ELIMINACION' || m.tipo === 'CREACION') {
        const ref = m.pedidoNumero ? ` · Pedido #${m.pedidoNumero}` : '';
        return `${n} producto${n !== 1 ? 's' : ''}${ref}`;
    }
    if (m.tipo === 'MODIFICACION') {
        return m.cambios[0].tipoCambio
            ? `${n} cambio${n !== 1 ? 's' : ''} en pedido`
            : `${n} campo${n !== 1 ? 's' : ''} modificado${n !== 1 ? 's' : ''}`;
    }
    return `${n} cambios`;
}

// ── Celda detalle: regla general 1 ítem → directo | 2+ → resumen + Ver ─────
function buildDetalleCelda(m, idx) {
    if (m.tipo === 'Devolución' && m.notas) {
        return `<span>${m.cantidad} ${m.unidadMedida || 'uds.'}</span>
                <button class="mv-btn-ver" data-idx="${idx}">Ver</button>`;
    }

    const items =
        (m.tipo === 'MODIFICACION'  && m.cambios?.length > 0)                                  ? m.cambios :
        (m.tipo === 'SALIDA'        && m.productos?.length > 0)                                ? m.productos :
        (m.tipo === 'ELIMINACION'   && m.productos?.length > 0)                                ? m.productos :
        (m.tipo === 'CREACION' && m.entidad === 'Pedido' && m.productos?.length > 0)           ? m.productos :
        null;

    if (!items) return buildDetalle(m);

    if (items.length === 1) return describirItem(m, items[0]);

    return `<span>${resumirItems(m, items.length)}</span>
            <button class="mv-btn-ver" data-idx="${idx}">Ver</button>`;
}

// ════════════════════════ MODAL DE DETALLE ══════════════════════════════════

// ── Modal de detalle ───────────────────────────────────────────────────────
function abrirModalDetalle(m) {
    const modal  = document.getElementById('mv-det');
    const titulo = document.getElementById('mv-det-titulo');
    const lista  = document.getElementById('mv-det-lista');
    lista.innerHTML = '';

    document.getElementById('mv-det-tipo').textContent   = getTipoDisplay(m);
    document.getElementById('mv-det-asesor').textContent = m.usuario || '—';

    if (m.tipo === 'MODIFICACION' && m.cambios?.length > 0 && m.cambios[0].tipoCambio) {
        // Edición de pedido
        titulo.textContent = toTitleCase(m.productoNombre) || 'Edición de pedido';
        m.cambios.forEach(c => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            const nombre = toTitleCase(c.productoNombre);
            if (c.tipoCambio === 'AGREGADO') {
                li.innerHTML = `<span class="mv-det-campo mv-det-campo--agregado">Agregado</span>
                                <span class="mv-det-valor">${nombre} ×${c.cantidad}</span>`;
            } else if (c.tipoCambio === 'ELIMINADO') {
                li.innerHTML = `<span class="mv-det-campo mv-det-campo--eliminado">Eliminado</span>
                                <span class="mv-det-valor">${nombre}</span>`;
            } else if (c.tipoCambio === 'CANTIDAD') {
                li.innerHTML = `<span class="mv-det-campo">${nombre}</span>
                                <span class="mv-det-valor">${c.anterior} → ${c.nuevo}</span>`;
            } else if (c.tipoCambio === 'FECHA') {
                li.innerHTML = `<span class="mv-det-campo">Fecha de entrega</span>
                                <span class="mv-det-valor">${c.anterior ?? '?'} → ${c.nuevo ?? '?'}</span>`;
            }
            lista.appendChild(li);
        });
    } else if (m.tipo === 'MODIFICACION' && m.cambios?.length > 0) {
        titulo.textContent = `Modificación · ${toTitleCase(m.productoNombre) || '—'}`;
        m.cambios.forEach(c => {
            const label = LABEL_CAMPO[c.campo] || c.campo;
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${label}</span>
                            <span class="mv-det-valor">${c.valorAnterior} → ${c.valorNuevo}</span>`;
            lista.appendChild(li);
        });
    } else if (m.tipo === 'AJUSTE') {
        titulo.textContent = toTitleCase(m.productoNombre) || 'Ajuste de inventario';
        const signo = m.diferencia >= 0 ? `+${m.diferencia}` : `${m.diferencia}`;
        [
            ['Stock anterior', m.stockAnterior],
            ['Stock nuevo',    m.stockNuevo],
            ['Diferencia',     signo],
            ['Motivo',         m.motivo],
            m.notas ? ['Notas', m.notas] : null,
        ].filter(Boolean).forEach(([campo, valor]) => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${campo}</span>
                            <span class="mv-det-valor">${valor}</span>`;
            lista.appendChild(li);
        });
    } else if (m.tipo === 'Devolución') {
        titulo.textContent = toTitleCase(m.productoNombre) || 'Devolución';
        const unit = m.unidadMedida || 'unidades';
        [
            ['Cantidad', `${m.cantidad} ${unit}`],
            m.sede  ? ['Sede',  m.sede]  : null,
            m.notas ? ['Notas', m.notas] : null,
        ].filter(Boolean).forEach(([campo, valor]) => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${campo}</span>
                            <span class="mv-det-valor">${valor}</span>`;
            lista.appendChild(li);
        });
    } else if (m.tipo === 'SALIDA' && m.productos?.length > 0) {
        titulo.textContent = m.pedidoNumero ? `Pedido #${m.pedidoNumero}` : 'Salida de pedido';
        m.productos.forEach(p => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${toTitleCase(p.productoNombre)}</span>
                            <span class="mv-det-valor">×${p.cantidad}</span>`;
            lista.appendChild(li);
        });
    } else if (m.tipo === 'ELIMINACION' && m.productos?.length > 0) {
        titulo.textContent = m.pedidoNumero ? `Pedido #${m.pedidoNumero}` : 'Pedido eliminado';
        m.productos.forEach(p => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${toTitleCase(p.productoNombre)}</span>
                            <span class="mv-det-valor">×${p.cantidad}</span>`;
            lista.appendChild(li);
        });
    } else if (m.tipo === 'CREACION' && m.entidad === 'Pedido' && m.productos?.length > 0) {
        titulo.textContent = m.pedidoNumero ? `Pedido #${m.pedidoNumero}` : 'Nuevo pedido';
        m.productos.forEach(p => {
            const li = document.createElement('li');
            li.className = 'mv-det-item';
            li.innerHTML = `<span class="mv-det-campo">${toTitleCase(p.productoNombre)}</span>
                            <span class="mv-det-valor">×${p.cantidad}</span>`;
            lista.appendChild(li);
        });
    }

    modal.showModal();
}

// ════════════════════════ ESTADO, DATOS Y RENDER ════════════════════════════

// ── Estado ─────────────────────────────────────────────────────────────────
let allMovimientos = [];
let currentPageData = [];
const POR_PAGINA = 50;
let paginaActual = 1;

// ── DOM ────────────────────────────────────────────────────────────────────
const tbody       = document.getElementById('mv-tbody');
const countEl     = document.getElementById('mv-count');
const pagination  = document.getElementById('mv-pagination');
const searchEl    = document.getElementById('mv-search');
const tipoEl      = document.getElementById('mv-tipo');
const desdeEl     = document.getElementById('mv-desde');
const hastaEl     = document.getElementById('mv-hasta');
const productoInput = document.getElementById('mv-producto-input');
const productoList  = document.getElementById('mv-producto-list');

// ── Poblar datalist de productos ───────────────────────────────────────────
let _productosMap = {}; // nombre → id

getProductos().then(productos => {
    productos
        .filter(p => p.active !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
        .forEach(p => {
            _productosMap[p.name] = p.id;
            const opt = document.createElement('option');
            opt.value = p.name;
            productoList.appendChild(opt);
        });
}).catch(console.error);

// Resuelve el productoId a partir del nombre escrito
function getProductoId() {
    return _productosMap[productoInput.value.trim()] || '';
}

// ── Cargar datos ───────────────────────────────────────────────────────────
async function cargarMovimientos() {
    tbody.innerHTML = '<tr><td colspan="6" class="mv-loading">Cargando...</td></tr>';
    document.getElementById('mv-btn-resumen').style.display = 'none';

    const productoId    = getProductoId();
    const productoNombre = productoInput.value.trim();
    const desde = desdeEl.value;
    const hasta = hastaEl.value;

    try {
        let query = supabase
            .from('movimientos')
            .select('*')
            .order('fecha', { ascending: false });

        if (desde) query = query.gte('fecha', colFechaToUTC(desde, 'inicio'));
        if (hasta) query = query.lte('fecha', colFechaToUTC(hasta, 'fin'));

        // Filtra por nombre exacto (case-insensitive) cuando el usuario eligió un producto del datalist
        if (productoId && productoNombre) {
            query = query.ilike('producto_nombre', productoNombre);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        allMovimientos = (rows || []).map(normalizarMovimiento);

        // Resumen de salidas por día: solo cuando hay producto exacto + rango de fechas
        if (productoId && desde && hasta) {
            renderResumen(allMovimientos);
        }

        paginaActual = 1;
        renderMovimientos();
    } catch (err) {
        console.error('Error al cargar movimientos:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="mv-loading" style="color:red">Error al cargar movimientos.</td></tr>`;
    }
}

// ── Resumen por día ────────────────────────────────────────────────────────
let _resumenRows = [];

function renderResumen(rows) {
    _resumenRows = rows;
    const btnResumen = document.getElementById('mv-btn-resumen');
    btnResumen.style.display = rows.length ? '' : 'none';
}

function abrirModalResumen() {
    const rows      = _resumenRows;
    const tbodyR    = document.getElementById('mv-resumen-tbody');
    const totalFila = document.getElementById('mv-resumen-total');
    const titulo    = document.getElementById('mv-resumen-titulo');
    const modal     = document.getElementById('mv-modal-resumen');

    const nombreProducto = productoInput.value.trim();
    const desde = desdeEl.value || '—';
    const hasta = hastaEl.value || '—';
    titulo.textContent = `${nombreProducto} · ${desde} → ${hasta}`;

    // Agrupar salidas por día
    const porDia = {};
    rows.forEach(r => {
        if (r.tipo?.toUpperCase() !== 'SALIDA') return;
        const dia = r.fecha ? r.fecha.substring(0, 10) : '—';
        if (!porDia[dia]) porDia[dia] = 0;
        porDia[dia] += r.cantidad || 0;
    });

    const dias = Object.keys(porDia).sort((a, b) => b.localeCompare(a));
    tbodyR.innerHTML = '';
    let totalSalidas = 0;

    dias.forEach(dia => {
        const salidas = porDia[dia];
        totalSalidas += salidas;
        const d = new Date(dia + 'T12:00:00Z');
        const fechaFmt = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="mv-cell">${fechaFmt}</td>
            <td class="mv-cell col-right">${salidas}</td>
        `;
        tbodyR.appendChild(tr);
    });

    totalFila.innerHTML = `
        <td class="mv-cell"><strong>TOTAL</strong></td>
        <td class="mv-cell col-right"><strong>${totalSalidas}</strong></td>
    `;

    modal.showModal();
}

// ── Filtrar en memoria (búsqueda + tipo) ───────────────────────────────────
function getFiltrados() {
    const term = searchEl.value.trim().toLowerCase();
    const tipo = tipoEl.value;

    return allMovimientos.filter(m => {
        if (tipo && getTipoDisplay(m) !== tipo) return false;
        if (term && !(m.productoNombre || '').toLowerCase().includes(term)) return false;
        return true;
    });
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderMovimientos() {
    const filtrados = getFiltrados();
    const total     = filtrados.length;
    const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (paginaActual > totalPags) paginaActual = totalPags;

    const inicio = (paginaActual - 1) * POR_PAGINA;
    const pagina = filtrados.slice(inicio, inicio + POR_PAGINA);

    countEl.textContent = `${total} registro${total !== 1 ? 's' : ''}`;

    if (pagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="mv-loading">Sin movimientos para el rango seleccionado.</td></tr>';
        pagination.innerHTML = '';
        return;
    }

    tbody.innerHTML = '';
    currentPageData = pagina;
    pagina.forEach((m, i) => {
        const tipoDisplay = getTipoDisplay(m);
        const badgeClass  = BADGE[tipoDisplay] || '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="mv-cell">${formatFecha(m.fecha)}</td>
            <td class="mv-cell"><span class="mv-badge ${badgeClass}">${tipoDisplay}</span></td>
            <td class="mv-cell">${toTitleCase(m.productoNombre) || '—'}</td>
            <td class="mv-cell mv-cell--detalle" title="${buildDetalle(m)}">${buildDetalleCelda(m, i)}</td>
            <td class="mv-cell">${m.usuario || '—'}</td>
        `;
        tbody.appendChild(tr);
    });

    renderPaginacion(totalPags);
}

// ── Paginación ─────────────────────────────────────────────────────────────
function renderPaginacion(totalPags) {
    pagination.innerHTML = '';
    if (totalPags <= 1) return;

    const agregar = (label, pagina, disabled = false, activo = false) => {
        const btn = document.createElement('button');
        btn.className = 'mv-page-btn' + (activo ? ' active' : '');
        btn.textContent = label;
        btn.disabled = disabled;
        btn.addEventListener('click', () => {
            paginaActual = pagina;
            renderMovimientos();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        pagination.appendChild(btn);
    };

    agregar('‹', paginaActual - 1, paginaActual === 1);

    // Mostrar máximo 7 páginas con elipsis
    const rango = [];
    for (let i = 1; i <= totalPags; i++) {
        if (i === 1 || i === totalPags || (i >= paginaActual - 2 && i <= paginaActual + 2)) {
            rango.push(i);
        }
    }
    let prev = 0;
    rango.forEach(i => {
        if (prev && i - prev > 1) {
            const dots = document.createElement('span');
            dots.textContent = '…';
            dots.style.cssText = 'padding:0.5rem 0.6rem;font-size:1.3rem;color:#888';
            pagination.appendChild(dots);
        }
        agregar(i, i, false, i === paginaActual);
        prev = i;
    });

    agregar('›', paginaActual + 1, paginaActual === totalPags);
}

// ════════════════════════ EVENTOS ═══════════════════════════════════════════

// ── Botones rápidos ────────────────────────────────────────────────────────
function setQuickActive(id) {
    ['mv-btn-hoy', 'mv-btn-semana', 'mv-btn-mes'].forEach(btnId => {
        document.getElementById(btnId)?.classList.toggle('active', btnId === id);
    });
}

document.getElementById('mv-btn-hoy').addEventListener('click', () => {
    const hoy = toISO(new Date());
    desdeEl.value = hoy;
    hastaEl.value = hoy;
    setQuickActive('mv-btn-hoy');
    cargarMovimientos();
});

document.getElementById('mv-btn-semana').addEventListener('click', () => {
    desdeEl.value = toISO(inicioSemana());
    hastaEl.value = toISO(new Date());
    setQuickActive('mv-btn-semana');
    cargarMovimientos();
});

document.getElementById('mv-btn-mes').addEventListener('click', () => {
    desdeEl.value = toISO(inicioMes());
    hastaEl.value = toISO(new Date());
    setQuickActive('mv-btn-mes');
    cargarMovimientos();
});

// Filtros de fecha manual y producto: recargar
desdeEl.addEventListener('change',    () => { setQuickActive(null); cargarMovimientos(); });
hastaEl.addEventListener('change',    () => { setQuickActive(null); cargarMovimientos(); });
productoInput.addEventListener('change', () => { setQuickActive(null); cargarMovimientos(); });

// Filtros en memoria: no requieren recarga
searchEl.addEventListener('input', () => { paginaActual = 1; renderMovimientos(); });
tipoEl.addEventListener('change',  () => { paginaActual = 1; renderMovimientos(); });

// ── Botón "Ver detalle" (delegación) ───────────────────────────────────────
tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.mv-btn-ver');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    if (!isNaN(idx) && currentPageData[idx]) abrirModalDetalle(currentPageData[idx]);
});

// ── Cerrar modal de detalle ────────────────────────────────────────────────
document.getElementById('mv-det-cerrar')?.addEventListener('click', () => {
    document.getElementById('mv-det').close();
});
document.getElementById('mv-det')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('mv-det')) document.getElementById('mv-det').close();
});

// ── Exportar Excel ─────────────────────────────────────────────────────────
function exportarExcel() {
    const filtrados = getFiltrados();
    if (!filtrados.length) {
        alert('No hay movimientos para exportar.');
        return;
    }

    const filas = [];

    filtrados.forEach(m => {
        const fecha   = formatFecha(m.fecha);
        const tipo    = getTipoDisplay(m);
        const usuario = m.usuario || '—';

        // SALIDA o ELIMINACION con lista de productos → una fila por producto
        if ((m.tipo === 'SALIDA' || m.tipo === 'ELIMINACION') && m.productos?.length > 0) {
            m.productos.forEach(p => {
                filas.push({
                    'Fecha':      fecha,
                    'Tipo':       tipo,
                    'Producto':   toTitleCase(p.productoNombre),
                    'Cantidad':   p.cantidad,
                    'Unidad':     '',
                    'N° Pedido':  m.pedidoNumero || '',
                    'Proveedor':  '',
                    'Detalle':    '',
                    'Usuario':    usuario,
                });
            });
            return;
        }

        // AJUSTE → cantidad = diferencia con signo
        if (m.tipo === 'AJUSTE') {
            const signo = m.diferencia >= 0 ? `+${m.diferencia}` : `${m.diferencia}`;
            filas.push({
                'Fecha':      fecha,
                'Tipo':       tipo,
                'Producto':   toTitleCase(m.productoNombre) || '—',
                'Cantidad':   signo,
                'Unidad':     '',
                'N° Pedido':  '',
                'Proveedor':  '',
                'Detalle':    `${m.stockAnterior} → ${m.stockNuevo} · ${m.motivo || ''}${m.notas ? ' · ' + m.notas : ''}`,
                'Usuario':    usuario,
            });
            return;
        }

        // Resto de tipos → una sola fila
        filas.push({
            'Fecha':      fecha,
            'Tipo':       tipo,
            'Producto':   toTitleCase(m.productoNombre) || '—',
            'Cantidad':   m.cantidad ?? '',
            'Unidad':     m.unidadMedida || '',
            'N° Pedido':  m.pedidoNumero || '',
            'Proveedor':  m.proveedorNombre || '',
            'Detalle':    buildDetalle(m),
            'Usuario':    usuario,
        });
    });

    const ws = window.XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [
        { wch: 18 }, // Fecha
        { wch: 16 }, // Tipo
        { wch: 30 }, // Producto
        { wch: 10 }, // Cantidad
        { wch: 14 }, // Unidad
        { wch: 12 }, // N° Pedido
        { wch: 24 }, // Proveedor
        { wch: 55 }, // Detalle
        { wch: 15 }, // Usuario
    ];

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

    const desde = desdeEl.value || 'inicio';
    const hasta = hastaEl.value || 'hoy';
    window.XLSX.writeFile(wb, `movimientos_${desde}_${hasta}.xlsx`);
}

document.getElementById('mv-btn-export').addEventListener('click', exportarExcel);

// ── Modal resumen ───────────────────────────────────────────────────────────
document.getElementById('mv-btn-resumen').addEventListener('click', abrirModalResumen);
document.getElementById('mv-resumen-cerrar').addEventListener('click', () => {
    document.getElementById('mv-modal-resumen').close();
});
document.getElementById('mv-modal-resumen').addEventListener('click', (e) => {
    if (e.target === document.getElementById('mv-modal-resumen'))
        document.getElementById('mv-modal-resumen').close();
});

// ── Carga inicial: hoy ─────────────────────────────────────────────────────
const hoy = toISO(new Date());
desdeEl.value = hoy;
hastaEl.value = hoy;
cargarMovimientos();
