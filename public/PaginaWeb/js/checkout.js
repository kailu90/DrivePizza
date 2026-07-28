/* ============================================================
   Drive Pizza — Checkout
   ============================================================ */

import { supabase } from '../../Api/supabaseConfig.js';
import { getSedeActual, displayNombre } from './sede.js';
import { getCarrito, getTotal, getTotalAdiciones, quitarItem, vaciarCarrito, formatPrecio } from './carrito.js';
import { cargarBarriosSede } from '../../CallCenter/barriosService.js';

// ── ESTADO ────────────────────────────────────────────────────
let tipoEntrega  = 'domicilio';
let pagoActivo   = 'Efectivo';
let domicilioFee = 0;
let sede         = null;
let barrioActual = '';
let barriosCache = {}; // barrios cargados para la sede activa { nombre: valor }

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
const inpTorre         = document.getElementById('inp-torre');
const inpApto          = document.getElementById('inp-apto');
const inpBarrio        = document.getElementById('inp-barrio');
const barrioSuggs      = document.getElementById('barrio-suggs');
const barrioSelecc     = document.getElementById('barrio-selecc');
const barrioNombreEl   = document.getElementById('barrio-selecc-nombre');
const barrioFeeEl      = document.getElementById('barrio-selecc-fee');
const barrioAcWrap     = document.getElementById('barrio-ac-wrap');
const dirWrap          = document.getElementById('dir-wrap');
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
  initBarrioAC();
  renderTotales();
  setupListeners();
}

// ── RESUMEN ───────────────────────────────────────────────────
function renderResumen() {
  const carrito = getCarrito();
  summaryItems.innerHTML = carrito.map((item, idx) => {
    const precioUnitario = item.precio + getTotalAdiciones(item);
    const subtotal = precioUnitario * item.cantidad;
    const formulaHtml = item.cantidad > 1
      ? `<span class="pw-summary-formula">${item.cantidad} × ${formatPrecio(precioUnitario)} = </span>`
      : '';
    return `
    <div class="pw-summary-item">
      <div class="pw-summary-item-header">
        <button class="pw-summary-delete-btn" data-idx="${idx}" aria-label="Eliminar producto">🗑</button>
        <span class="pw-summary-item-nombre">${item.cantidad}× ${item.nombre}</span>
      </div>
      <div class="pw-summary-item-row">
        <span class="pw-summary-item-opcion">${item.opcion}</span>
        <span class="pw-summary-item-base-precio">${formatPrecio(item.precio)}</span>
      </div>
      ${item.adiciones?.length ? item.adiciones.map(a => `
      <div class="pw-summary-item-adicion">
        <span>${a.nombre}</span>
        <span class="pw-summary-adicion-precio">+${formatPrecio(a.precio)}</span>
      </div>`).join('') : ''}
      ${item.obs ? `<div class="pw-summary-item-obs">"${item.obs}"</div>` : ''}
      <div class="pw-summary-item-footer">
        ${formulaHtml}<span class="pw-summary-item-precio">${formatPrecio(subtotal)}</span>
      </div>
    </div>`;
  }).join('');
  summarySubtotal.innerHTML = `<span>Subtotal</span><span>${formatPrecio(getTotal())}</span>`;
  summaryTotalPrev.textContent = formatPrecio(getTotal());

  summaryItems.querySelectorAll('.pw-summary-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      quitarItem(Number(btn.dataset.idx));
      if (!getCarrito().length) { window.location.href = 'menu.html'; return; }
      renderResumen();
      renderTotales();
    });
  });
}

