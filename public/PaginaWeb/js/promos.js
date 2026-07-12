/* ============================================================
   Drive Pizza — Promociones (PaginaWeb)
   Portado de CallCenter/app.js — usa pw-sheet en vez de modal
   ============================================================ */

import { menuData, TAMANOS_CON_BORDE } from './menuData.js';
import { formatPrecio } from './carrito.js';

// ── CONFIGURACIÓN ─────────────────────────────────────────────
const TAMANOS_MIXABLES = TAMANOS_CON_BORDE;
const SABORES_GAS_400  = ['Pepsi', 'Colombiana', 'Manzana', 'Piña', 'Kola', 'Uva', '7 up', 'naranja'];
const SABORES_GAS_1500 = ['Pepsi', 'Colombiana', 'Manzana', 'Piña', 'Kola', 'Uva', '7 up'];
const SABORES_KIT      = ['Hawaiana', 'Tres Carnes', 'Jamón', 'Pepperoni', 'Pollo'];

const PROMO3X2_OBQ_PIZZAS       = ['Hawaiana', 'Tres Carnes'];
const PROMO3X2_OBQ_ENSALADAS    = ['Ensalada Cesar'];
const PROMO3X2_OBQ_LASAÑAS      = ['Lasaña Sencilla'];
const PROMO3X2_OBQ_CALZONES     = ['Calzone Hawaiana', 'Calzone Tres Carnes'];
const PROMO3X2_PASTAS_EXCLUIDAS = ['Pasta Carbonara', 'Pasta Pesto Camaron', 'Pasta Matriziana', 'Pasta Marinera'];
const PROMO3X2_OBQ_PASTAS       = ['Pasta Spaguetti Sencillo'];
const PROMO3X2_OBQ_HAMBURGUESAS = ['hamburguesa Clasica'];
const PROMO3X2_OBQ_SANDWICHES   = ['Sandwiche Jamon'];

const PROMO48K_EXC_LASAÑAS = ['Lasaña Drive', 'Lasaña Vegetariana'];
const PROMO48K_EXC_PASTAS  = ['Pasta Carbonara', 'Pasta Alfredo', 'Pasta Pesto Camaron', 'Pasta Matriziana', 'Pasta Marinera'];

// ── ESTADO INYECTADO DESDE menu.js ────────────────────────────
let _pushItem      = null;
let _renderCarrito = null;
let _abrirSheet    = null;
let _cerrarSheet   = null;
let _promoSheet    = null;

export function initPromos({ pushItem, renderCarrito, abrirSheet, cerrarSheet, promoSheet }) {
  _pushItem      = pushItem;
  _renderCarrito = renderCarrito;
  _abrirSheet    = abrirSheet;
  _cerrarSheet   = cerrarSheet;
  _promoSheet    = promoSheet;
}

// ── CARDS DE PROMOCIONES ───────────────────────────────────────
export function getPromosHTML() {
  const esMartes = new Date().getDay() === 2;
  const promos = [
    {
      id: 'p3x2', badge: 'MARTES', titulo: '3 × 2',
      desc: 'Lleva 3 del mismo tamaño, paga solo 2.',
      detalle: esMartes ? 'Pizzas · Lasañas · Ensaladas · Calzones' : 'Disponible solo los martes',
      inactiva: !esMartes,
    },
    { id: 'p65k',     badge: 'PROMO', titulo: '65K', desc: 'Pizza Grande + Gaseosa 1.5 lts',                         detalle: 'Clásica · Típica' },
    { id: 'p48k',     badge: 'PROMO', titulo: '48K', desc: '2 Lasañas o 2 Espaguettis<br>+ 2 Gaseosas 250 ml' },
    { id: 'p28k',     badge: 'PROMO', titulo: '28K', desc: 'Pizza Pepperoni<br>6 porciones · 30 cm' },
    { id: 'kit25k',   badge: 'PROMO', titulo: '25K', desc: 'Kit Pizzeritos<br>5 sabores disponibles' },
    { id: 'combo99k', badge: 'PROMO', titulo: '99K', desc: 'Combo La 10<br>Pizza Grande Criolla + 6 Cervezas Heineken' },
  ];

  return promos.map(({ id, badge, titulo, desc, detalle, inactiva }) => `
    <div class="pw-promo-card${inactiva ? ' pw-promo-card--inactiva' : ''}"
         data-promo="${inactiva ? '' : id}" role="button" tabindex="${inactiva ? '-1' : '0'}">
      <span class="pw-promo-badge">${badge}</span>
      <div class="pw-promo-titulo">${titulo}</div>
      <div class="pw-promo-desc">${desc}</div>
      ${detalle ? `<div class="pw-promo-detalle">${detalle}</div>` : ''}
    </div>`).join('');
}

