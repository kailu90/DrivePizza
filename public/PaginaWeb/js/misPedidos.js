/* ============================================================
   Drive Pizza — Vista Mis Pedidos
   ============================================================ */
import { supabase }     from '../../Api/supabaseConfig.js';
import { formatPrecio } from './carrito.js';

const STEPS = ['Confirmado', 'Preparando', 'En camino', 'Entregado'];

const ESTADO_STEP = {
  pendiente: 0, recibido: 0,
  'en preparacion': 1,
  despachado: 2,
  entregado: 3,
};

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  recibido: 'Recibido',
  'en preparacion': 'En preparación',
  despachado: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const ESTADO_MOD = {
  pendiente: 'naranja', recibido: 'naranja',
  'en preparacion': 'azul', despachado: 'azul',
  entregado: 'verde', cancelado: 'rojo',
};

function fmtFecha(iso) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function progressBar(estado) {
  const step = ESTADO_STEP[estado] ?? -1;
  if (step < 0) return '';
  return `<div class="pw-pedidos-progress">${STEPS.map((s, i) => `
    <div class="pw-pedidos-step${i <= step ? ' pw-pedidos-step--done' : ''}">
      <div class="pw-pedidos-step-dot"></div>
      ${i < STEPS.length - 1 ? `<div class="pw-pedidos-step-line${i < step ? ' pw-pedidos-step-line--done' : ''}"></div>` : ''}
      <span>${s}</span>
    </div>`).join('')}</div>`;
}

function orderCard(p) {
  const isActive = !['entregado', 'cancelado'].includes(p.estado);
  const mod      = ESTADO_MOD[p.estado] || 'naranja';
  const prods    = (p.productos || []).map(x => `${x.qty}\u00d7 ${x.nombre}`).join(', ');
  return `
    <div class="pw-pedidos-card">
      <div class="pw-pedidos-card-top">
        <div class="pw-pedidos-card-meta">
          <span class="pw-pedidos-nped">Pedido #${p.nPedido}</span>
          <span class="pw-pedidos-fecha">${fmtFecha(p.fecha)}</span>
          <span class="pw-pedidos-sede">${p.sede || ''}</span>
        </div>
        <span class="pw-pedidos-badge pw-pedidos-badge--${mod}">${ESTADO_LABEL[p.estado] || p.estado}</span>
      </div>
      ${isActive ? progressBar(p.estado) : ''}
      <div class="pw-pedidos-card-body">
        <p class="pw-pedidos-prods">${prods}</p>
        <span class="pw-pedidos-total">${formatPrecio(p.total || 0)}</span>
      </div>
      <div class="pw-pedidos-card-actions">
        <button class="pw-pedidos-btn-outline js-ped-detalle" data-nped="${p.nPedido}">Ver detalles</button>
        ${p.estado === 'entregado' ? `<button class="pw-pedidos-btn-pedir js-ped-pedir">Pedir de nuevo</button>` : ''}
      </div>
    </div>`;
}

