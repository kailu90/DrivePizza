/* ============================================================
   Drive Pizza — Checkout Sheet
   ============================================================ */
import { supabase }        from '../../Api/supabaseConfig.js';
import { displayNombre }   from './sede.js';
import { getCarrito, getTotal, getTotalAdiciones, actualizarCantidad, quitarItem, vaciarCarrito, formatPrecio, renderItemHTML } from './carrito.js';
import { cargarBarriosSede } from '../../CallCenter/barriosService.js';
import { normalizarDireccion } from './normalizarDir.js';

// ── ESTADO ────────────────────────────────────────────────────
let _sede            = null;
let _tipoEntrega     = null;
let _tipoHorario     = null;
let _pagoActivo      = null;
let _domicilioFee    = 0;
let _onCarritoChange = null;
let _toppings        = new Set();

// ── ELEMENTOS ─────────────────────────────────────────────────
const coResumen      = document.getElementById('co-resumen-items');
const coNombre       = document.getElementById('co-nombre');
const coTel          = document.getElementById('co-tel');
const coDir          = document.getElementById('co-dir');
const coDirSuggs     = document.getElementById('co-dir-suggs');
const coTorre        = document.getElementById('co-torre');
const coApto         = document.getElementById('co-apto');
const coBarrio       = document.getElementById('co-barrio');       // hidden — valor interno
const coBarrioInput  = document.getElementById('co-barrio-input'); // visible — búsqueda
const coBarrioSuggs  = document.getElementById('co-barrio-suggs'); // dropdown sugerencias
const coBarrioGroup  = document.getElementById('co-barrio-group');
let _barriosData     = {}; // { nombre: fee }
const coDomSec       = document.getElementById('co-seccion-domicilio');
const coRecogerSec   = document.getElementById('co-seccion-recoger');
const coRecogerInfo  = document.getElementById('co-recoger-info');
const coObs          = document.getElementById('co-obs');
const coSubtotal     = document.getElementById('co-subtotal');
const coRowDomicilio = document.getElementById('co-row-domicilio');
const coDomicilioVal = document.getElementById('co-domicilio-val');
const coTotalFinal   = document.getElementById('co-total-final');
const btnConfirmar   = document.getElementById('btn-co-confirmar');

// ── INIT (una vez al cargar la página) ───────────────────────
export function initCheckoutSheet({ onCarritoChange }) {
  _onCarritoChange = onCarritoChange;
  setupFormListeners();
}

// ── OPEN (cada vez que se abre el sheet) ─────────────────────
export async function openCheckoutSheet(sede) {
  _sede         = sede;
  _tipoEntrega  = null;
  _tipoHorario  = null;
  _pagoActivo   = null;
  _domicilioFee = 0;
  _toppings     = new Set();

  // Meta Pixel — InitiateCheckout
  if (typeof fbq !== 'undefined') {
    fbq('track', 'InitiateCheckout', {
      value:     getTotal(),
      currency:  'COP',
      num_items: getCarrito().length,
    });
  }

  document.querySelectorAll('#co-topping-pills .pw-topping-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#co-entrega-pills .pw-entrega-pill').forEach(p => p.classList.remove('active'));
  coDomSec.style.display     = 'none';
  coRecogerSec.style.display = 'none';

  document.querySelectorAll('#co-pago-pills .pw-pago-pill').forEach(p => p.classList.remove('active'));

  // Sección ¿Cuándo lo quieres?
  const horaAgendada = localStorage.getItem('dp_hora_agendada');
  _actualizarCuando(horaAgendada ? 'programado' : 'inmediato', horaAgendada);

  // Chip de pedido programado en header
  const chipEl = document.getElementById('co-hora-agendada');
  const valEl  = document.getElementById('co-hora-val');
  if (chipEl) chipEl.style.display = horaAgendada ? 'flex' : 'none';
  if (valEl && horaAgendada) valEl.textContent = `Entrega ${horaAgendada}`;
  if (chipEl) {
    chipEl.onclick = () => {
      document.dispatchEvent(new CustomEvent('dp:cambiar-hora', { detail: { sede: _sede } }));
    };
  }

  renderItems();
  await cargarBarrios();
  preLlenarDireccion();
  renderTotales();
}