export function setupPromoListeners(container) {
  container.querySelectorAll('.pw-promo-card[data-promo]').forEach(card => {
    const id = card.dataset.promo;
    if (!id) return;
    const abrir = () => {
      switch (id) {
        case 'p28k':     return _abrirPromo28K();
        case 'combo99k': return _abrirCombo99K();
        case 'p65k':     return _abrirPromo65K();
        case 'p48k':     return _abrirPromo48K();
        case 'kit25k':   return _abrirPromoKit();
        case 'p3x2':     return _abrirPromo3x2();
      }
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });
}

// ── HELPERS DE SHEET ──────────────────────────────────────────
function _open()  { _abrirSheet(_promoSheet); }
function _close() { _cerrarSheet(_promoSheet); }

function _set({ stepbar = '', titulo = '', subtitulo = '', content = '' }) {
  document.getElementById('promo-stepbar').innerHTML   = stepbar;
  document.getElementById('promo-titulo').textContent  = titulo;
  document.getElementById('promo-subtitulo').innerHTML = subtitulo;
  document.getElementById('promo-content').innerHTML   = content;
}

function _stepbar(labels, activo) {
  return labels.map((lbl, i) => {
    const n      = i + 1;
    const color  = n === activo ? 'var(--dp-green)' : n < activo ? '#555' : '#ccc';
    const weight = n === activo ? '700' : '400';
    return `<span style="color:${color};font-weight:${weight};">${lbl}</span>`;
  }).join('<span class="pw-promo-step-sep">›</span>');
}

function _renderOpciones(items) {
  return `<div class="pw-promo-opciones">
    ${items.map(({ id, label }) =>
      `<button class="pw-promo-opcion-btn" data-id="${id}">${label}</button>`
    ).join('')}
  </div>`;
}

function _renderGrid(productos, tamanoFijo) {
  if (!productos.length) return '<p class="pw-promo-vacio">No se encontraron productos.</p>';
  return productos.map(p => {
    const precios = Object.values(p.opciones || {});
    const precio  = tamanoFijo && p.opciones?.[tamanoFijo] !== undefined
      ? formatPrecio(p.opciones[tamanoFijo])
      : precios.length > 1
        ? 'Desde ' + formatPrecio(Math.min(...precios))
        : formatPrecio(precios[0] ?? 0);
    return `<button class="pw-promo-grid-btn" data-nombre="${p.nombre}" data-cat="${p.categoriaPromo || ''}">
      <span class="pw-promo-grid-nombre">${p.nombre}</span>
      <span class="pw-promo-grid-precio">${precio}</span>
    </button>`;
  }).join('');
}

// ── PROMO 28K ─────────────────────────────────────────────────
function _abrirPromo28K() {
  _pushItem({ nombre: 'Pizza Pepperoni 6 Porciones', opcion: 'Unidad', precio: 28000, cantidad: 1, esPromoPepperoni: true });
  localStorage.setItem('dp_promoPepperoni_obs', 'PROMO PEPPERONI 28K');
  _renderCarrito();
}

// ── COMBO 99K ─────────────────────────────────────────────────
function _abrirCombo99K() {
  _pushItem({ nombre: 'Combo La 10 - Pizza Grande Criolla + 6 Cervezas Heineken', opcion: 'Unidad', precio: 99000, cantidad: 1 });
  _renderCarrito();
}

// ── PROMO KIT 25K ─────────────────────────────────────────────
function _abrirPromoKit() {
  _set({
    titulo: 'Kit Pizzeritos · 25K',
    subtitulo: 'Elige el sabor',
    content: _renderOpciones(SABORES_KIT.map(s => ({ id: s, label: s }))),
  });
  _open();
  setTimeout(() => {
    document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _pushItem({ nombre: `Kit Pizzeritos - ${btn.dataset.id}`, opcion: 'Unidad', precio: 25000, cantidad: 1, esPromoKit: true });
        localStorage.setItem('dp_promoKit_obs', 'KIT PIZZERITOS 25K');
        _close(); _renderCarrito();
      });
    });
  }, 50);
}

