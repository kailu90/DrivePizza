import { supabase }                                         from '../Api/supabaseConfig.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta }                            from '../Auth/plantaAuth.js';
import { getSedes }                                         from '../Shared/sedesService.js';

// ── Estado ────────────────────────────────────────────────────────────────────
let _siropesData       = [];
let _filtroEstado      = 'pendiente';
let _filtroSede        = '';
let _pendienteId       = null;

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
            <td class="inventory-management__cell">
                ${r.producto_nombre}
                <div style="font-size:1.1rem;color:#888;">${r.cantidad} uds.</div>
            </td>
            <td class="inventory-management__cell">${fmtFecha(r.fecha_pedido)}</td>
            <td class="inventory-management__cell">${capitalizarSede(r.sede)}</td>
            <td class="inventory-management__cell">
                <span class="order-estado-badge ${badgeCls}">${badgeTxt}</span>
            </td>
            <td class="inventory-management__cell">${entregaCell}</td>
            <td class="inventory-management__cell">${obsCell}</td>
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

// ── Botón Entregar (delegación) ───────────────────────────────────────────────
document.getElementById('siropes-tbody')?.addEventListener('click', e => {
    const btn = e.target.closest('.btn-entregar-sirope');
    if (!btn) return;
    const id  = parseInt(btn.dataset.id);
    const row = _siropesData.find(r => r.id === id);
    if (!row) return;

    _pendienteId = id;
    document.getElementById('sirope-entrega-info').textContent =
        `${row.producto_nombre} · ${capitalizarSede(row.sede)} · ${row.cantidad} uds.`;
    document.getElementById('sirope-obs').value = '';
    document.getElementById('modal-sirope-entrega').showModal();
    setTimeout(() => document.getElementById('sirope-obs').focus(), 100);
});

// ── Dialog confirmar entrega ──────────────────────────────────────────────────
document.getElementById('sirope-cancelar')?.addEventListener('click', () => {
    document.getElementById('modal-sirope-entrega').close();
    _pendienteId = null;
});

document.getElementById('sirope-confirmar')?.addEventListener('click', async () => {
    if (!_pendienteId) return;
    const obs = document.getElementById('sirope-obs').value.trim();
    const btn = document.getElementById('sirope-confirmar');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await supabase
        .from('entregas_siropes')
        .update({
            estado:        'entregado',
            fecha_entrega: new Date().toISOString(),
            observacion:   obs || null,
        })
        .eq('id', _pendienteId);

    btn.disabled = false;
    btn.textContent = 'Marcar entregado';

    if (error) { alert('Error al registrar la entrega.'); return; }

    document.getElementById('modal-sirope-entrega').close();
    _pendienteId = null;
    cargarSiropes();
});
