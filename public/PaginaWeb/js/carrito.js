/* ============================================================
   Drive Pizza — Carrito de compras
   Estado persistido en localStorage
   ============================================================ */

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
 * Si ya existe el mismo producto + opción, incrementa la cantidad.
 * @param {{ nombre, categoria, opcion, precio, obs }} item
 */
export function agregarItem({ nombre, categoria, opcion, precio, obs = '' }) {
  const carrito = getCarrito();
  const idx = carrito.findIndex(i => i.nombre === nombre && i.opcion === opcion);
  if (idx >= 0) {
    carrito[idx].cantidad++;
  } else {
    carrito.push({ nombre, categoria, opcion, precio, cantidad: 1, obs });
  }
  setCarrito(carrito);
  return carrito;
}

/**
 * Actualiza la cantidad de un ítem por índice.
 * Si la cantidad llega a 0, elimina el ítem.
 * @param {number} idx
 * @param {number} delta  +1 o -1
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

// ── CÁLCULOS ───────────────────────────────────────────────────

/** Suma total del carrito en pesos. */
export function getTotal() {
  return getCarrito().reduce((sum, i) => sum + i.precio * i.cantidad, 0);
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