// ── PRE-LLENAR DIRECCIÓN GUARDADA ─────────────────────────────
function preLlenarDireccion() {
  // Limpiar campos extra al abrir
  coDir.value   = '';
  coTorre.value = '';
  coApto.value  = '';

  try {
    const saved = JSON.parse(localStorage.getItem('dp_direccion'));
    if (!saved) return;

    // Activar pill domicilio
    _tipoEntrega = 'domicilio';
    document.querySelectorAll('#co-entrega-pills .pw-entrega-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.tipo === 'domicilio');
    });
    coDomSec.style.display     = '';
    coRecogerSec.style.display = 'none';

    // Precargar barrio si existe en los datos de la sede
    if (saved.barrio && _barriosData[saved.barrio] !== undefined) {
      seleccionarBarrio(saved.barrio, _barriosData[saved.barrio]);
    }

    // Precargar dirección guardada
    if (saved.direccion) coDir.value = saved.direccion;
  } catch { /* ignorar si localStorage falla */ }
}

// ── RENDER ITEMS ──────────────────────────────────────────────
export function renderItems() {
  const carrito = getCarrito();
  coResumen.innerHTML = carrito.map((item, idx) => renderItemHTML(item, idx)).join('');

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

  coResumen.querySelectorAll('.pw-cart-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = Number(btn.dataset.idx);
      const item = getCarrito()[idx];
      document.dispatchEvent(new CustomEvent('dp:editar-item', { detail: { idx, item } }));
    });
  });
}

// ── BARRIOS ───────────────────────────────────────────────────
async function cargarBarrios() {
  try {
    const rows = await cargarBarriosSede(_sede?.name || '');
    _barriosData = Object.fromEntries(rows.map(r => [r.barrio, r.valor]));
  } catch (err) {
    console.error('Error cargando barrios:', err);
    _barriosData = {};
  }

  if (!Object.keys(_barriosData).length) {
    coBarrioGroup.style.display = 'none';
    return;
  }
  coBarrioGroup.style.display = '';
  coBarrio.value          = '';
  coBarrioInput.value     = '';
  coBarrioSuggs.innerHTML = '';
  _domicilioFee           = 0;
}

