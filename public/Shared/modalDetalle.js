import { badgeCanal } from './badges.js';

// ── Shared: modal detalle genérico ────────────────────────────────
// Usado por: pedidosPizzeria.js, pizzerias.js, reservas.js
// Pasar stepperHtml / cancelHtml / printHtml según contexto;
// omitirlos deja esas zonas vacías (modo solo lectura).

const fmtCOP = v => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(v ?? 0);

export function normalizarPedido(row) {
    return {
        id:               String(row.id),
        nPedido:          row.n_pedido,
        nombre:           row.nombre,
        telefono:         row.telefono,
        direccion:        row.direccion,
        sede:             row.sede,
        pago:             row.pago,
        obs:              row.obs,
        acompanamientos:  row.acompanamientos || null,
        productos:        row.productos || [],
        total:            row.total,
        asesor:           row.asesor,
        fecha:            row.fecha,
        estado:           row.estado,
        canal:            row.canal,
        domicilio:        row.domicilio || null,
        tipo:             row.tipo || null,
        tsRecibido:       row.ts_recibido,
        tsPreparacion:    row.ts_preparacion,
        tsDespachado:     row.ts_despachado,
        tsEntregado:      row.ts_entregado,
        cantidadPersonas:  row.cantidad_personas,
        fechaReserva:      row.fecha_reserva,
        horaReserva:       row.hora_reserva,
        impreso:           row.impreso           || false,
        motivoCancelacion: row.motivo_cancelacion || null,
    };
}

export function poblarModal(p, { stepperHtml = '', cancelHtml = '', printHtml = '' } = {}) {
    const esDomicilio = p.domicilio?.tipo !== 'recoger';
    const esReserva   = p.tipo === 'reserva';

    document.getElementById('modal-print-btn').innerHTML = printHtml;

    // Header
    document.getElementById('modal-npedido').textContent = esReserva
        ? `🗓 RESERVA #${p.nPedido ?? '—'}`
        : `#${p.nPedido}`;

    if (p.fecha) {
        const d         = new Date(p.fecha);
        const fechaPart = new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        const horaPart  = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
        document.getElementById('modal-fecha-header').innerHTML = `${fechaPart} <strong>${horaPart}</strong>`;
    } else {
        document.getElementById('modal-fecha-header').textContent = '';
    }

    // Cliente + meta
    document.getElementById('modal-cliente').textContent = p.nombre ?? '—';

    document.getElementById('modal-meta').innerHTML =
        `${p.telefono ?? '—'} &nbsp;·&nbsp; 🏬 ${p.sede ?? '—'} &nbsp;·&nbsp; 👤 ${p.asesor ?? '—'}` +
        (esReserva
            ? `<br><small>${badgeCanal(p.canal)}</small>`
            : `<br><small>Pago: ${p.pago ?? '—'} &nbsp;·&nbsp; ${badgeCanal(p.canal)}</small>`);

    // Entrega / info reserva
    if (esReserva) {
        document.getElementById('modal-entrega').innerHTML = '';
        document.getElementById('modal-productos-title').textContent = 'INFORMACIÓN RESERVA';
        const fechaFmt = p.fechaReserva ? p.fechaReserva.split('-').reverse().join('/') : '—';
        const hora12   = _hora12(p.horaReserva);
        document.getElementById('modal-productos').innerHTML = `
            <li class="reserva-dato">
                <span class="reserva-dato__label">📅 Fecha reserva</span>
                <span class="reserva-dato__valor">${fechaFmt}</span>
            </li>
            <li class="reserva-dato">
                <span class="reserva-dato__label">🕐 Hora reserva</span>
                <span class="reserva-dato__valor">${hora12}</span>
            </li>
            <li class="reserva-dato">
                <span class="reserva-dato__label">👥 Cantidad personas</span>
                <span class="reserva-dato__valor">${p.cantidadPersonas ?? '—'}</span>
            </li>`;
        document.getElementById('modal-totals-box').style.display = 'none';
        document.getElementById('modal-domicilio-row').style.display = 'none';
        document.getElementById('modal-total').textContent       = '';
        document.getElementById('modal-total-final').textContent = '';
    } else {
        document.getElementById('modal-entrega').innerHTML = esDomicilio
            ? `📍 ${p.direccion ?? ''}${p.domicilio?.barrio ? ` · ${p.domicilio.barrio}` : ''}`
            : `🏪 Recoge en tienda`;

        document.getElementById('modal-productos-title').textContent = 'Productos';
        document.getElementById('modal-productos').innerHTML =
            (p.productos || [])
            .slice()
            .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
            .map(prod => `<li><strong>${prod.qty || 1}×</strong> ${prod.nombre}${prod.obs ? ` <span style="color:#888;font-size:0.85em;">— ${prod.obs}</span>` : ''}</li>`)
            .join('');

        document.getElementById('modal-totals-box').style.display = '';
        document.getElementById('modal-total').textContent = fmtCOP(p.total);
        const domRow = document.getElementById('modal-domicilio-row');
        if (esDomicilio && p.domicilio?.valor) {
            domRow.style.display = 'flex';
            document.getElementById('modal-domicilio').textContent = fmtCOP(p.domicilio.valor);
        } else {
            domRow.style.display = 'none';
        }
        document.getElementById('modal-total-final').textContent =
            fmtCOP((p.total || 0) + (esDomicilio ? (p.domicilio?.valor || 0) : 0));
    }

    // Observaciones
    document.getElementById('modal-obs').innerHTML =
        (p.acompanamientos ? `<div class="mpedido-obs">🥗 <strong>Acompañamientos:</strong> ${p.acompanamientos}</div>` : '') +
        (p.obs ? `<div class="mpedido-obs">💬 ${p.obs}</div>` : '');

    // Zonas de acción (opcionales)
    document.getElementById('modal-stepper').innerHTML     = stepperHtml;
    document.getElementById('modal-cancel-area').innerHTML = cancelHtml;

    document.getElementById('modal-pedido').style.display = 'flex';
}

export function cerrarModal() {
    document.getElementById('modal-pedido').style.display = 'none';
}

// ── Helper interno ─────────────────────────────────────────────────
function _hora12(hora24) {
    if (!hora24) return '—';
    const [h, m] = hora24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