// ── PROMO 65K ─────────────────────────────────────────────────
let _s65 = null;

function _abrirPromo65K() {
  _s65 = { step: 1, pizza: null, mezcla: false, sabor1: null };
  _render65K();
  _open();
}

function _render65K() {
  const s = _s65;
  const steps = _stepbar(['1. Pizza Grande', '2. Gaseosa 1.5 lts'], s.step);

  if (s.step === 1) {
    const clasicas = (menuData['Pizzas Clásicas'] || []).map(p => ({ nombre: p.nombre, tipo: 'Clásica' }));
    const tipicas  = (menuData['Pizzas Típicas']  || []).map(p => ({ nombre: p.nombre, tipo: 'Típica' }));
    let todas = [...clasicas, ...tipicas];
    if (s.mezcla && s.sabor1) todas = todas.filter(p => p.nombre !== s.sabor1);

    const banner = s.mezcla && s.sabor1
      ? `<div class="pw-promo-sabor1-banner">½ <strong>${s.sabor1}</strong> + ½ …
           <button class="pw-promo-sabor1-quitar" id="btn-p65k-quitar">✕ Cambiar</button></div>`
      : '';

    const sub = s.mezcla && s.sabor1
      ? 'Elige la segunda mitad'
      : s.mezcla ? 'Elige la primera mitad' : 'Elige el sabor de la pizza';

    _set({
      stepbar: steps,
      titulo: 'Combo 65K',
      subtitulo: sub,
      content: `
        <div class="pw-promo-search-row">
          <input class="pw-promo-buscar" id="promo-buscar" type="text" placeholder="Buscar pizza..." autocomplete="off">
          <button class="pw-promo-mezcla-btn${s.mezcla ? ' activo' : ''}" id="btn-p65k-mezcla">½+½</button>
        </div>
        ${banner}
        <div class="pw-promo-grid" id="p65k-grid">${_render65KRow(todas)}</div>`,
    });

    setTimeout(() => {
      document.getElementById('btn-p65k-mezcla')?.addEventListener('click', () => {
        s.mezcla = !s.mezcla; s.sabor1 = null;
        document.getElementById('promo-buscar').value = '';
        _render65K();
      });
      document.getElementById('btn-p65k-quitar')?.addEventListener('click', () => {
        s.sabor1 = null;
        document.getElementById('promo-buscar').value = '';
        _render65K();
      });
      document.getElementById('promo-buscar')?.addEventListener('input', function () {
        const clasicas2 = (menuData['Pizzas Clásicas'] || []).map(p => ({ nombre: p.nombre, tipo: 'Clásica' }));
        const tipicas2  = (menuData['Pizzas Típicas']  || []).map(p => ({ nombre: p.nombre, tipo: 'Típica' }));
        let t = [...clasicas2, ...tipicas2];
        if (s.mezcla && s.sabor1) t = t.filter(p => p.nombre !== s.sabor1);
        const q = this.value.toLowerCase();
        document.getElementById('p65k-grid').innerHTML = _render65KRow(q ? t.filter(p => p.nombre.toLowerCase().includes(q)) : t);
        _setup65K();
      });
      _setup65K();
    }, 50);

  } else {
    _set({
      stepbar: steps,
      titulo: 'Combo 65K',
      subtitulo: `Pizza ${s.pizza} · Elige el sabor de la gaseosa`,
      content: _renderOpciones(SABORES_GAS_1500.map(sb => ({ id: sb, label: sb }))),
    });
    setTimeout(() => {
      document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const now = Date.now();
          _pushItem({ nombre: `Pizza Grande ${s.pizza}`,      opcion: 'Grande', precio: 65000, cantidad: 1, esPromo65k: true, promoId65k: now });
          _pushItem({ nombre: `Gaseosa 1.5 lts ${btn.dataset.id}`, opcion: 'Unidad', precio: 0, cantidad: 1, esPromo65k: true, esGaseosa65k: true, promoId65k: now });
          localStorage.setItem('dp_promo65k_obs', 'PROMO 65K');
          _close(); _renderCarrito();
        });
      });
    }, 50);
  }
}

