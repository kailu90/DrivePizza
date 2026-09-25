/* ============================================================
   Drive Pizza — Vista Mis Pedidos
   ============================================================ */
import { supabase }    from '../../Api/supabaseConfig.js';
import { getCliente }  from './auth.js';
import { formatPrecio } from './carrito.js';

const STEPS = ['Confirmado', 'Preparando', 'En camino', 'Entregado'];

const ESTADO_STEP = {
  pendiente: 0, recibido: 0,
  'en preparacion': 1,
  despachado: 2,
  entregado: 3,
};

const ESTADO_LABEL = {
  pendiente:        'Pendiente',
  recibido:         'Recibido',
  'en preparacion': 'En preparación',
  despachado:       'En camino',
  entregado:        'Entregado',
  cancelado:        'Cancelado',
};

const ESTADO_MOD = {
  pendiente: 'naranja', recibido: 'naranja',
  'en preparacion': 'azul', despachado: 'azul',
  entregado: 'verde', cancelado: 'rojo',
};

const CANAL_LABEL = {
  web:       'Web',
  whatsapp:  'WhatsApp',
  ivr:       'Línea',
};

function normTel(t) {
  return (t || '').replace(/\D/g, '').slice(-10);
}

function fmtFecha(iso) {
  if (!iso) return '';
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
  const prods    = (p.productos || [])
    .map(x => `${x.qty || 1}\u00d7 ${x.nombre || '(producto)'}`)
    .join(', ') || 'Sin detalle de productos';
  const canalTxt = CANAL_LABEL[p.canal] || 'Teléfono';

  return `
    <div class="pw-pedidos-card">
      <div class="pw-pedidos-card-top">
        <div class="pw-pedidos-card-meta">
          <span class="pw-pedidos-nped">${p.n_pedido ? `Pedido #${p.n_pedido}` : 'Pedido'}</span>
          <span class="pw-pedidos-fecha">${fmtFecha(p.fecha)}</span>
          ${p.sede ? `<span class="pw-pedidos-sede">${p.sede}</span>` : ''}
        </div>
        <div class="pw-pedidos-card-badges">
          <span class="pw-pedidos-badge pw-pedidos-badge--${mod}">${ESTADO_LABEL[p.estado] || p.estado}</span>
          <span class="pw-pedidos-canal-badge">${canalTxt}</span>
        </div>
      </div>
      ${isActive ? progressBar(p.estado) : ''}
      <div class="pw-pedidos-card-body">
        <p class="pw-pedidos-prods">${prods}</p>
        <span class="pw-pedidos-total">${formatPrecio(p.total || 0)}</span>
      </div>
      <div class="pw-pedidos-card-actions">
        <button class="pw-pedidos-btn-outline js-ped-detalle" data-nped="${p.n_pedido || ''}">Ver detalles</button>
        ${p.estado === 'entregado' ? `<button class="pw-pedidos-btn-pedir js-ped-pedir">Pedir de nuevo</button>` : ''}
      </div>
    </div>`;
}

export async function initMisPedidosView({ onVolver, onIrAlMenu } = {}) {
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

  const detalleOverlay = document.getElementById('modal-pedido-detalle');
  if (detalleOverlay) {
    document.getElementById('btn-detalle-close')?.addEventListener('click', () => {
      detalleOverlay.style.display = 'none';
    });
    detalleOverlay.addEventListener('click', e => {
      if (e.target === detalleOverlay) detalleOverlay.style.display = 'none';
    });
  }

  // Determinar teléfono y estado de verificación
  const cliente   = await getCliente();
  const verificado = cliente?.verificado ?? false;
  const tel = cliente?.telefono
    ? normTel(cliente.telefono)
    : normTel(localStorage.getItem('dp_telefono') || '');

  tel ? loadPedidos(tel, verificado) : showPhonePrompt();

  /* ── Prompt teléfono (sin sesión o sin teléfono en perfil) ── */
  function showPhonePrompt() {
    document.getElementById('pedidos-inner').innerHTML = `
      <div class="pw-subview-info-card">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
        <h3>Consulta tus pedidos</h3>
        <p>Ingresa el número con el que realizaste tu pedido.</p>
      </div>
      <div class="pw-pedidos-phone-wrap">
        <input id="pedidos-phone" class="pw-pedidos-phone-input" type="tel" inputmode="numeric"
               maxlength="10" placeholder="Ej: 3001234567" autocomplete="tel">
        <button class="pw-btn-primary" id="btn-ped-buscar">Buscar mis pedidos</button>
      </div>`;

    const input = document.getElementById('pedidos-phone');
    const buscar = () => {
      const t = normTel(input.value);
      if (t.length !== 10) { input.classList.add('pw-input-error'); return; }
      input.classList.remove('pw-input-error');
      localStorage.setItem('dp_telefono', t);
      loadPedidos(t, false); // sin verificación → solo canal web
    };
    document.getElementById('btn-ped-buscar').addEventListener('click', buscar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });
    input.addEventListener('input', () => input.classList.remove('pw-input-error'));
  }

  /* ── Carga pedidos ─────────────────────────────────────────── */
  async function loadPedidos(telefono, esVerificado) {
    document.getElementById('pedidos-inner').innerHTML =
      `<div class="pw-loading"><div class="pw-spinner"></div><span>Buscando pedidos...</span></div>`;

    try {
      let query = supabase
        .from('pedidos_callcenter')
        .select('n_pedido, sede, productos, total, estado, fecha, canal')
        .eq('telefono', telefono)
        .order('fecha', { ascending: false })
        .limit(50);

      // Solo mostrar historial completo si el teléfono está verificado
      if (!esVerificado) query = query.eq('canal', 'web');

      const { data, error } = await query;
      if (error) throw error;
      renderPedidos(data || [], telefono, esVerificado);
    } catch {
      document.getElementById('pedidos-inner').innerHTML = `
        <div class="pw-subview-empty">
          <p>No pudimos cargar tus pedidos. Intenta de nuevo.</p>
          <button class="pw-btn-secondary" id="btn-ped-retry">Reintentar</button>
        </div>`;
      document.getElementById('btn-ped-retry')?.addEventListener('click',
        () => loadPedidos(telefono, esVerificado));
    }
  }

  /* ── Render lista ──────────────────────────────────────────── */
  function renderPedidos(pedidos, telefono, esVerificado) {
    const inner = document.getElementById('pedidos-inner');

    // Banner de verificación pendiente (usuario autenticado pero sin verificar)
    const bannerHtml = (!esVerificado && cliente)
      ? `<div class="pw-pedidos-verify-banner">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           Mostrando solo pedidos web. <button class="pw-pedidos-verify-link" id="btn-ped-verificar">Verifica tu número</button> para ver todo tu historial.
         </div>`
      : '';

    if (!pedidos.length) {
      inner.innerHTML = `
        ${bannerHtml}
        <div class="pw-subview-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="color:rgba(45,45,45,.2)"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
          <p>No encontramos pedidos para <strong>${telefono}</strong>.</p>
          ${!cliente ? `<button class="pw-btn-secondary" id="btn-otro-tel">Usar otro número</button>` : ''}
        </div>`;
      inner.querySelector('#btn-otro-tel')?.addEventListener('click', () => {
        localStorage.removeItem('dp_telefono');
        showPhonePrompt();
      });
      inner.querySelector('#btn-ped-verificar')?.addEventListener('click', () => onVolver?.());
      return;
    }

    let tabActivo = 'todos';
    inner.innerHTML = `
      ${bannerHtml}
      <div class="pw-pedidos-phone-tag">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .92h3a2 2 0 012 1.72c.16.96.4 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.3 1.85.54 2.81.7A2 2 0 0122 16.92z"/></svg>
        ${telefono}
        ${!cliente ? `<button class="pw-pedidos-cambiar-tel" id="btn-cambiar-tel">Cambiar</button>` : ''}
      </div>
      <div class="pw-pedidos-tabs" role="tablist">
        <button class="pw-pedidos-tab active" data-tab="todos" role="tab">Todos</button>
        <button class="pw-pedidos-tab" data-tab="activos" role="tab">En curso</button>
        <button class="pw-pedidos-tab" data-tab="entregados" role="tab">Entregados</button>
      </div>
      <div id="pedidos-lista"></div>
      <div class="pw-pedidos-cta-bottom">
        <p>¿No encuentras tu pedido?</p>
        <a class="pw-pedidos-wa-link" href="https://wa.me/573166600690" target="_blank" rel="noopener">Escríbenos por WhatsApp</a>
      </div>`;

    inner.querySelector('#btn-cambiar-tel')?.addEventListener('click', () => {
      localStorage.removeItem('dp_telefono');
      showPhonePrompt();
    });
    inner.querySelector('#btn-ped-verificar')?.addEventListener('click', () => onVolver?.());

    const renderTab = () => {
      let list = pedidos;
      if (tabActivo === 'activos')    list = pedidos.filter(p => !['entregado', 'cancelado'].includes(p.estado));
      if (tabActivo === 'entregados') list = pedidos.filter(p => p.estado === 'entregado');
      const el = document.getElementById('pedidos-lista');
      el.innerHTML = list.length
        ? list.map(orderCard).join('')
        : `<div class="pw-subview-empty"><p>No hay pedidos en esta categoría.</p></div>`;

      el.querySelectorAll('.js-ped-detalle').forEach(btn => {
        const p = pedidos.find(x => String(x.n_pedido) === String(btn.dataset.nped));
        if (p) btn.addEventListener('click', () => showDetalle(p));
      });
      el.querySelectorAll('.js-ped-pedir').forEach(btn => {
        btn.addEventListener('click', () => onIrAlMenu?.());
      });
    };

    inner.querySelectorAll('.pw-pedidos-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabActivo = tab.dataset.tab;
        inner.querySelectorAll('.pw-pedidos-tab').forEach(t =>
          t.classList.toggle('active', t.dataset.tab === tabActivo));
        renderTab();
      });
    });

    renderTab();
  }

  /* ── Modal detalle ─────────────────────────────────────────── */
  function showDetalle(p) {
    const overlay = document.getElementById('modal-pedido-detalle');
    if (!overlay) return;
    const items = (p.productos || []).map(pr => `
      <div class="pw-detalle-item">
        <span class="pw-detalle-qty">${pr.qty || 1}\u00d7</span>
        <div class="pw-detalle-item-info">
          <span class="pw-detalle-nombre">${pr.nombre || '(producto)'}</span>
          ${pr.obs ? `<span class="pw-detalle-obs">${pr.obs}</span>` : ''}
          ${(pr.adiciones || []).length ? `<span class="pw-detalle-obs">${pr.adiciones.map(a => a.nombre).join(', ')}</span>` : ''}
        </div>
        <span class="pw-detalle-precio">${formatPrecio((pr.precio || 0) * (pr.qty || 1))}</span>
      </div>`).join('');

    const mod = ESTADO_MOD[p.estado] || 'naranja';
    const canalTxt = CANAL_LABEL[p.canal] || 'Teléfono';
    overlay.querySelector('#detalle-body').innerHTML = `
      <div class="pw-detalle-head">
        <span class="pw-pedidos-nped">${p.n_pedido ? `Pedido #${p.n_pedido}` : 'Pedido'}</span>
        <span class="pw-pedidos-badge pw-pedidos-badge--${mod}">${ESTADO_LABEL[p.estado] || p.estado}</span>
      </div>
      <p class="pw-detalle-meta">${fmtFecha(p.fecha)}${p.sede ? ` \u00b7 ${p.sede}` : ''} \u00b7 ${canalTxt}</p>
      <div class="pw-detalle-lista">${items || '<p style="color:rgba(45,45,45,.5);font-size:.85rem">Sin detalle disponible</p>'}</div>
      <div class="pw-detalle-total"><span>Total</span><strong>${formatPrecio(p.total || 0)}</strong></div>`;
    overlay.style.display = '';
  }
}
