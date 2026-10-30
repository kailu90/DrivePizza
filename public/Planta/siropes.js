import { supabase }                                         from '../Api/supabaseConfig.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta }                            from '../Auth/plantaAuth.js';
import { getSedes }                                         from '../Shared/sedesService.js';

// ── Estado ────────────────────────────────────────────────────────────────────
let _siropesData       = [];
let _filtroEstado      = 'pendiente';
let _filtroSede        = '';

const fmtFecha = iso => iso
    ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

// ── Auth ──────────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarFooter();
    CargarSidebar();
    await _poblarSedes();
    cargarSiropes();
});

// ── Poblar filtro de sedes ────────────────────────────────────────────────────
async function _poblarSedes() {
    const sel = document.getElementById('siropes-filtro-sede');
    if (!sel) return;
    const sedes = await getSedes();
    sedes.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name.toLowerCase();
        opt.textContent = s.name;
        sel.appendChild(opt);
    });
}

// ── Cargar y renderizar ───────────────────────────────────────────────────────
async function cargarSiropes() {
    const tbody = document.getElementById('siropes-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#888;">Cargando...</td></tr>`;

    let query = supabase
        .from('entregas_siropes')
        .select('*')
        .order('fecha_pedido', { ascending: false });

    if (_filtroEstado !== 'todos') query = query.eq('estado', _filtroEstado);
    if (_filtroSede)               query = query.eq('sede', _filtroSede);

    const { data, error } = await query;
    if (error) { console.error(error); return; }
    _siropesData = data || [];
    _renderTabla(_siropesData);
}

function _renderTabla(data) {
    const tbody = document.getElementById('siropes-tbody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#888;font-size:1.3rem;">Sin registros</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(r => {
        const badgeCls = r.estado === 'pendiente' ? 'badge-preparacion' : 'badge-despachado';
        const badgeTxt = r.estado === 'pendiente' ? 'Pendiente'         : 'Entregado';

        const entregaCell = r.estado === 'pendiente'
            ? `<button class="ap-btn ap-btn--primary btn-entregar-sirope"
                   data-id="${r.id}" style="font-size:1.1rem;padding:4px 12px;">
                   Entregar
               </button>`
            : `<span style="color:#555;font-size:1.1rem;">${fmtFecha(r.fecha_entrega)}</span>`;

        const obsCell = r.observacion
            ? `<span style="font-size:1.1rem;color:#555;">${r.observacion}</span>`
            : '—';

        return `<tr class="inventory-management__row">
            <td class="inventory-management__cell">#${r.pedido_id ?? '—'}</td>
            <td class="inventory-management__cell sc-sirope">
                ${r.producto_nombre} <span style="color:#888;font-size:1.1rem;">· ${r.cantidad} uds.</span>
            </td>
            <td class="inventory-management__cell">${fmtFecha(r.fecha_pedido)}</td>
            <td class="inventory-management__cell">${capitalizarSede(r.sede)}</td>
            <td class="inventory-management__cell">
                <span class="order-estado-badge ${badgeCls}">${badgeTxt}</span>
            </td>
            <td class="inventory-management__cell">${entregaCell}</td>
            <td class="inventory-management__cell sc-obs">${obsCell}</td>
        </tr>`;
    }).join('');
}

// ── Filtros ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.siropes-filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.siropes-filtro-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _filtroEstado = btn.dataset.estado;
        cargarSiropes();
    });
});

document.getElementById('siropes-filtro-sede')?.addEventListener('change', e => {
    _filtroSede = e.target.value;
    cargarSiropes();
});

// ── Botón Entregar → navegar al dashboard con contexto sirope ─────────────────
document.getElementById('siropes-tbody')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-entregar-sirope');
    if (!btn) return;
    const id  = parseInt(btn.dataset.id);
    const row = _siropesData.find(r => r.id === id);
    if (!row || !row.pedido_id) return;

    sessionStorage.setItem('sirope_pendiente', JSON.stringify({
        id:              row.id,
        producto_nombre: row.producto_nombre,
        cantidad:        row.cantidad,
        sede:            row.sede,
    }));
    window.location.href = `./dashboard.html?pedido=${row.pedido_id}`;
});