// ── BARRIO AUTOCOMPLETE ────────────────────────────────────────
async function initBarrioAC() {
  const sedeName = sede?.name || '';

  // Cargar barrios de Supabase para esta sede
  let barrios = {};
  try {
    const rows = await cargarBarriosSede(sedeName); // [{ barrio, valor }]
    barrios = Object.fromEntries(rows.map(r => [r.barrio, r.valor]));
  } catch (err) {
    console.error('Error cargando barrios:', err);
  }

  barriosCache = barrios; // disponible para validar() y setupListeners()

  if (!Object.keys(barrios).length) {
    // Sede sin tarifas de barrio: mostrar solo dirección directamente
    barrioAcWrap.style.display = 'none';
    dirWrap.style.display      = '';
    return;
  }

  const sortedBarrios = Object.keys(barrios).sort((a, b) => a.localeCompare(b, 'es'));

  // Precargar desde localStorage si el usuario ya eligió barrio en index.html
  const saved = (() => { try { return JSON.parse(localStorage.getItem('dp_direccion')); } catch { return null; } })();
  if (saved?.barrio && barrios[saved.barrio] !== undefined) {
    seleccionarBarrio(saved.barrio, barrios[saved.barrio]);
    if (saved.direccion) inpDir.value = saved.direccion;
  }

  // Input autocomplete
  inpBarrio.addEventListener('input', () => {
    const q = inpBarrio.value.trim().toLowerCase();
    if (!q) { hideSuggs(); return; }

    const matches = sortedBarrios
      .filter(b => b.toLowerCase().includes(q))
      .slice(0, 8);

    if (!matches.length) { hideSuggs(); return; }

    barrioSuggs.innerHTML = matches.map(b =>
      `<li class="pw-ac-item" data-barrio="${b}" data-fee="${barrios[b]}">
        ${b}<span class="pw-ac-item-fee"> — ${formatPrecio(barrios[b])}</span>
      </li>`
    ).join('');
    barrioSuggs.hidden = false;

    barrioSuggs.querySelectorAll('.pw-ac-item').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault(); // evita que el blur cierre las sugerencias antes del click
        seleccionarBarrio(li.dataset.barrio, Number(li.dataset.fee));
        hideSuggs();
      });
    });
  });

  inpBarrio.addEventListener('blur', () => setTimeout(hideSuggs, 150));

  // "Cambiar barrio"
  document.getElementById('btn-cambiar-barrio').addEventListener('click', () => {
    barrioActual              = '';
    domicilioFee              = 0;
    barrioSelecc.style.display    = 'none';
    barrioAcWrap.style.display    = '';
    dirWrap.style.display         = 'none';
    domicilioFeeDiv.style.display = 'none';
    inpBarrio.value = '';
    renderTotales();
    inpBarrio.focus();
  });
}

function seleccionarBarrio(nombre, fee) {
  barrioActual = nombre;
  domicilioFee = fee;

  barrioNombreEl.textContent    = nombre;
  barrioFeeEl.textContent       = formatPrecio(fee);
  barrioSelecc.style.display    = '';
  barrioAcWrap.style.display    = 'none';
  dirWrap.style.display         = '';
  domicilioFeeDiv.style.display = 'flex';
  domicilioFeeVal.textContent   = formatPrecio(fee);

  renderTotales();
}

function hideSuggs() {
  barrioSuggs.innerHTML = '';
  barrioSuggs.hidden    = true;
}

// ── TOTALES ───────────────────────────────────────────────────
function renderTotales() {
  const subtotal = getTotal();
  const total    = subtotal + (tipoEntrega === 'domicilio' ? domicilioFee : 0);

  totalSubtotal.textContent    = formatPrecio(subtotal);
  totalFinal.textContent       = formatPrecio(total);
  summaryTotalPrev.textContent = formatPrecio(total);

  if (tipoEntrega === 'domicilio' && domicilioFee > 0) {
    rowDomicilio.style.display = '';
    totalDomicilio.textContent = formatPrecio(domicilioFee);
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
        // Restaurar fee si el barrio ya estaba seleccionado
        if (barrioActual) {
          domicilioFee = barriosCache[barrioActual] ?? 0;
        }
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
    const tieneBarrios = Object.keys(barriosCache).length > 0;
    if (tieneBarrios && !barrioActual) {
      mostrarError('Selecciona tu barrio para calcular el domicilio.');
      inpBarrio?.focus();
      return false;
    }
    const dir = inpDir?.value.trim() || '';
    if (!dir) { mostrarError('Ingresa tu dirección.'); inpDir?.focus(); return false; }
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

    // Número de pedido
    const { data: nPedido, error: rpcError } = await supabase.rpc('siguiente_n_pedido_callcenter');
    if (rpcError) throw new Error('Error obteniendo número de pedido: ' + rpcError.message);

    // Productos
    const productos = carrito.map(item => {
      const prod = {
        nombre: item.opcion ? `${item.nombre} (${item.opcion})` : item.nombre,
        precio: item.precio,
        qty:    item.cantidad,
        obs:    item.obs || '',
      };
      if (item.adiciones?.length) {
        prod.adiciones = item.adiciones.map(a => ({ nombre: a.nombre, precio: a.precio, qty: 1 }));
      }
      return prod;
    });

    // Dirección completa (base + complementos)
    const dirBase   = inpDir?.value.trim() || '';
    const torre     = inpTorre?.value.trim() || '';
    const apto      = inpApto?.value.trim() || '';
    const direccion = [dirBase, torre, apto].filter(Boolean).join(', ');

    // Domicilio
    let domicilioObj;
    if (tipoEntrega === 'recoger') {
      domicilioObj = { tipo: 'recoger', valor: 0 };
    } else {
      domicilioObj = barrioActual
        ? { barrio: barrioActual, valor: domicilioFee }
        : { valor: domicilioFee };
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
