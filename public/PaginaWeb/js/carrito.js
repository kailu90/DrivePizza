/* ============================================================
   Drive Pizza — Carrito de compras
   Estado persistido en localStorage
   ============================================================ */
import { PRODUCT_IMAGES } from './menuData.js';

const KEY = 'dp_carrito';

// ── LECTURA / ESCRITURA ────────────────────────────────────────
export function getCarrito() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}

function setCarrito(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// ── OPERACIONES ────────────────────────────────────────────────

/**
 * Agrega un ítem al carrito.
 * Solo fusiona con existente si mismo nombre+opcion Y sin adiciones en ambos.
 * @param {{ nombre, categoria, opcion, precio, obs, adiciones, esAdicionable, esEstofada }} item
 */
export function agregarItem({ nombre, categoria, opcion, precio, obs = '', adiciones = [], esAdicionable = false, esEstofada = false }) {
  const carrito = getCarrito();

  // Fusionar solo si no hay adiciones (ni en el nuevo ni en el existente)
  if (adiciones.length === 0) {
    const idx = carrito.findIndex(i =>
      i.nombre === nombre && i.opcion === opcion && (!i.adiciones || i.adiciones.length === 0)
    );
    if (idx >= 0) {
      carrito[idx].cantidad++;
      setCarrito(carrito);
      return carrito;
    }
  }

  carrito.push({ nombre, categoria, opcion, precio, cantidad: 1, obs, adiciones, esAdicionable, esEstofada });
  setCarrito(carrito);
  return carrito;
}

/**
 * Actualiza la cantidad de un ítem por índice.
 * Si la cantidad llega a 0, elimina el ítem.
 */
export function actualizarCantidad(idx, delta) {
  const carrito = getCarrito();
  if (!carrito[idx]) return carrito;
  carrito[idx].cantidad = Math.max(0, carrito[idx].cantidad + delta);
  if (carrito[idx].cantidad === 0) carrito.splice(idx, 1);
  setCarrito(carrito);
  return carrito;
}

/**
 * Elimina un ítem por índice.
 */
export function quitarItem(idx) {
  const carrito = getCarrito();
  carrito.splice(idx, 1);
  setCarrito(carrito);
  return carrito;
}

/**
 * Vacía el carrito completamente.
 */
export function vaciarCarrito() {
  localStorage.removeItem(KEY);
}

/**
 * Push directo sin lógica de merge — para ítems de promo.
 */
export function pushItem(item) {
  const carrito = getCarrito();
  carrito.push({ cantidad: 1, opcion: '', obs: '', adiciones: [], ...item });
  setCarrito(carrito);
  return carrito;
}

// ── CÁLCULOS ───────────────────────────────────────────────────

/** Precio total de las adiciones de un ítem. */
export function getTotalAdiciones(item) {
  return (item.adiciones || []).reduce((s, a) => s + a.precio, 0);
}

/** Suma total del carrito incluyendo adiciones. */
export function getTotal() {
  return getCarrito().reduce((sum, item) =>
    sum + (item.precio + getTotalAdiciones(item)) * item.cantidad, 0);
}

/** Número total de unidades en el carrito. */
export function getConteo() {
  return getCarrito().reduce((sum, i) => sum + i.cantidad, 0);
}

// ── FORMATO ───────────────────────────────────────────────────

/** Formatea un número como precio colombiano: $32.000 */
export function formatPrecio(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

// ── RENDER COMPARTIDO ─────────────────────────────────────────

/** Genera el HTML de un ítem del carrito. Usado en cart sheet y checkout sheet. */
export function renderItemHTML(item, idx) {
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
        ${item.adiciones?.length ? item.adiciones.map(a => `
        <div class="pw-cart-item-adicion">
          <span>${a.nombre}</span>
          <span class="pw-cart-adicion-precio">+${formatPrecio(a.precio)}</span>
        </div>`).join('') : ''}
        ${item.obs ? `<div class="pw-cart-item-obs">"${item.obs}"</div>` : ''}
        <div class="pw-cart-item-bottom">
          <div class="pw-cart-item-qty">
            <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="-1" aria-label="Quitar uno">−</button>
            <span class="pw-cart-qty-num">${item.cantidad}</span>
            <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="1" aria-label="Agregar uno">+</button>
          </div>
          <button class="pw-cart-delete-btn" data-idx="${idx}" aria-label="Eliminar producto">Eliminar</button>
        </div>
      </div>
    </div>
  </div>`;
}