function _render65KRow(pizzas) {
  if (!pizzas.length) return '<p class="pw-promo-vacio">No se encontraron pizzas.</p>';
  return pizzas.map(p => `
    <button class="pw-promo-grid-btn" data-nombre="${p.nombre}" data-tipo="${p.tipo || ''}">
      <span class="pw-promo-grid-nombre">${p.nombre}</span>
      <span class="pw-promo-grid-precio">${p.tipo || ''}</span>
    </button>`).join('');
}

function _setup65K() {
  const s = _s65;
  document.querySelectorAll('#p65k-grid .pw-promo-grid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (s.mezcla) {
        if (!s.sabor1) { s.sabor1 = btn.dataset.nombre; document.getElementById('promo-buscar').value = ''; _render65K(); }
        else           { s.pizza = `${s.sabor1} y mitad ${btn.dataset.nombre}`; s.step = 2; _render65K(); }
      } else {
        s.pizza = btn.dataset.nombre; s.step = 2; _render65K();
      }
    });
  });
}

// ── PROMO 48K ─────────────────────────────────────────────────
let _s48 = null;

function _abrirPromo48K() {
  _s48 = { step: 0, categoria: null, prod1: null, prod2: null, gaseosa1: null };
  _render48K();
  _open();
}

function _get48Prods(cat) {
  if (cat === 'Lasañas') return (menuData['Lasañas'] || []).filter(p => !PROMO48K_EXC_LASAÑAS.includes(p.nombre)).map(p => ({ ...p, categoriaPromo: 'Lasañas' }));
  return (menuData['Pastas'] || []).filter(p => !PROMO48K_EXC_PASTAS.includes(p.nombre)).map(p => ({ ...p, categoriaPromo: 'Espaguetti' }));
}

function _render48K() {
  const s     = _s48;
  const steps = _stepbar(['1. Prod 1', '2. Prod 2', '3. Gaseosa 1', '4. Gaseosa 2'], Math.max(s.step, 1));

  if (s.step === 0) {
    _set({
      titulo: 'Promo 48K',
      subtitulo: '¿Lasañas o Espaguetti?',
      content: _renderOpciones(['Lasañas', 'Espaguetti'].map(c => ({ id: c, label: c }))),
    });
    setTimeout(() => {
      document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(btn => {
        btn.addEventListener('click', () => { s.categoria = btn.dataset.id; s.step = 1; _render48K(); });
      });
    }, 50);
    return;
  }

  if (s.step >= 3) {
    const numG = s.step === 3 ? 1 : 2;
    _set({
      stepbar: steps,
      titulo: 'Promo 48K',
      subtitulo: `Elige el sabor de la gaseosa ${numG}`,
      content: _renderOpciones(SABORES_GAS_400.map(sb => ({ id: sb, label: sb }))),
    });
    setTimeout(() => {
      document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (s.step === 3) { s.gaseosa1 = btn.dataset.id; s.step = 4; _render48K(); }
          else {
            const now = Date.now();
            _pushItem({ nombre: s.prod1.nombre,         opcion: 'Unidad', precio: 48000, cantidad: 1, esPromoLasEsp: true, promoIdLasEsp: now });
            _pushItem({ nombre: s.prod2.nombre,         opcion: 'Unidad', precio: 0,     cantidad: 1, esPromoLasEsp: true, esExtra48k: true, promoIdLasEsp: now });
            _pushItem({ nombre: `Gaseosa ${s.gaseosa1}`,opcion: 'Unidad', precio: 0,     cantidad: 1, esPromoLasEsp: true, promoIdLasEsp: now });
            _pushItem({ nombre: `Gaseosa ${btn.dataset.id}`,opcion:'Unidad',precio:0,    cantidad: 1, esPromoLasEsp: true, promoIdLasEsp: now });
            localStorage.setItem('dp_promoLasEsp_obs', `PROMO 48K - ${s.categoria}`);
            _close(); _renderCarrito();
          }
        });
      });
    }, 50);
    return;
  }

  const productos = _get48Prods(s.categoria);
  _set({
    stepbar: steps,
    titulo: 'Promo 48K',
    subtitulo: `${s.categoria} · Elige el ${s.step === 1 ? 'primer' : 'segundo'} producto`,
    content: `
      <input class="pw-promo-buscar" id="promo-buscar" type="text" placeholder="Buscar..." autocomplete="off">
      <div class="pw-promo-grid" id="p48k-grid">${_renderGrid(productos, null)}</div>`,
  });

  setTimeout(() => {
    document.getElementById('promo-buscar')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      const prods = _get48Prods(s.categoria);
      document.getElementById('p48k-grid').innerHTML = _renderGrid(q ? prods.filter(p => p.nombre.toLowerCase().includes(q)) : prods, null);
      _setup48K();
    });
    _setup48K();
  }, 50);
}

