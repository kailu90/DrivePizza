/* ============================================================
   Drive Pizza — Checkout
   ============================================================ */

import { supabase } from '../../Api/supabaseConfig.js';
import { getSedeActual, displayNombre } from './sede.js';
import { getCarrito, getTotal, vaciarCarrito, formatPrecio } from './carrito.js';
import { domicilios } from '../../CallCenter/domicilios.js';

// ── ESTADO ────────────────────────────────────────────────────
let tipoEntrega  = 'domicilio';
let pagoActivo   = 'Efectivo';
let domicilioFee = 0;
let sede         = null;

// ── ELEMENTOS ─────────────────────────────────────────────────
const headerSede       = document.getElementById('header-sede');
const summaryToggle    = document.getElementById('summary-toggle');
const summaryBody      = document.getElementById('summary-body');
const summaryItems     = document.getElementById('summary-items');
const summarySubtotal  = document.getElementById('summary-subtotal');
const summaryTotalPrev = document.getElementById('summary-total-preview');
const inpNombre        = document.getElementById('inp-nombre');
const inpTel           = document.getElementById('inp-tel');
const inpDir           = document.getElementById('inp-dir');
const selBarrio        = document.getElementById('sel-barrio');
const domicilioFeeDiv  = document.getElementById('domicilio-fee');
const domicilioFeeVal  = document.getElementById('domicilio-fee-val');
const seccionDomicilio = document.getElementById('seccion-domicilio');
const seccionRecoger   = document.getElementById('seccion-recoger');
const recogerInfo      = document.getElementById('recoger-info');
const inpObs           = document.getElementById('inp-obs');
const totalSubtotal    = document.getElementById('total-subtotal');
const rowDomicilio     = document.getElementById('row-domicilio');
const totalDomicilio   = document.getElementById('total-domicilio');
const totalFinal       = document.getElementById('total-final');
const btnConfirmar     = document.getElementById('btn-confirmar');
const confirmError     = document.getElementById('confirm-error');

// ── INIT ──────────────────────────────────────────────────────
function init() {
  sede = getSedeActual();
  if (!sede) { window.location.href = 'index.html'; return; }

  const carrito = getCarrito();
  if (!carrito.length) { window.location.href = 'menu.html'; return; }

  headerSede.textContent = displayNombre(sede);

  renderResumen();
  cargarBarrios();
  renderTotales();
  setupListeners();
}

// ── RESUMEN ───────────────────────────────────────────────────
function renderResumen() {
  const carrito = getCarrito();
  summaryItems.innerHTML = carrito.map(item => `
    <div class="pw-summary-item">
      <div class="pw-summary-item-info">
        <span class="pw-summary-item-nombre">${item.cantidad}× ${item.nombre}</span>
        <span class="pw-summary-item-opcion">${item.opcion}</span>
        ${item.obs ? `<span class="pw-summary-item-obs">"${item.obs}"</span>` : ''}
      </div>
      <span class="pw-summary-item-precio">${formatPrecio(item.precio * item.cantidad)}</span>
    </div>`).join('');
  summarySubtotal.innerHTML = `<span>Subtotal</span><span>${formatPrecio(getTotal())}</span>`;
  summaryTotalPrev.textContent = formatPrecio(getTotal());
}

// ── BARRIOS ───────────────────────────────────────────────────
function cargarBarrios() {
  const sedeName = sede?.name || '';
  const barrios  = domicilios[sedeName];

  if (!barrios || !Object.keys(barrios).length) {
    // Sede sin tarifas de barrio: ocultar selector, dejar dirección libre
    selBarrio.closest('.pw-form-group').style.display = 'none';
    return;
  }

  const sorted = Object.keys(barrios).sort((a, b) => a.localeCompare(b, 'es'));
  selBarrio.innerHTML = '<option value="">Selecciona tu barrio</option>' +
    sorted.map(b => `<option value="${b}" data-fee="${barrios[b]}">${b} — ${formatPrecio(barrios[b])}</option>`).join('');

  selBarrio.addEventListener('change', () => {
    const opt = selBarrio.options[selBarrio.selectedIndex];
    if (opt.value) {
      domicilioFee = Number(opt.dataset.fee);
      domicilioFeeDiv.style.display = 'flex';
      domicilioFeeVal.textContent = formatPrecio(domicilioFee);
    } else {
      domicilioFee = 0;
      domicilioFeeDiv.style.display = 'none';
    }
    renderTotales();
  });
}

// ── TOTALES ───────────────────────────────────────────────────
function renderTotales() {
  const subtotal = getTotal();
  const total    = subtotal + (tipoEntrega === 'domicilio' ? domicilioFee : 0);

  totalSubtotal.textContent  = formatPrecio(subtotal);
  totalFinal.textContent     = formatPrecio(total);
  summaryTotalPrev.textContent = formatPrecio(total);

  if (tipoEntrega === 'domicilio' && domicilioFee > 0) {
    rowDomicilio.style.display    = '';
    totalDomicilio.textContent    = formatPrecio(domicilioFee);
  } else {
    rowDomicilio.style.display = 'none';
  }
}