function filtrarBarrios(query) {
  if (query.length < 3) { coBarrioSuggs.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const matches = Object.keys(_barriosData)
    .filter(b => b.toLowerCase().includes(q))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .slice(0, 8);
  if (!matches.length) { coBarrioSuggs.innerHTML = ''; return; }
  coBarrioSuggs.innerHTML = matches
    .map(b => `<li class="pw-ac-item" data-barrio="${b}" data-fee="${_barriosData[b]}">${b}</li>`)
    .join('');
}

// ── TELÉFONO ──────────────────────────────────────────────────
function normalizarTel(val) {
  let t = val.replace(/[\s\-().]/g, '');
  if (t.startsWith('+57')) t = t.slice(3);
  else if (t.startsWith('57') && t.length > 10) t = t.slice(2);
  return t;
}

// ── TORRE / APTO ──────────────────────────────────────────────
function normalizarTorre(val) {
  const s = val.trim();
  if (!s) return s;
  const m = s.match(/^(bloque|bloq|bl|piso|pis|ps|torre|t)\s*[-.]?\s*([\w\s]*)/i);
  if (m) {
    const raw  = m[1].toLowerCase();
    const tipo = raw.startsWith('bl') ? 'Bloque' : raw.startsWith('p') ? 'Piso' : 'Torre';
    const num  = m[2].trim().toUpperCase();
    return num ? `${tipo} ${num}` : tipo;
  }
  return `Torre ${s.toUpperCase()}`;
}

function normalizarApto(val) {
  const s = val.trim();
  if (!s) return s;
  const m = s.match(/^(apartamento|apto|apt|ap|casa|cs|piso|ps)\s*[.\s-]?\s*(.+)/i);
  if (m) {
    const raw = m[1].toLowerCase();
    const tipo = raw.startsWith('c') ? 'Casa' : raw.startsWith('p') ? 'Piso' : 'Apto';
    return `${tipo} ${m[2].trim().toUpperCase()}`;
  }
  return `Apto ${s.toUpperCase()}`;
}


// ── HISTORIAL DIRECCIÓN ───────────────────────────────────────
const DIR_HIST_KEY = 'dp_dir_historial';

function getDirHistorial() {
  try { return JSON.parse(localStorage.getItem(DIR_HIST_KEY)) || []; }
  catch { return []; }
}

function guardarDirHistorial(dir) {
  if (!dir) return;
  const hist = getDirHistorial().filter(d => d !== dir);
  hist.unshift(dir);
  localStorage.setItem(DIR_HIST_KEY, JSON.stringify(hist.slice(0, 5)));
}

function mostrarDirSuggs(query = '') {
  const hist = getDirHistorial();
  const matches = query.length >= 2
    ? hist.filter(d => d.toLowerCase().includes(query.toLowerCase()))
    : hist;
  if (!matches.length) { coDirSuggs.innerHTML = ''; return; }
  coDirSuggs.innerHTML = matches
    .map(d => `<li class="pw-ac-item" data-dir="${d}">${d}</li>`)
    .join('');
}

function seleccionarBarrio(nombre, fee) {
  coBarrio.value      = nombre;
  coBarrioInput.value = nombre;
  _domicilioFee       = fee;
  coBarrioSuggs.innerHTML = '';
  renderTotales();
}

// ── CUÁNDO ────────────────────────────────────────────────────
function _actualizarCuando(tipo, hora = null) {
  _tipoHorario = tipo;
  document.querySelectorAll('#co-cuando-pills .pw-cuando-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.cuando === tipo);
  });
  const infoEl    = document.getElementById('co-cuando-info');
  const horaEl    = document.getElementById('co-cuando-hora');
  const cambiarEl = document.getElementById('co-cuando-cambiar');
  if (tipo === 'programado') {
    if (infoEl) infoEl.style.display = 'flex';
    if (horaEl) horaEl.textContent = hora ? `Hoy · ${hora}` : 'Elige una hora';
    if (cambiarEl) cambiarEl.style.display = hora ? 'inline' : 'none';
  } else {
    if (infoEl) infoEl.style.display = 'none';
    if (horaEl) horaEl.textContent = 'Elige una hora';
    if (cambiarEl) cambiarEl.style.display = 'none';
  }
  // Chip en header
  const chipEl = document.getElementById('co-hora-agendada');
  const valEl  = document.getElementById('co-hora-val');
  if (chipEl) chipEl.style.display = (tipo === 'programado' && hora) ? 'flex' : 'none';
  if (valEl && hora) valEl.textContent = `Entrega ${hora}`;
}

export function actualizarHoraCuando(hora) {
  localStorage.setItem('dp_hora_agendada', hora);
  _actualizarCuando('programado', hora);
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
  if (btnConfirmar && btnConfirmar.textContent !== 'Enviando pedido...') {
    btnConfirmar.textContent = `Confirmar pedido · ${formatPrecio(total)}`;
  }
}

