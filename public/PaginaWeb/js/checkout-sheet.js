/* ============================================================
   Drive Pizza — Checkout Sheet
   ============================================================ */
import { supabase }        from '../../Api/supabaseConfig.js';
import { displayNombre }   from './sede.js';
import { getCarrito, getTotal, getTotalAdiciones, actualizarCantidad, quitarItem, vaciarCarrito, formatPrecio } from './carrito.js';
import { domicilios }      from '../../CallCenter/domicilios.js';
import { PRODUCT_IMAGES }  from './menuData.js';

// ── ESTADO ────────────────────────────────────────────────────
let _sede            = null;
let _tipoEntrega     = 'domicilio';
let _pagoActivo      = 'Efectivo';
let _domicilioFee    = 0;
let _onCarritoChange = null;

// ── ELEMENTOS ─────────────────────────────────────────────────
const coResumen      = document.getElementById('co-resumen-items');
const coNombre       = document.getElementById('co-nombre');
const coTel          = document.getElementById('co-tel');
const coDir          = document.getElementById('co-dir');
const coBarrio       = document.getElementById('co-barrio');
const coBarrioGroup  = document.getElementById('co-barrio-group');
const coDomSec       = document.getElementById('co-seccion-domicilio');
const coRecogerSec   = document.getElementById('co-seccion-recoger');
const coRecogerInfo  = document.getElementById('co-recoger-info');
const coObs          = document.getElementById('co-obs');
const coSubtotal     = document.getElementById('co-subtotal');
const coRowDomicilio = document.getElementById('co-row-domicilio');
const coDomicilioVal = document.getElementById('co-domicilio-val');
const coTotalFinal   = document.getElementById('co-total-final');
const btnConfirmar   = document.getElementById('btn-co-confirmar');
const coError        = document.getElementById('co-error');

// ── INIT (una vez al cargar la página) ───────────────────────
export function initCheckoutSheet({ onCarritoChange }) {
  _onCarritoChange = onCarritoChange;
  setupFormListeners();
}

// ── OPEN (cada vez que se abre el sheet) ─────────────────────
export function openCheckoutSheet(sede) {
  _sede         = sede;
  _tipoEntrega  = 'domicilio';
  _pagoActivo   = 'Efectivo';
  _domicilioFee = 0;

  document.querySelectorAll('#co-entrega-pills .pw-entrega-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.tipo === 'domicilio'));
  coDomSec.style.display    = '';
  coRecogerSec.style.display = 'none';

  document.querySelectorAll('#co-pago-pills .pw-pago-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.pago === 'Efectivo'));

  renderItems();
  cargarBarrios();
  renderTotales();
}

// ── RENDER ITEMS ──────────────────────────────────────────────
export function renderItems() {
  const carrito = getCarrito();
  coResumen.innerHTML = carrito.map((item, idx) => {
    const esMezcla = item.nombre.includes(' y mitad ');
    let thumbHTML, thumbClass;
    if (esMezcla) {
      const [n1, n2] = item.nombre.split(' y mitad ');
      const src1 = PRODUCT_IMAGES[n1] || '';
      const src2 = PRODUCT_IMAGES[n2] || '';
      thumbClass = 'pw-cart-item-thumb pw-cart-item-thumb--mezcla';
      thumbHTML  = `
        ${src1 ? `<img class="pw-cart-thumb-main" src="${src1}" alt="${n1}" loading="lazy">` : ''}
        ${src2 ? `<img class="pw-cart-thumb-secondary" src="${src2}" alt="${n2}" loading="lazy">` : ''}`;
    } else {
      const src  = PRODUCT_IMAGES[item.nombre] || '';
      thumbClass = `pw-cart-item-thumb${src ? '' : ' pw-cart-item-thumb--empty'}`;
      thumbHTML  = src ? `<img src="${src}" alt="${item.nombre}" loading="lazy">` : '';
    }
    return `
    <div class="pw-cart-item">
      <div class="pw-cart-item-body">
        <div class="${thumbClass}">${thumbHTML}</div>
        <div class="pw-cart-item-info">
          <span class="pw-cart-item-nombre">${item.nombre}</span>
          <div class="pw-cart-item-row">
            <span class="pw-cart-item-opcion">${item.opcion}</span>
            <span class="pw-cart-item-base-precio">${formatPrecio(item.precio)}</span>
          </div>
          <div class="pw-cart-item-qty">
            <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="-1" aria-label="Quitar uno">−</button>
            <span class="pw-cart-qty-num">${item.cantidad}</span>
            <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="1" aria-label="Agregar uno">+</button>
            <button class="pw-cart-delete-btn" data-idx="${idx}" aria-label="Eliminar producto">🗑</button>
          </div>
          ${item.adiciones?.length ? item.adiciones.map(a => `
          <div class="pw-cart-item-adicion">
            <span>${a.nombre}</span>
            <span class="pw-cart-adicion-precio">+${formatPrecio(a.precio)}</span>
          </div>`).join('') : ''}
          ${item.obs ? `<div class="pw-cart-item-obs">"${item.obs}"</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  coResumen.querySelectorAll('.pw-cart-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      actualizarCantidad(Number(btn.dataset.idx), Number(btn.dataset.delta));
      renderItems();
      renderTotales();
      _onCarritoChange?.();
    });
  });
  coResumen.querySelectorAll('.pw-cart-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      quitarItem(Number(btn.dataset.idx));
      if (!getCarrito().length) { _onCarritoChange?.(); return; }
      renderItems();
      renderTotales();
      _onCarritoChange?.();
    });
  });
}