// ── LISTENERS ─────────────────────────────────────────────────
function setupListeners() {
  // Acordeón resumen
  summaryToggle.addEventListener('click', () => {
    const open = !summaryBody.hidden;
    summaryBody.hidden = open;
    summaryToggle.setAttribute('aria-expanded', String(!open));
    summaryToggle.querySelector('span:first-child').textContent =
      open ? 'Ver resumen del pedido' : 'Ocultar resumen';
    summaryToggle.querySelector('.pw-summary-chevron').style.transform =
      open ? '' : 'rotate(90deg)';
  });

  // Tipo de entrega
  document.querySelectorAll('.pw-entrega-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pw-entrega-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      tipoEntrega = pill.dataset.tipo;

      if (tipoEntrega === 'domicilio') {
        seccionDomicilio.style.display = '';
        seccionRecoger.style.display   = 'none';
      } else {
        seccionDomicilio.style.display = 'none';
        seccionRecoger.style.display   = '';
        domicilioFee = 0;
        recogerInfo.innerHTML = `
          <p>Pasa a recoger tu pedido en nuestra sede:</p>
          <strong>${displayNombre(sede)}</strong>
          ${sede.direccion ? `<span>${sede.direccion}</span>` : ''}`;
      }
      renderTotales();
    });
  });

  // Método de pago
  document.querySelectorAll('.pw-pago-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pw-pago-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      pagoActivo = pill.dataset.pago;
    });
  });

  // Confirmar
  btnConfirmar.addEventListener('click', confirmarPedido);
}

// ── VALIDACIÓN ────────────────────────────────────────────────
function mostrarError(msg) {
  confirmError.textContent = msg;
  confirmError.style.display = 'block';
  confirmError.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function ocultarError() {
  confirmError.style.display = 'none';
}

function validar() {
  const nombre = inpNombre.value.trim();
  const tel    = inpTel.value.trim();

  if (!nombre) { mostrarError('Por favor ingresa tu nombre.'); inpNombre.focus(); return false; }
  if (!tel || tel.length < 7) { mostrarError('Ingresa un número de teléfono válido.'); inpTel.focus(); return false; }

  if (tipoEntrega === 'domicilio') {
    const dir    = inpDir.value.trim();
    const barrio = selBarrio.value;
    const tieneBarrios = selBarrio.closest('.pw-form-group').style.display !== 'none';
    if (!dir) { mostrarError('Ingresa tu dirección.'); inpDir.focus(); return false; }
    if (tieneBarrios && !barrio) { mostrarError('Selecciona tu barrio.'); selBarrio.focus(); return false; }
  }

  return true;
}

// ── CREAR PEDIDO ──────────────────────────────────────────────
async function confirmarPedido() {
  ocultarError();
  if (!validar()) return;

  btnConfirmar.disabled    = true;
  btnConfirmar.textContent = 'Enviando pedido...';

  try {
    const carrito  = getCarrito();
    const subtotal = getTotal();
    const nombre   = inpNombre.value.trim();
    const tel      = inpTel.value.trim();
    const obs      = inpObs.value.trim();
    const sedeName = sede.name;

    // Obtener número de pedido
    const { data: nPedido, error: rpcError } = await supabase.rpc('siguiente_n_pedido_callcenter');
    if (rpcError) throw new Error('Error obteniendo número de pedido: ' + rpcError.message);

    // Armar productos en formato compatible con pedidos_callcenter
    const productos = carrito.map(item => ({
      nombre: item.opcion ? `${item.nombre} (${item.opcion})` : item.nombre,
      precio: item.precio,
      qty:    item.cantidad,
      obs:    item.obs || '',
    }));

    // Armar domicilio
    let domicilioObj;
    let direccion = '';
    if (tipoEntrega === 'recoger') {
      domicilioObj = { tipo: 'recoger', valor: 0 };
    } else {
      const barrio = selBarrio.value || null;
      domicilioObj = barrio
        ? { barrio, valor: domicilioFee }
        : { valor: domicilioFee };
      direccion = inpDir.value.trim();
    }

    const total = subtotal + (tipoEntrega === 'domicilio' ? domicilioFee : 0);

    const fila = {
      n_pedido:  nPedido,
      nombre,
      telefono:  tel,
      direccion,
      sede:      sedeName,
      pago:      pagoActivo,
      obs,
      asesor:    'web',
      canal:     'web',
      impreso:   false,
      estado:    'pendiente',
      fecha:     new Date().toISOString(),
      productos,
      total,
      domicilio: domicilioObj,
    };

    const { error: insertError } = await supabase
      .from('pedidos_callcenter')
      .insert(fila);

    if (insertError) throw new Error('Error al crear el pedido: ' + insertError.message);

    vaciarCarrito();
    window.location.href = `confirmacion.html?n=${encodeURIComponent(nPedido)}`;

  } catch (err) {
    console.error(err);
    mostrarError('No pudimos procesar tu pedido. Intenta de nuevo.');
    btnConfirmar.disabled    = false;
    btnConfirmar.textContent = 'Confirmar pedido';
  }
}

// ── ARRANCAR ──────────────────────────────────────────────────
init();
