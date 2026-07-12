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