function _setup48K() {
  const s = _s48;
  const productos = _get48Prods(s.categoria);
  document.querySelectorAll('#p48k-grid .pw-promo-grid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prod = productos.find(p => p.nombre === btn.dataset.nombre);
      if (!prod) return;
      const opc = Object.keys(prod.opciones || {});
      if (opc.length === 1) { _confirmar48K(prod, opc[0], prod.opciones[opc[0]]); return; }
      _set({
        titulo: prod.nombre,
        subtitulo: 'Elige la proteína',
        content: _renderOpciones(opc.map(v => ({ id: `${v}|||${prod.nombre}|||${prod.opciones[v]}`, label: `${v} · ${formatPrecio(prod.opciones[v])}` }))),
      });
      setTimeout(() => {
        document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(vb => {
          vb.addEventListener('click', () => {
            const [variante, nombre, precio] = vb.dataset.id.split('|||');
            _confirmar48K({ nombre }, variante, Number(precio));
          });
        });
      }, 50);
    });
  });
}

function _confirmar48K(prod, variante, precio) {
  const s = _s48;
  const nombre = variante === 'Unidad' ? prod.nombre : `${prod.nombre} (${variante})`;
  if (s.step === 1) { s.prod1 = { nombre, precio }; s.step = 2; _render48K(); }
  else              { s.prod2 = { nombre, precio }; s.step = 3; _render48K(); }
}

// ── PROMO 3×2 ─────────────────────────────────────────────────
let _s3x2 = null;

function _getProds3x2() {
  const pizzas = ['Pizzas Super Estofadas', 'Pizzas Estofadas', 'Pizzas Especiales', 'Pizzas Clásicas', 'Pizzas Típicas'];
  return {
    'Pizzas':       pizzas.flatMap(k => (menuData[k] || []).map(p => ({ ...p, categoriaPromo: 'Pizzas' }))),
    'Calzones':     (menuData['Calzones']     || []).map(p => ({ ...p, categoriaPromo: 'Calzones' })),
    'Stromboli':    (menuData['Stromboli']    || []).map(p => ({ ...p, categoriaPromo: 'Stromboli' })),
    'Lasañas':      (menuData['Lasañas']      || []).map(p => ({ ...p, categoriaPromo: 'Lasañas' })),
    'Pastas':       (menuData['Pastas']       || []).map(p => ({ ...p, categoriaPromo: 'Pastas' })),
    'Maicitos':     (menuData['Maicitos']     || []).map(p => ({ ...p, categoriaPromo: 'Maicitos' })),
    'Hamburguesas': (menuData['Hamburguesas'] || []).map(p => ({ ...p, categoriaPromo: 'Hamburguesas' })),
    'Sandwiches':   (menuData['Sandwiches']   || []).map(p => ({ ...p, categoriaPromo: 'Sandwiches' })),
    'Ensaladas':    (menuData['Ensaladas']    || []).map(p => ({ ...p, categoriaPromo: 'Ensaladas' })),
  };
}

function _flat3x2(tamanoFijo, soloCategoria) {
  const s = _s3x2;
  const esObsequio = s?.step === 3;
  let todos = [];
  Object.entries(_getProds3x2()).forEach(([cat, prods]) => {
    if (soloCategoria && cat !== soloCategoria) return;
    const ignorar = ['Lasañas', 'Pastas', 'Hamburguesas', 'Sandwiches'].includes(cat);
    let f = (tamanoFijo && !ignorar) ? prods.filter(p => p.opciones?.[tamanoFijo] !== undefined) : prods;
    if (esObsequio && cat === 'Pizzas')       f = f.filter(p => PROMO3X2_OBQ_PIZZAS.includes(p.nombre));
    if (esObsequio && cat === 'Ensaladas')    f = f.filter(p => PROMO3X2_OBQ_ENSALADAS.includes(p.nombre));
    if (esObsequio && cat === 'Lasañas')      f = f.filter(p => PROMO3X2_OBQ_LASAÑAS.includes(p.nombre));
    if (esObsequio && cat === 'Calzones')     f = f.filter(p => PROMO3X2_OBQ_CALZONES.includes(p.nombre));
    if (cat === 'Pastas') {
      f = f.filter(p => !PROMO3X2_PASTAS_EXCLUIDAS.includes(p.nombre));
      if (esObsequio) f = f.filter(p => PROMO3X2_OBQ_PASTAS.includes(p.nombre));
    }
    if (esObsequio && cat === 'Hamburguesas') f = f.filter(p => PROMO3X2_OBQ_HAMBURGUESAS.includes(p.nombre));
    if (esObsequio && cat === 'Sandwiches')   f = f.filter(p => PROMO3X2_OBQ_SANDWICHES.includes(p.nombre));
    todos = [...todos, ...f];
  });
  return todos;
}