// ── LISTENERS (una vez) ───────────────────────────────────────
function setupFormListeners() {
  coTel.addEventListener('blur', () => {
    const norm = normalizarTel(coTel.value);
    if (norm) coTel.value = norm;
  });

  const dirFeedback = document.getElementById('co-dir-feedback');
  let _dirFeedbackTimer = null;

  function _mostrarDirFeedback(tipo, texto) {
    clearTimeout(_dirFeedbackTimer);
    dirFeedback.textContent = texto;
    dirFeedback.className = `pw-dir-feedback pw-dir-feedback--${tipo}`;
    requestAnimationFrame(() => dirFeedback.classList.add('pw-dir-feedback--visible'));
    if (tipo === 'ok') {
      _dirFeedbackTimer = setTimeout(() => {
        dirFeedback.classList.remove('pw-dir-feedback--visible');
      }, 3000);
    }
  }

  function _ocultarDirFeedback() {
    clearTimeout(_dirFeedbackTimer);
    dirFeedback.classList.remove('pw-dir-feedback--visible');
  }

  coDir.addEventListener('blur', () => {
    const raw = coDir.value.trim();
    if (!raw) { _ocultarDirFeedback(); return; }
    const { valor, ok, sinVia, esLugar, incompleta } = normalizarDireccion(raw);
    coDir.value = valor;
    if (ok) {
      _mostrarDirFeedback('ok', `✓ Se guardará como: ${valor}`);
    } else if (esLugar || sinVia) {
      _mostrarDirFeedback('warn', `¿Dónde queda "${raw}"? Agrega la calle o carrera. Ej: Calle 50 # 30 - 10, ${raw}`);
    } else if (incompleta) {
      _mostrarDirFeedback('warn', 'Parece incompleta. Ej: Carrera 29 # 50 - 54');
    } else {
      _ocultarDirFeedback();
    }
  });

  coTorre.addEventListener('blur', () => {
    const norm = normalizarTorre(coTorre.value);
    if (norm) coTorre.value = norm;
  });

  coApto.addEventListener('blur', () => {
    const norm = normalizarApto(coApto.value);
    if (norm) coApto.value = norm;
  });

  coDir.addEventListener('focus', () => { if (coDir.value.trim()) mostrarDirSuggs(coDir.value.trim()); });
  coDir.addEventListener('input', () => mostrarDirSuggs(coDir.value.trim()));
  coDirSuggs.addEventListener('mousedown', e => {
    const item = e.target.closest('.pw-ac-item');
    if (!item) return;
    coDir.value = item.dataset.dir;
    coDirSuggs.innerHTML = '';
  });
  coDir.addEventListener('blur', () => setTimeout(() => { coDirSuggs.innerHTML = ''; }, 150));

  coBarrioInput.addEventListener('input', () => {
    coBarrio.value = '';
    _domicilioFee  = 0;
    filtrarBarrios(coBarrioInput.value.trim());
    renderTotales();
  });

  coBarrioSuggs.addEventListener('mousedown', e => {
    const item = e.target.closest('.pw-ac-item');
    if (!item) return;
    seleccionarBarrio(item.dataset.barrio, Number(item.dataset.fee));
  });

  coBarrioInput.addEventListener('blur', () => {
    setTimeout(() => { coBarrioSuggs.innerHTML = ''; }, 150);
  });

  document.querySelectorAll('#co-cuando-pills .pw-cuando-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tipo = pill.dataset.cuando;
      if (tipo === 'inmediato') {
        localStorage.removeItem('dp_hora_agendada');
        _actualizarCuando('inmediato');
      } else {
        const horaActual = localStorage.getItem('dp_hora_agendada');
        if (horaActual) {
          _actualizarCuando('programado', horaActual);
        } else {
          _actualizarCuando('programado', null);
          document.dispatchEvent(new CustomEvent('dp:cambiar-hora', { detail: { sede: _sede } }));
        }
      }
    });
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

  document.querySelectorAll('#co-topping-pills .pw-topping-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const t = pill.dataset.topping;
      if (_toppings.has(t)) {
        _toppings.delete(t);
        pill.classList.remove('active');
      } else {
        _toppings.add(t);
        pill.classList.add('active');
      }
    });
  });

  btnConfirmar.addEventListener('click', confirmarPedido);
}

// ── VALIDACIÓN ────────────────────────────────────────────────
function mostrarErrorCampo(anchorEl, msg) {
  // Eliminar error previo en el mismo anchor
  const prev = anchorEl.parentElement.querySelector('.pw-field-error');
  if (prev) prev.remove();

  const el = document.createElement('div');
  el.className   = 'pw-field-error';
  el.textContent = msg;
  anchorEl.insertAdjacentElement('afterend', el);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Auto-ocultar al terminar la animación de salida (2.5s total)
  setTimeout(() => el.remove(), 2500);
}

