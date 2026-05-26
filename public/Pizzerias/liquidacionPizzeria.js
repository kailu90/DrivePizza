import { plantaDB } from '../Api/firebaseConfig.js';
import { doc, getDoc, collection, getDocs, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { CargarHeader } from '../Shared/components.js';
import { getPeriodo, getNumeroPeriodo, toISO, pedidosLiquidables, devolucionesLiquidables } from '../Shared/semanas.js';

const db   = plantaDB.db;
const auth = plantaDB.auth;

let sedeUsuario   = null;
let offsetSemanas = 0;

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatLabel(desde, hasta) {
    const semana = getNumeroPeriodo(desde);
    const dL = desde.getDate(), mL = MESES[desde.getMonth()];
    const dD = hasta.getDate(), mD = MESES[hasta.getMonth()];
    return `Semana #${semana} del ${dL} de ${mL} - ${dD} de ${mD} ${hasta.getFullYear()}`;
}

function formatFecha(isoStr) {
    if (!isoStr) return '—';
    const [y, m, d] = isoStr.split('-');
    return `${d}/${m}/${y}`;
}

function badgeEstado(status) {
    const map = {
        pendiente: 'liq-estado--pendiente',
        entregado: 'liq-estado--entregado',
        pagado:    'liq-estado--pagado',
        cancelado: 'liq-estado--cancelado',
    };
    return `<span class="liq-estado ${map[status] || ''}">${status || '—'}</span>`;
}

// ── Cargar y renderizar ────────────────────────────────────────────────────
async function cargarInforme() {
    const content = document.getElementById('liq-content');
    content.innerHTML = '<p class="inf-empty">Cargando...</p>';

    const { desde: desdeDate, hasta: hastaDate } = getPeriodo(offsetSemanas);
    const desde = toISO(desdeDate);
    const hasta = toISO(hastaDate);

    document.getElementById('liq-semana-label').textContent = formatLabel(desdeDate, hastaDate);

    try {
        const [snapPedidos, snapDev] = await Promise.all([
            getDocs(query(
                collection(db, 'Planta', 'principal', 'PedidosPlanta'),
                where('user', '==', sedeUsuario),
                where('deliveryDate', '>=', desde),
                where('deliveryDate', '<=', hasta),
                orderBy('deliveryDate', 'asc')
            )),
            getDocs(query(
                collection(db, 'Planta', 'principal', 'Movimientos'),
                where('tipo', '==', 'Devolución'),
                where('sede', '==', sedeUsuario),
                where('fecha', '>=', Timestamp.fromDate(desdeDate)),
                where('fecha', '<=', Timestamp.fromDate(hastaDate)),
                orderBy('fecha', 'asc')
            ))
        ]);

        if (snapPedidos.empty) {
            content.innerHTML = '<p class="inf-empty">Sin pedidos para esta semana.</p>';
            return;
        }

        const pedidos      = pedidosLiquidables(snapPedidos.docs.map(d => d.data()));
        const devoluciones = devolucionesLiquidables(snapDev.docs.map(d => d.data()));

        const subtotalPedidos = pedidos.reduce((s, p) => s + (p.total || 0), 0);
        const subtotalDev     = devoluciones.reduce((s, d) => s + (d.valorTotal || 0), 0);
        const total           = subtotalPedidos - subtotalDev;

        const filasPedidos = pedidos.map(p => `
            <tr>
                <td>#${p.idPedido ?? '—'}</td>
                <td>${formatFecha(p.deliveryDate)}</td>
                <td>${badgeEstado(p.status)}</td>
                <td class="col-total">${fmtCOP.format(p.total || 0)}</td>
            </tr>
        `).join('');

        const seccionDev = devoluciones.length > 0 ? `
            <tr class="liq-dev-header">
                <td colspan="4">↩ Devoluciones</td>
            </tr>
            ${devoluciones.map(d => `
                <tr class="liq-dev-row">
                    <td colspan="2">${d.productoNombre} × ${d.cantidad} ${d.unidadMedida || 'uds.'}</td>
                    <td class="col-precio">${d.precio ? fmtCOP.format(d.precio) + '/u' : '—'}</td>
                    <td class="col-total liq-dev-valor">-${fmtCOP.format(d.valorTotal)}</td>
                </tr>
            `).join('')}
            <tr class="liq-dev-subtotal">
                <td colspan="3">Subtotal devoluciones</td>
                <td class="col-total">-${fmtCOP.format(subtotalDev)}</td>
            </tr>
        ` : '';

        const labelCount = `${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}${devoluciones.length ? ` · ${devoluciones.length} devolución${devoluciones.length !== 1 ? 'es' : ''}` : ''}`;

        const card = document.createElement('div');
        card.className = 'liq-card';
        card.innerHTML = `
            <div class="liq-card__header">${sedeUsuario}</div>
            <table class="liq-card__table">
                <thead>
                    <tr>
                        <th>N°</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>${filasPedidos}${seccionDev}</tbody>
            </table>
            <div class="liq-card__footer">
                <span class="liq-card__subtotal-label">${labelCount}</span>
                <span class="liq-card__subtotal-value">${fmtCOP.format(total)}</span>
            </div>
        `;

        content.innerHTML = '';
        content.appendChild(card);

    } catch (err) {
        console.error(err);
        content.innerHTML = '<p class="inf-empty" style="color:red">Error al cargar el informe.</p>';
    }
}

// ── Auth + init ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.top.location.href = '../index.html'; return; }

    const snap = await getDoc(doc(db, 'Usuarios', user.uid));
    if (!snap.exists()) { window.top.location.href = '../index.html'; return; }

    const { sede, rol, active } = snap.data();
    if (!active || !['pizzeria', 'planta', 'admin'].includes(rol)) {
        window.top.location.href = '../index.html';
        return;
    }

    sedeUsuario = sede.toLowerCase();
    CargarHeader(sedeUsuario, './pizzerias.html');
    await cargarInforme();
    document.body.classList.add('loaded');

    document.getElementById('liq-prev').addEventListener('click', () => { offsetSemanas--; cargarInforme(); });
    document.getElementById('liq-next').addEventListener('click', () => { offsetSemanas++; cargarInforme(); });
    document.getElementById('liq-print').addEventListener('click', () => window.print());
});
