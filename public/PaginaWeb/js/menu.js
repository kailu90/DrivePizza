/* ============================================================
   Drive Pizza — Menú y carrito
   ============================================================ */

import { getSedeActual, estaAbierta, formatHorario, displayNombre } from './sede.js';
import { agregarItem, actualizarCantidad, getCarrito, getTotal, getConteo, formatPrecio } from './carrito.js';
import { menuData } from './menuData.js';

// ── ESTADO ────────────────────────────────────────────────────
let productoActivo = null;
let cantActual     = 1;
let opcionActiva   = null;

// ── ELEMENTOS ─────────────────────────────────────────────────
const headerSede       = document.getElementById('header-sede');
const catsNav          = document.getElementById('cats-nav');
const menuBody         = document.getElementById('menu-body');
const closedBanner     = document.getElementById('closed-banner');
const closedMsg        = document.getElementById('closed-msg');
const overlay          = document.getElementById('overlay');
const productSheet     = document.getElementById('product-sheet');
const cartSheet        = document.getElementById('cart-sheet');
const cartBar          = document.getElementById('cart-bar');
const cartBadge        = document.getElementById('cart-badge');
const cartBarItems     = document.getElementById('cart-bar-items');
const cartBarTotal     = document.getElementById('cart-bar-total');
const sheetNombre      = document.getElementById('sheet-nombre');
const sheetDesc        = document.getElementById('sheet-desc');
const sheetOpcionesWrap= document.getElementById('sheet-opciones-wrap');
const sheetOpciones    = document.getElementById('sheet-opciones');
const cantNum          = document.getElementById('cant-num');
const sheetObs         = document.getElementById('sheet-obs');
const btnAgregar       = document.getElementById('btn-agregar');

// ── INIT ──────────────────────────────────────────────────────
function init() {
  const sede = getSedeActual();
  if (!sede) { window.location.href = 'index.html'; return; }

  // Header
  const nombre = displayNombre(sede);
  headerSede.textContent = nombre;
  document.title = `Drive Pizza — ${nombre}`;

  // Aviso si cerrada (igual permite ver el menú)
  if (!estaAbierta(sede)) {
    closedMsg.textContent = `Esta sede está cerrada ahora. Horario: ${formatHorario(sede)}.`;
    closedBanner.style.display = '';
  }

  renderCategorias();
  renderProductos();
  renderCarrito();
  setupListeners();
}

// ── RENDER CATEGORÍAS ─────────────────────────────────────────
function renderCategorias() {
  const cats = Object.keys(menuData);
  catsNav.innerHTML = cats.map(cat =>
    `<button class="pw-cat-pill" data-cat="${cat}">${cat}</button>`
  ).join('');

  catsNav.querySelectorAll('.pw-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const id  = 'sec-' + pill.dataset.cat.replace(/\s+/g, '-');
      const sec = document.getElementById(id);
      if (!sec) return;
      const offsetTop = sec.getBoundingClientRect().top + window.scrollY - 112;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    });
  });

  // Primer pill activo por defecto
  catsNav.querySelector('.pw-cat-pill')?.classList.add('active');
}

// ── RENDER PRODUCTOS ──────────────────────────────────────────
function renderProductos() {
  menuBody.innerHTML = Object.entries(menuData).map(([cat, productos]) => {
    const secId = 'sec-' + cat.replace(/\s+/g, '-');
    return `
      <section class="pw-cat-section" id="${secId}">
        <h3 class="pw-cat-section-title">${cat}</h3>
        <div class="pw-product-list">
          ${productos.map(p => {
            const precios      = Object.values(p.opciones);
            const minPrecio    = Math.min(...precios);
            const tieneVariantes = Object.keys(p.opciones).length > 1;
            const dataP        = encodeURIComponent(JSON.stringify({ ...p, categoria: cat }));
            return `
              <div class="pw-product-card" data-p="${dataP}" tabindex="0" role="button"
                   aria-label="Agregar ${p.nombre}">
                <div class="pw-product-info">
                  <div class="pw-product-nombre">${p.nombre}</div>
                  ${p.descripcion ? `<div class="pw-product-desc">${p.descripcion}</div>` : ''}
                </div>
                <div class="pw-product-price">
                  ${tieneVariantes ? '<span style="font-size:.7rem;font-weight:400">Desde </span>' : ''}
                  ${formatPrecio(minPrecio)}
                </div>
                <div class="pw-product-add" aria-hidden="true">+</div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }).join('');

  // Click en card de producto
  menuBody.querySelectorAll('.pw-product-card').forEach(card => {
    const abrir = () => {
      const producto = JSON.parse(decodeURIComponent(card.dataset.p));
      abrirProductSheet(producto);
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });

  // IntersectionObserver para pill activo al hacer scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const catId = entry.target.id.replace('sec-', '').replace(/-/g, ' ');
      catsNav.querySelectorAll('.pw-cat-pill').forEach(p => {
        const activo = p.dataset.cat === catId;
        p.classList.toggle('active', activo);
        if (activo) p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }, { rootMargin: '-45% 0px -55% 0px' });

  menuBody.querySelectorAll('.pw-cat-section').forEach(sec => observer.observe(sec));
}

// ── PRODUCT SHEET ─────────────────────────────────────────────
function abrirProductSheet(producto) {
  productoActivo = producto;
  cantActual     = 1;
  opcionActiva   = null;
  sheetObs.value = '';

  sheetNombre.textContent = producto.nombre;
  sheetDesc.textContent   = producto.descripcion || '';

  const opciones = Object.entries(producto.opciones);

  if (opciones.length === 1) {
    // Única opción: auto-seleccionar y ocultar el selector
    opcionActiva = { nombre: opciones[0][0], precio: opciones[0][1] };
    sheetOpcionesWrap.style.display = 'none';
  } else {
    sheetOpcionesWrap.style.display = '';
    sheetOpciones.innerHTML = opciones.map(([nombre, precio], i) =>
      `<button class="pw-opcion-btn${i === 0 ? ' active' : ''}"
               data-nombre="${nombre}" data-precio="${precio}">
         ${nombre}
         <span class="pw-opcion-precio">${formatPrecio(precio)}</span>
       </button>`
    ).join('');

    // Auto-seleccionar primera opción
    opcionActiva = { nombre: opciones[0][0], precio: opciones[0][1] };

    sheetOpciones.querySelectorAll('.pw-opcion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sheetOpciones.querySelectorAll('.pw-opcion-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        opcionActiva = { nombre: btn.dataset.nombre, precio: Number(btn.dataset.precio) };
        cantActual   = 1;
        cantNum.textContent = cantActual;
        actualizarBtnAgregar();
      });
    });
  }

  cantNum.textContent = cantActual;
  actualizarBtnAgregar();
  abrirSheet(productSheet);
}