function _abrirPromo3x2() {
  _s3x2 = { step: 0 };
  _render3x2();
  _open();
}

function _render3x2() {
  const s = _s3x2;
  const steps = _stepbar(['1. Prod 1', '2. Prod 2', '3. Obsequio'], Math.max(s.step, 1));

  if (s.step === 0) {
    _set({
      titulo: '3 × 2 Martes',
      subtitulo: 'Selecciona la categoría para empezar',
      content: _renderOpciones(
        ['Pizzas', 'Calzones', 'Lasañas', 'Pastas', 'Maicitos', 'Hamburguesas', 'Stromboli', 'Sandwiches', 'Ensaladas']
          .map(c => ({ id: c, label: c }))
      ),
    });
    setTimeout(() => {
      document.querySelectorAll('#promo-content .pw-promo-opcion-btn').forEach(btn => {
        btn.addEventListener('click', () => { s.categoriaSeleccionada = btn.dataset.id; s.step = 1; _render3x2(); });
      });
    }, 50);
    return;
  }

  const tamanoFijo    = s.prod1?.tamano || null;
  const soloCategoria = s.prod1?.categoriaPromo || s.categoriaSeleccionada;
  const todos         = _flat3x2(tamanoFijo, soloCategoria);
  const subtitulo     = s.step === 2
    ? `Mismo tamaño: <strong>${s.prod1?.tamano}</strong> · Elige el 2° producto`
    : s.step === 3 ? 'Elige tu producto de obsequio 🎁'
    : `${s.categoriaSeleccionada} · Elige el 1° producto`;

  _set({
    stepbar: steps,
    titulo: '3 × 2 Martes',
    subtitulo,
    content: `
      <input class="pw-promo-buscar" id="promo-buscar" type="text" placeholder="Buscar..." autocomplete="off">
      <div class="pw-promo-grid" id="p3x2-grid">${_renderGrid(todos, tamanoFijo)}</div>`,
  });

  setTimeout(() => {
    document.getElementById('promo-buscar')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      document.getElementById('p3x2-grid').innerHTML = _renderGrid(q ? todos.filter(p => p.nombre.toLowerCase().includes(q)) : todos, tamanoFijo);
      _setup3x2(tamanoFijo);
    });
    _setup3x2(tamanoFijo);
  }, 50);
}

function _setup3x2(tamanoFijo) {
  document.querySelectorAll('#p3x2-grid .pw-promo-grid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat    = btn.dataset.cat;
      const nombre = btn.dataset.nombre;
      const prod   = _getProds3x2()[cat]?.find(p => p.nombre === nombre);
      if (!prod) return;
      _click3x2(prod, tamanoFijo);
    });
  });
}

function _click3x2(prod, tamanoFijo) {
  const siemprePicker = ['Hamburguesas'].includes(prod.categoriaPromo);
  if (tamanoFijo && !siemprePicker && prod.opciones?.[tamanoFijo] !== undefined) {
    _confirmar3x2(prod, tamanoFijo, prod.opciones[tamanoFijo]); return;
  }
  const opc = Object.keys(prod.opciones || {});
  if (opc.length === 1) { _confirmar3x2(prod, opc[0], prod.opciones[opc[0]]); return; }

  // Múltiples tamaños → picker
  _set({
    titulo: prod.nombre,
    subtitulo: 'Elige el tamaño',
    content: `<div class="pw-promo-opciones">
      ${opc.map(tam => {
        const mixable = TAMANOS_MIXABLES.has(tam);
        return `<div class="pw-promo-tam-row">
          <button class="pw-promo-opcion-btn" data-tam="${tam}" data-pre="${prod.opciones[tam]}" data-nombre="${prod.nombre}" data-cat="${prod.categoriaPromo}">
            ${tam} · ${formatPrecio(prod.opciones[tam])}
          </button>
          ${mixable ? `<button class="pw-promo-mezcla-mini" data-tam="${tam}" data-pre="${prod.opciones[tam]}" data-nombre="${prod.nombre}" title="½+½">½+½</button>` : ''}
        </div>`;
      }).join('')}
    </div>`,
  });

  setTimeout(() => {
    document.querySelectorAll('.pw-promo-opcion-btn[data-tam]').forEach(btn => {
      btn.addEventListener('click', () => _confirmar3x2(prod, btn.dataset.tam, Number(btn.dataset.pre)));
    });
    document.querySelectorAll('.pw-promo-mezcla-mini').forEach(btn => {
      btn.addEventListener('click', () => _mezcla3x2(prod, btn.dataset.tam));
    });
  }, 50);
}