const _VIAS_CONOCIDAS = /^(carrera|cra|kr|calle|cl|diagonal|dg|transversal|tv|trs|avenida|av|autopista)/i;

function validar() {
  if (!coNombre.value.trim()) {
    mostrarErrorCampo(coNombre, 'Por favor ingresa tu nombre.');
    coNombre.focus(); return false;
  }

  const tel = normalizarTel(coTel.value);
  if (!tel || tel.length !== 10 || !/^\d{10}$/.test(tel)) {
    mostrarErrorCampo(coTel, 'Ingresa un celular colombiano de 10 dígitos (sin indicativo).');
    coTel.focus(); return false;
  }

  if (!_tipoEntrega) {
    mostrarErrorCampo(document.getElementById('co-entrega-pills'), 'Selecciona cómo quieres recibir tu pedido.');
    return false;
  }

  if (_tipoEntrega === 'domicilio') {
    // Normalizar antes de validar (por si el usuario no salió del campo)
    const { valor: normDir } = normalizarDireccion(coDir.value);
    coDir.value = normDir;
    const dir   = normDir.trim();

    if (!dir) {
      mostrarErrorCampo(coDir, 'Ingresa tu dirección.');
      coDir.focus(); return false;
    }
    if (_VIAS_CONOCIDAS.test(dir) && (!dir.includes('#') || !dir.includes('-'))) {
      mostrarErrorCampo(coDir, 'La dirección parece incompleta. Ej: Carrera 25 # 50-48');
      coDir.focus(); return false;
    }
    if (coTorre.value.trim() && !coApto.value.trim()) {
      mostrarErrorCampo(coApto, 'Indica el Apto o Casa para la Torre / Bloque / Piso ingresado.');
      coApto.focus(); return false;
    }
    if (coBarrioGroup.style.display !== 'none' && !coBarrio.value) {
      mostrarErrorCampo(coBarrioInput, 'Selecciona tu barrio de la lista.');
      coBarrioInput.focus(); return false;
    }
  }

  if (!_pagoActivo) {
    mostrarErrorCampo(document.getElementById('co-pago-pills'), 'Selecciona el método de pago.');
    return false;
  }
  return true;
}

// ── CREAR PEDIDO ──────────────────────────────────────────────
async function confirmarPedido() {
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
      const partes = [normalizarDireccion(coDir.value).valor];
      if (coTorre.value.trim()) partes.push(coTorre.value.trim());
      if (coApto.value.trim())  partes.push(coApto.value.trim());
      direccion = partes.join(', ');
    }

    const total = subtotal + (_tipoEntrega === 'domicilio' ? _domicilioFee : 0);

    const obsCliente = coObs.value.trim();

    const { error: insertError } = await supabase.from('pedidos_callcenter').insert({
      n_pedido:        nPedido,
      nombre:          coNombre.value.trim(),
      telefono:        normalizarTel(coTel.value),
      direccion,
      sede:            _sede.name,
      pago:            _pagoActivo,
      obs:             obsCliente,
      acompanamientos: _toppings.size ? [..._toppings].join(', ') : null,
      asesor:        'web',
      canal:         'web',
      impreso:       false,
      estado:        'pendiente',
      fecha:         new Date().toISOString(),
      productos,
      total,
      domicilio:     domicilioObj,
      hora_agendada: localStorage.getItem('dp_hora_agendada') || null,
    });
    if (insertError) throw new Error(insertError.message);

    guardarDirHistorial(coDir.value.trim());
    localStorage.setItem('dp_nombre', coNombre.value.trim());
    localStorage.setItem('dp_telefono', coTel.value.replace(/\D/g, '').slice(-10));
    localStorage.removeItem('dp_hora_agendada');
    vaciarCarrito();
    window.location.href = `confirmacion.html?n=${encodeURIComponent(nPedido)}`;

  } catch (err) {
    console.error(err);
    mostrarErrorCampo(btnConfirmar, 'No pudimos procesar tu pedido. Intenta de nuevo.');
    btnConfirmar.disabled    = false;
    btnConfirmar.textContent = 'Confirmar pedido';
  }
}