function actualizarBtnAgregar() {
  if (!opcionActiva) {
    btnAgregar.textContent = 'Selecciona una opción';
    return;
  }
  const total = opcionActiva.precio * cantActual;
  btnAgregar.textContent = `Agregar · ${formatPrecio(total)}`;
}

// ── RENDER CARRITO ────────────────────────────────────────────
function renderCarrito() {
  const carrito = getCarrito();
  const conteo  = getConteo();
  const total   = getTotal();

  // Badge en header
  cartBadge.textContent = conteo;
  cartBadge.classList.toggle('visible', conteo > 0);

  // Barra inferior
  cartBar.classList.toggle('visible', conteo > 0);
  if (conteo > 0) {
    cartBarItems.textContent = `${conteo} ${conteo === 1 ? 'producto' : 'productos'}`;
    cartBarTotal.textContent  = formatPrecio(total);
  }

  // Contenido del sheet de carrito
  const list   = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');

  if (!carrito.length) {
    list.innerHTML   = '<div class="pw-cart-empty">Tu carrito está vacío</div>';
    footer.innerHTML = '';
    return;
  }

  list.innerHTML = carrito.map((item, idx) => `
    <div class="pw-cart-item">
      <div class="pw-cart-item-info">
        <div class="pw-cart-item-nombre">${item.nombre}</div>
        <div class="pw-cart-item-opcion">${item.opcion}</div>
        ${item.obs ? `<div class="pw-cart-item-obs">"${item.obs}"</div>` : ''}
      </div>
      <div class="pw-cart-item-qty">
        <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="-1" aria-label="Quitar uno">−</button>
        <span class="pw-cart-qty-num">${item.cantidad}</span>
        <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="1" aria-label="Agregar uno">+</button>
      </div>
      <div class="pw-cart-item-precio">${formatPrecio(item.precio * item.cantidad)}</div>
    </div>`
  ).join('');

  footer.innerHTML = `
    <div class="pw-cart-total-row">
      <span>Total</span>
      <span>${formatPrecio(total)}</span>
    </div>
    <button class="pw-btn-primary" id="btn-checkout">Proceder al pago</button>`;

  // Botones de cantidad en el carrito
  list.querySelectorAll('.pw-cart-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      actualizarCantidad(Number(btn.dataset.idx), Number(btn.dataset.delta));
      renderCarrito();
    });
  });

  document.getElementById('btn-checkout')?.addEventListener('click', () => {
    window.location.href = 'checkout.html';
  });
}

// ── SHEETS ────────────────────────────────────────────────────
function abrirSheet(sheet) {
  overlay.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarSheet(sheet) {
  sheet.classList.remove('open');
  // Solo quitar overlay si ningún otro sheet está abierto
  if (!productSheet.classList.contains('open') && !cartSheet.classList.contains('open')) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function cerrarTodo() {
  productSheet.classList.remove('open');
  cartSheet.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── LISTENERS ─────────────────────────────────────────────────
function setupListeners() {
  // Cantidad en product sheet
  document.getElementById('btn-menos').addEventListener('click', () => {
    if (cantActual > 1) { cantActual--; cantNum.textContent = cantActual; actualizarBtnAgregar(); }
  });
  document.getElementById('btn-mas').addEventListener('click', () => {
    cantActual++; cantNum.textContent = cantActual; actualizarBtnAgregar();
  });

  // Agregar al carrito
  btnAgregar.addEventListener('click', () => {
    if (!opcionActiva) return;
    agregarItem({
      nombre:    productoActivo.nombre,
      categoria: productoActivo.categoria,
      opcion:    opcionActiva.nombre,
      precio:    opcionActiva.precio,
      obs:       sheetObs.value.trim(),
    });
    cerrarSheet(productSheet);
    renderCarrito();
  });

  // Cerrar sheets
  document.getElementById('btn-cerrar-producto').addEventListener('click', () => cerrarSheet(productSheet));
  document.getElementById('btn-cerrar-carrito').addEventListener('click', () => cerrarSheet(cartSheet));

  // Abrir carrito
  document.getElementById('btn-abrir-carrito').addEventListener('click', () => abrirSheet(cartSheet));
  document.getElementById('btn-cart-bar').addEventListener('click', () => abrirSheet(cartSheet));

  // Overlay cierra todo
  overlay.addEventListener('click', cerrarTodo);

  // Swipe hacia abajo cierra sheet (UX móvil)
  [productSheet, cartSheet].forEach(sheet => {
    let startY = 0;
    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      const delta = e.changedTouches[0].clientY - startY;
      if (delta > 80) cerrarSheet(sheet);
    }, { passive: true });
  });
}

// ── ARRANCAR ──────────────────────────────────────────────────
init();