// ── BARRIOS ───────────────────────────────────────────────────
function cargarBarrios() {
  const barrios = domicilios[_sede?.name || ''];
  if (!barrios || !Object.keys(barrios).length) {
    coBarrioGroup.style.display = 'none';
    return;
  }
  coBarrioGroup.style.display = '';
  coBarrio.value = '';
  const sorted = Object.keys(barrios).sort((a, b) => a.localeCompare(b, 'es'));
  coBarrio.innerHTML = '<option value="">Selecciona tu barrio</option>' +
    sorted.map(b => `<option value="${b}" data-fee="${barrios[b]}">${b} — ${formatPrecio(barrios[b])}</option>`).join('');
  _domicilioFee = 0;
}

// ── TOTALES ───────────────────────────────────────────────────
function renderTotales() {
  const subtotal = getTotal();
  const total    = subtotal + (_tipoEntrega === 'domicilio' ? _domicilioFee : 0);
  coSubtotal.textContent   = formatPrecio(subtotal);
  coTotalFinal.textContent = formatPrecio(total);
  if (_tipoEntrega === 'domicilio' && _domicilioFee > 0) {
    coRowDomicilio.style.display = '';
    coDomicilioVal.textContent   = formatPrecio(_domicilioFee);
  } else {
    coRowDomicilio.style.display = 'none';
  }
}

// ── LISTENERS (una vez) ───────────────────────────────────────
function setupFormListeners() {
  coBarrio.addEventListener('change', () => {
    const opt     = coBarrio.options[coBarrio.selectedIndex];
    _domicilioFee = opt.value ? Number(opt.dataset.fee) : 0;
    renderTotales();
  });

  document.querySelectorAll('#co-entrega-pills .pw-entrega-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#co-entrega-pills .pw-entrega-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _tipoEntrega = pill.dataset.tipo;
      if (_tipoEntrega === 'domicilio') {
        coDomSec.style.display    = '';
        coRecogerSec.style.display = 'none';
      } else {
        coDomSec.style.display    = 'none';
        coRecogerSec.style.display = '';
        _domicilioFee = 0;
        coRecogerInfo.innerHTML = `
          <p>Pasa a recoger tu pedido en nuestra sede:</p>
          <strong>${displayNombre(_sede)}</strong>
          ${_sede?.direccion ? `<span>${_sede.direccion}</span>` : ''}`;
      }
      renderTotales();
    });
  });

  document.querySelectorAll('#co-pago-pills .pw-pago-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#co-pago-pills .pw-pago-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      _pagoActivo = pill.dataset.pago;
    });
  });

  btnConfirmar.addEventListener('click', confirmarPedido);
}

// ── VALIDACIÓN ────────────────────────────────────────────────
function mostrarError(msg) {
  coError.textContent   = msg;
  coError.style.display = 'block';
  coError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function validar() {
  if (!coNombre.value.trim()) { mostrarError('Por favor ingresa tu nombre.'); coNombre.focus(); return false; }
  if (!coTel.value.trim() || coTel.value.trim().length < 7) { mostrarError('Ingresa un número de teléfono válido.'); coTel.focus(); return false; }
  if (_tipoEntrega === 'domicilio') {
    if (!coDir.value.trim()) { mostrarError('Ingresa tu dirección.'); coDir.focus(); return false; }
    if (coBarrioGroup.style.display !== 'none' && !coBarrio.value) { mostrarError('Selecciona tu barrio.'); coBarrio.focus(); return false; }
  }
  return true;
}

// ── CREAR PEDIDO ──────────────────────────────────────────────
async function confirmarPedido() {
  coError.style.display = 'none';
  if (!validar()) return;

  btnConfirmar.disabled    = true;
  btnConfirmar.textContent = 'Enviando pedido...';

  try {
    const carrito  = getCarrito();
    const subtotal = getTotal();

    const { data: nPedido, error: rpcError } = await supabase.rpc('siguiente_n_pedido_callcenter');
    if (rpcError) throw new Error(rpcError.message);

    const productos = carrito.map(item => {
      const prod = {
        nombre: item.opcion ? `${item.nombre} (${item.opcion})` : item.nombre,
        precio: item.precio,
        qty:    item.cantidad,
        obs:    item.obs || '',
      };
      if (item.adiciones?.length)
        prod.adiciones = item.adiciones.map(a => ({ nombre: a.nombre, precio: a.precio, qty: 1 }));
      return prod;
    });

    let domicilioObj, direccion = '';
    if (_tipoEntrega === 'recoger') {
      domicilioObj = { tipo: 'recoger', valor: 0 };
    } else {
      const barrio = coBarrio.value || null;
      domicilioObj = barrio ? { barrio, valor: _domicilioFee } : { valor: _domicilioFee };
      direccion    = coDir.value.trim();
    }

    const total = subtotal + (_tipoEntrega === 'domicilio' ? _domicilioFee : 0);

    const { error: insertError } = await supabase.from('pedidos_callcenter').insert({
      n_pedido: nPedido,
      nombre:   coNombre.value.trim(),
      telefono: coTel.value.trim(),
      direccion,
      sede:     _sede.name,
      pago:     _pagoActivo,
      obs:      coObs.value.trim(),
      asesor:   'web',
      canal:    'web',
      impreso:  false,
      estado:   'pendiente',
      fecha:    new Date().toISOString(),
      productos,
      total,
      domicilio: domicilioObj,
    });
    if (insertError) throw new Error(insertError.message);

    vaciarCarrito();
    window.location.href = `confirmacion.html?n=${encodeURIComponent(nPedido)}`;

  } catch (err) {
    console.error(err);
    mostrarError('No pudimos procesar tu pedido. Intenta de nuevo.');
    btnConfirmar.disabled    = false;
    btnConfirmar.textContent = 'Confirmar pedido';
  }
}
