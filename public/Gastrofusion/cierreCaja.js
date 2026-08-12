import { supabase }      from '../Api/supabaseConfig.js';
import { colFechaToUTC } from '../Shared/semanas.js';
import { revelarSplash } from '../Shared/components.js';

function hoyEnColombia() {
    const col = new Date(Date.now() - 5 * 60 * 60 * 1000);
    return col.toISOString().slice(0, 10);
}

function formatCOP(n) {
    return '$' + Math.round(n).toLocaleString('es-CO');
}

function fechaLarga(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

function setEstado(msg) {
    document.getElementById('estado').textContent = msg;
}

let _username = '';

;(async () => {
    // ── Auth ──────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '../index.html'; return; }

    const { data: perfil } = await supabase
        .from('usuarios').select('rol, username').eq('id', user.id).single();

    if (!perfil || !['gastrofusion', 'admin'].includes(perfil.rol)) {
        await supabase.auth.signOut();
        window.location.href = '../index.html';
        return;
    }

    _username = perfil.username;
    document.body.classList.add('loaded');
    revelarSplash();

    // ── Date picker ───────────────────────────────────────────────────────
    const datePicker = document.getElementById('fecha-cierre');
    datePicker.value = hoyEnColombia();
    datePicker.addEventListener('change', () => cargarCierre(datePicker.value));

    await cargarCierre(datePicker.value);
})();

async function cargarCierre(fecha) {
    setEstado('Cargando...');
    document.getElementById('resultado').innerHTML = '';

    const { data: pedidos, error } = await supabase
        .from('pedidos_callcenter')
        .select('pago, estado, total')
        .eq('canal', 'gastrofusion')
        .eq('sede', 'gastrofusion')
        .gte('fecha', colFechaToUTC(fecha, 'inicio'))
        .lte('fecha', colFechaToUTC(fecha, 'fin'))
        .range(0, 999);

    if (error) { setEstado('Error al cargar pedidos: ' + error.message); return; }
    if (!pedidos.length) { setEstado(`Sin pedidos para ${fechaLarga(fecha)}.`); return; }

    renderTabla(pedidos, fecha);
}

function renderTabla(pedidos, fecha) {
    const cancelados = pedidos.filter(p => p.estado === 'cancelado');
    const activos    = pedidos.filter(p => p.estado !== 'cancelado');
    const totalNeto  = activos.reduce((s, p) => s + (p.total || 0), 0);
    const totalCanc  = cancelados.reduce((s, p) => s + (p.total || 0), 0);

    const metodos = {};
    for (const p of activos) {
        const k = p.pago || 'Sin definir';
        if (!metodos[k]) metodos[k] = { cantidad: 0, total: 0 };
        metodos[k].cantidad++;
        metodos[k].total += p.total || 0;
    }

    const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    let filasPago = '';
    for (const [pago, d] of Object.entries(metodos)) {
        filasPago += `<tr>
            <td>${pago}</td>
            <td class="num">${d.cantidad}</td>
            <td class="num">${formatCOP(d.total)}</td>
        </tr>`;
    }

    const filaCanc = cancelados.length > 0 ? `
        <tr class="fila-sep"><td colspan="3">Cancelados</td></tr>
        <tr class="fila-cancelado">
            <td>Pedidos cancelados</td>
            <td class="num">${cancelados.length}</td>
            <td class="num">${formatCOP(totalCanc)}</td>
        </tr>` : '';

    document.getElementById('resultado').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th colspan="3" style="text-align:center;font-size:1.1rem;">CIERRE DE CAJA</th>
                </tr>
                <tr>
                    <th colspan="3" style="text-align:center;font-size:1rem;">GASTROFUSIÓN 2026</th>
                </tr>
                <tr>
                    <th colspan="3" style="text-align:center;font-size:0.85rem;font-weight:400;text-transform:capitalize;">${fechaLarga(fecha)}</th>
                </tr>
                <tr>
                    <th>Concepto</th>
                    <th class="num">Pedidos</th>
                    <th class="num">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr class="fila-sep"><td colspan="3">Desglose por método de pago</td></tr>
                ${filasPago}
                <tr class="fila-total">
                    <td>Total neto</td>
                    <td class="num">${activos.length}</td>
                    <td class="num">${formatCOP(totalNeto)}</td>
                </tr>
                ${filaCanc}
                <tr class="fila-sep"><td colspan="3"></td></tr>
                <tr>
                    <td>Total pedidos</td>
                    <td class="num">${pedidos.length}</td>
                    <td class="num"></td>
                </tr>
                <tr>
                    <td>Ticket promedio</td>
                    <td class="num"></td>
                    <td class="num">${activos.length ? formatCOP(totalNeto / activos.length) : '—'}</td>
                </tr>
            </tbody>
            <tfoot>
                <tr><td colspan="3" style="font-size:0.8rem;color:#aaa;padding-top:12px;">
                    Generado: ${hora} &nbsp;·&nbsp; ${_username}
                </td></tr>
            </tfoot>
        </table>
    `;

    setEstado('');
}