function _mezcla3x2(sabor1, tam) {
  const precio1 = sabor1.opciones[tam];
  const todas   = _flat3x2(tam, 'Pizzas').filter(p => p.nombre !== sabor1.nombre);

  _set({
    titulo: `½ ${sabor1.nombre}`,
    subtitulo: `${tam} · Elige la 2ª mitad`,
    content: `
      <input class="pw-promo-buscar" id="promo-buscar" type="text" placeholder="Buscar 2ª mitad..." autocomplete="off">
      <div class="pw-promo-grid" id="p3x2-mix-grid">${_renderMixGrid(todas, tam, precio1)}</div>`,
  });

  setTimeout(() => {
    document.getElementById('promo-buscar')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      document.getElementById('p3x2-mix-grid').innerHTML = _renderMixGrid(q ? todas.filter(p => p.nombre.toLowerCase().includes(q)) : todas, tam, precio1);
      _setupMix(sabor1, tam, precio1);
    });
    _setupMix(sabor1, tam, precio1);
  }, 50);
}

function _renderMixGrid(pizzas, tam, precio1) {
  if (!pizzas.length) return '<p class="pw-promo-vacio">No se encontraron pizzas.</p>';
  return pizzas.map(p => {
    const p2 = p.opciones[tam] ?? precio1;
    return `<button class="pw-promo-grid-btn" data-nombre="${p.nombre}" data-precio2="${p2}">
      <span class="pw-promo-grid-nombre">${p.nombre}</span>
      <span class="pw-promo-grid-precio">${formatPrecio(Math.max(precio1, p2))}</span>
    </button>`;
  }).join('');
}

function _setupMix(sabor1, tam, precio1) {
  document.querySelectorAll('#p3x2-mix-grid .pw-promo-grid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const precioFinal = Math.max(precio1, Number(btn.dataset.precio2));
      _confirmar3x2({ nombre: `${sabor1.nombre} y mitad ${btn.dataset.nombre}`, opciones: { [tam]: precioFinal }, categoriaPromo: 'Pizzas' }, tam, precioFinal);
    });
  });
}

function _confirmar3x2(prod, tamano, precio) {
  const s = _s3x2;
  const nombreCompleto = `${prod.nombre} (${tamano})`;
  if (s.step === 1) {
    s.prod1 = { nombre: nombreCompleto, tamano, precio, categoriaPromo: prod.categoriaPromo };
    s.step = 2; _render3x2();
  } else if (s.step === 2) {
    s.prod2 = { nombre: nombreCompleto, precio };
    s.step = 3; _render3x2();
  } else {
    const now = Date.now();
    _pushItem({ nombre: s.prod1.nombre,        opcion: s.prod1.tamano, precio: s.prod1.precio, cantidad: 1, esPromo3x2: true, promoId: now });
    _pushItem({ nombre: s.prod2.nombre,        opcion: s.prod1.tamano, precio: s.prod2.precio, cantidad: 1, esPromo3x2: true, promoId: now });
    _pushItem({ nombre: `Obsequio: ${nombreCompleto}`, opcion: s.prod1.tamano, precio: 0, cantidad: 1, esPromo3x2: true, esObsequio3x2: true, promoId: now });
    const ant = localStorage.getItem('dp_promo3x2_obs') || '';
    const nuevo = `Obsequio ${prod.nombre} (${tamano})`;
    localStorage.setItem('dp_promo3x2_obs', ant ? `${ant} | ${nuevo}` : `PROMO 3X2 - ${nuevo}`);
    _close(); _renderCarrito();
  }
}
