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
    // Badge pendientes en sidebar
    const { count } = await supabase.from('entregas_siropes')
        .select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
    if (window.self !== window.top) {
        window.parent.postMessage({ type: 'badge-siropes', count: count ?? 0 }, '*');
        return;
    }
    const _apply = () => {
        const link = document.getElementById('sidebar-siropes-link');
        if (!link) return false;
        link.querySelector('.siropes-badge')?.remove();
        const b = document.createElement('span');
        b.className = 'siropes-badge';
        b.textContent = count ?? 0;
        b.style.cssText = `background:${count > 0 ? '#e67e22' : '#aaa'};color:#fff;border-radius:10px;padding:1px 7px;font-size:1.1rem;font-weight:700;margin-left:6px;vertical-align:middle;`;
        link.appendChild(b);
        return true;
    };
    if (!_apply()) setTimeout(_apply, 1200);
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

        return `<tr class="inventory-management__row" data-id="${r.id}" style="cursor:pointer;">
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

// ── Click en tabla siropes ────────────────────────────────────────────────────
document.getElementById('siropes-tbody')?.addEventListener('click', e => {
    const row = e.target.closest('.inventory-management__row');
    if (!row) return;

    const btn = e.target.closest('.btn-entregar-sirope');
    const sr  = _siropesData.find(r => r.id === parseInt(row.dataset.id));
    if (!sr) return;

    if (btn) {
        // Botón Entregar: navegar al dashboard con contexto de entrega
        if (!sr.pedido_id) return;
        sessionStorage.setItem('sirope_pendiente', JSON.stringify({
            id:              sr.id,
            producto_nombre: sr.producto_nombre,
            cantidad:        sr.cantidad,
            sede:            sr.sede,
        }));
        window.location.href = `./dashboard.html?pedido=${sr.pedido_id}`;
        return;
    }

    // Click en fila: abrir modal con info del sirope
    document.getElementById('msd-titulo').textContent   = sr.producto_nombre;
    document.getElementById('msd-sede').textContent     = capitalizarSede(sr.sede);
    document.getElementById('msd-cantidad').textContent = `${sr.cantidad} uds.`;
    document.getElementById('msd-fecha-pedido').textContent = fmtFecha(sr.fecha_pedido);
    document.getElementById('msd-estado').textContent   = sr.estado === 'pendiente' ? 'Pendiente' : 'Entregado';

    const entregaRow = document.getElementById('msd-entrega-row');
    const obsRow     = document.getElementById('msd-obs-row');
    if (sr.fecha_entrega) {
        document.getElementById('msd-fecha-entrega').textContent = fmtFecha(sr.fecha_entrega);
        entregaRow.style.display = '';
    } else {
        entregaRow.style.display = 'none';
    }
    if (sr.observacion) {
        document.getElementById('msd-obs').textContent = sr.observacion;
        obsRow.style.display = '';
    } else {
        obsRow.style.display = 'none';
    }

    document.getElementById('modal-sirope-detalle').showModal();
});

document.getElementById('msd-cerrar')?.addEventListener('click', () => {
    document.getElementById('modal-sirope-detalle').close();
});