export function initMisPedidosView({ onVolver, onIrAlMenu } = {}) {
  const wrap = document.getElementById('pedidos-wrap');

  wrap.innerHTML = `
    <div class="pw-subview-wrap">
      <div class="pw-subview-header">
        <button class="pw-subview-back" id="btn-ped-back" aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pw-subview-title">Mis pedidos</span>
      </div>
      <div class="pw-subview-inner" id="pedidos-inner"></div>
    </div>`;

  wrap.querySelector('#btn-ped-back').addEventListener('click', () => onVolver?.());

  // Cerrar modal detalle al hacer click fuera o en X
  const detalleOverlay = document.getElementById('modal-pedido-detalle');
  if (detalleOverlay) {
    document.getElementById('btn-detalle-close')?.addEventListener('click', () => {
      detalleOverlay.style.display = 'none';
    });
    detalleOverlay.addEventListener('click', e => {
      if (e.target === detalleOverlay) detalleOverlay.style.display = 'none';
    });
  }

  const tel = localStorage.getItem('dp_telefono');
  tel ? loadPedidos(tel) : showPhonePrompt();

  function showPhonePrompt() {
    document.getElementById('pedidos-inner').innerHTML = `
      <div class="pw-subview-info-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        <h3>Consulta tus pedidos</h3>
        <p>Ingresa el n\u00famero con el que realizaste tu pedido.</p>
      </div>
      <div class="pw-pedidos-phone-wrap">
        <input id="pedidos-phone" class="pw-pedidos-phone-input" type="tel" inputmode="numeric"
               maxlength="10" placeholder="Ej: 3001234567" autocomplete="tel">
        <button class="pw-btn-primary" id="btn-ped-buscar">Buscar mis pedidos</button>
      </div>`;

    const input = document.getElementById('pedidos-phone');
    const buscar = () => {
      const t = input.value.replace(/\D/g, '').slice(-10);
      if (t.length !== 10) { input.classList.add('pw-input-error'); return; }
      input.classList.remove('pw-input-error');
      localStorage.setItem('dp_telefono', t);
      loadPedidos(t);
    };
    document.getElementById('btn-ped-buscar').addEventListener('click', buscar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
    input.addEventListener('input', () => input.classList.remove('pw-input-error'));
  }

  async function loadPedidos(telefono) {
    document.getElementById('pedidos-inner').innerHTML =
      `<div class="pw-loading"><div class="pw-spinner"></div><span>Buscando pedidos...</span></div>`;
    try {
      // Requiere politica RLS que permita SELECT WHERE telefono = X AND canal = 'web'
      const { data, error } = await supabase
        .from('pedidos_callcenter')
        .select('nPedido, sede, productos, total, estado, fecha')
        .eq('telefono', telefono)
        .eq('canal', 'web')
        .order('fecha', { ascending: false })
        .limit(30);
      if (error) throw error;
      renderPedidos(data || [], telefono);
    } catch {
      document.getElementById('pedidos-inner').innerHTML = `
        <div class="pw-subview-empty">
          <p>No pudimos cargar tus pedidos. Intenta de nuevo.</p>
          <button class="pw-btn-secondary" id="btn-ped-retry">Reintentar</button>
        </div>`;
      document.getElementById('btn-ped-retry')?.addEventListener('click', () => loadPedidos(telefono));
    }
  }

  function renderPedidos(pedidos, telefono) {
    if (!pedidos.length) {
      document.getElementById('pedidos-inner').innerHTML = `
        <div class="pw-subview-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(45,45,45,.2)"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          <p>No encontramos pedidos para <strong>${telefono}</strong>.</p>
          <button class="pw-btn-secondary" id="btn-otro-tel">Usar otro n\u00famero</button>
        </div>`;
      document.getElementById('btn-otro-tel')?.addEventListener('click', () => {
        localStorage.removeItem('dp_telefono');
        showPhonePrompt();
      });
      return;
    }

    let tabActivo = 'todos';
    document.getElementById('pedidos-inner').innerHTML = `
      <div class="pw-pedidos-phone-tag">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .92h3a2 2 0 012 1.72c.16.96.4 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.3 1.85.54 2.81.7A2 2 0 0122 16.92z"/></svg>
        ${telefono}
        <button class="pw-pedidos-cambiar-tel" id="btn-cambiar-tel">Cambiar</button>
      </div>
      <div class="pw-pedidos-tabs" role="tablist">
        <button class="pw-pedidos-tab active" data-tab="todos" role="tab">Todos</button>
        <button class="pw-pedidos-tab" data-tab="activos" role="tab">En curso</button>
        <button class="pw-pedidos-tab" data-tab="entregados" role="tab">Entregados</button>
      </div>
      <div id="pedidos-lista"></div>
      <div class="pw-pedidos-cta-bottom">
        <p>\u00bfNo encuentras tu pedido?</p>
        <a class="pw-pedidos-wa-link" href="https://wa.me/573166600690" target="_blank" rel="noopener">Esch\u00edbenos por WhatsApp</a>
      </div>`;

    document.getElementById('btn-cambiar-tel')?.addEventListener('click', () => {
      localStorage.removeItem('dp_telefono');
      showPhonePrompt();
    });

    const renderTab = () => {
      let list = pedidos;
      if (tabActivo === 'activos')    list = pedidos.filter(p => !['entregado', 'cancelado'].includes(p.estado));
      if (tabActivo === 'entregados') list = pedidos.filter(p => p.estado === 'entregado');
      const el = document.getElementById('pedidos-lista');
      el.innerHTML = list.length
        ? list.map(orderCard).join('')
        : `<div class="pw-subview-empty"><p>No hay pedidos en esta categor\u00eda.</p></div>`;

      el.querySelectorAll('.js-ped-detalle').forEach(btn => {
        const p = pedidos.find(x => String(x.nPedido) === String(btn.dataset.nped));
        if (p) btn.addEventListener('click', () => showDetalle(p));
      });
      el.querySelectorAll('.js-ped-pedir').forEach(btn => {
        btn.addEventListener('click', () => onIrAlMenu?.());
      });
    };

    document.getElementById('pedidos-inner').querySelectorAll('.pw-pedidos-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabActivo = tab.dataset.tab;
        document.getElementById('pedidos-inner').querySelectorAll('.pw-pedidos-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.tab === tabActivo));
        renderTab();
      });
    });

    renderTab();
  }

  function showDetalle(p) {
    const overlay = document.getElementById('modal-pedido-detalle');
    if (!overlay) return;
    const items = (p.productos || []).map(pr => `
      <div class="pw-detalle-item">
        <span class="pw-detalle-qty">${pr.qty}\u00d7</span>
        <div class="pw-detalle-item-info">
          <span class="pw-detalle-nombre">${pr.nombre}</span>
          ${pr.obs ? `<span class="pw-detalle-obs">${pr.obs}</span>` : ''}
          ${(pr.adiciones || []).length ? `<span class="pw-detalle-obs">${pr.adiciones.map(a => a.nombre).join(', ')}</span>` : ''}
        </div>
        <span class="pw-detalle-precio">${formatPrecio((pr.precio || 0) * (pr.qty || 1))}</span>
      </div>`).join('');

    const mod = ESTADO_MOD[p.estado] || 'naranja';
    overlay.querySelector('#detalle-body').innerHTML = `
      <div class="pw-detalle-head">
        <span class="pw-pedidos-nped">Pedido #${p.nPedido}</span>
        <span class="pw-pedidos-badge pw-pedidos-badge--${mod}">${ESTADO_LABEL[p.estado] || p.estado}</span>
      </div>
      <p class="pw-detalle-meta">${fmtFecha(p.fecha)} \u00b7 ${p.sede || ''}</p>
      <div class="pw-detalle-lista">${items}</div>
      <div class="pw-detalle-total"><span>Total</span><strong>${formatPrecio(p.total || 0)}</strong></div>`;
    overlay.style.display = '';
  }
}
