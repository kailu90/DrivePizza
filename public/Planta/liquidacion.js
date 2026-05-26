import { plantaDB } from '../Api/firebaseConfig.js';
import { collection, getDocs, query, where, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { getPeriodo, getNumeroPeriodo, toISO, pedidosLiquidables, devolucionesLiquidables } from '../Shared/semanas.js';

const db = plantaDB.db;

let offsetSemanas = 0;

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

function formatPeso(n) {
    return '$' + Math.round(n || 0).toLocaleString('es-CO');
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
        // Consultar pedidos y devoluciones en paralelo
        const [snapPedidos, snapDevoluciones] = await Promise.all([
            getDocs(query(
                collection(db, 'Planta', 'principal', 'PedidosPlanta'),
                where('deliveryDate', '>=', desde),
                where('deliveryDate', '<=', hasta),
                orderBy('deliveryDate', 'asc')
            )),
            getDocs(query(
                collection(db, 'Planta', 'principal', 'Movimientos'),
                where('tipo', '==', 'Devolución'),
                where('fecha', '>=', Timestamp.fromDate(desdeDate)),
                where('fecha', '<=', Timestamp.fromDate(hastaDate)),
                orderBy('fecha', 'asc')
            ))
        ]);

        if (snapPedidos.empty) {
            content.innerHTML = '<p class="inf-empty">Sin pedidos para esta semana.</p>';
            return;
        }

        // Agrupar pedidos por sede (normalizado a minúscula)
        const gruposPedidos = {};
        pedidosLiquidables(snapPedidos.docs.map(d => d.data())).forEach(p => {
            const sede = (p.user || 'Sin sede').toLowerCase();
            if (sede === 'planta producción') return;
            if (!gruposPedidos[sede]) gruposPedidos[sede] = [];
            gruposPedidos[sede].push(p);
        });

        // Agrupar devoluciones por sede (normalizado a minúscula)
        const gruposDev = {};
        snapDevoluciones.forEach(d => {
            const m = d.data();
            const sede = m.sede ? m.sede.toLowerCase() : null;
            if (!sede) return;
            if (!gruposDev[sede]) gruposDev[sede] = [];
            gruposDev[sede].push(m);
        });

        const sedes = Object.keys(gruposPedidos).sort();
        let totalGeneral = 0;

        const grid = document.createElement('div');
        grid.className = 'liq-grid';

        sedes.forEach(sede => {
            const pedidos     = gruposPedidos[sede];
            const devoluciones = devolucionesLiquidables(gruposDev[sede] || []);
            const subtotalPedidos = pedidos.reduce((s, p) => s + (p.total || 0), 0);
            const subtotalDev     = devoluciones.reduce((s, d) => s + (d.valorTotal || 0), 0);
            const totalSede       = subtotalPedidos - subtotalDev;
            totalGeneral += totalSede;

            // Filas de pedidos
            const rowsPedidos = pedidos.map(p => `
                <tr>
                    <td>#${p.idPedido ?? '—'}</td>
                    <td>${formatFecha(p.deliveryDate)}</td>
                    <td>${badgeEstado(p.status)}</td>
                    <td class="col-total">${formatPeso(p.total)}</td>
                </tr>
            `).join('');

            // Sección devoluciones
            const seccionDev = devoluciones.length > 0 ? `
                <tr class="liq-dev-header">
                    <td colspan="4">↩ Devoluciones</td>
                </tr>
                ${devoluciones.map(d => `
                    <tr class="liq-dev-row">
                        <td colspan="2">${d.productoNombre} × ${d.cantidad} ${d.unidadMedida || 'uds.'}</td>
                        <td class="col-precio">${d.precio ? formatPeso(d.precio) + '/u' : '—'}</td>
                        <td class="col-total liq-dev-valor">-${formatPeso(d.valorTotal)}</td>
                    </tr>
                `).join('')}
                <tr class="liq-dev-subtotal">
                    <td colspan="3">Subtotal devoluciones</td>
                    <td class="col-total">-${formatPeso(subtotalDev)}</td>
                </tr>
            ` : '';

            const card = document.createElement('div');
            card.className = 'liq-card';
            card.innerHTML = `
                <div class="liq-card__header">${sede}</div>
                <table class="liq-card__table">
                    <thead>
                        <tr>
                            <th>N°</th>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsPedidos}
                        ${seccionDev}
                    </tbody>
                </table>
                <div class="liq-card__footer">
                    <span class="liq-card__subtotal-label">${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}${devoluciones.length ? ` · ${devoluciones.length} devolución${devoluciones.length !== 1 ? 'es' : ''}` : ''}</span>
                    <span class="liq-card__subtotal-value">${formatPeso(totalSede)}</span>
                </div>
            `;
            grid.appendChild(card);
        });

        const totalBar = document.createElement('div');
        totalBar.className = 'liq-total-bar';
        totalBar.innerHTML = `
            <span>Total General — ${sedes.length} sede${sedes.length !== 1 ? 's' : ''}</span>
            <span>${formatPeso(totalGeneral)}</span>
        `;

        content.innerHTML = '';
        content.appendChild(grid);
        content.appendChild(totalBar);

    } catch (err) {
        console.error('Error cargando liquidación:', err);
        content.innerHTML = '<p class="inf-empty" style="color:red">Error al cargar el informe.</p>';
    }
}

// ── Auth + init ────────────────────────────────────────────────────────────
verificarAccesoPlanta(({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarSidebar(() => cargarInforme());
});

document.getElementById('liq-prev').addEventListener('click', () => { offsetSemanas--; cargarInforme(); });
document.getElementById('liq-next').addEventListener('click', () => { offsetSemanas++; cargarInforme(); });
document.getElementById('liq-print').addEventListener('click', () => window.print());
