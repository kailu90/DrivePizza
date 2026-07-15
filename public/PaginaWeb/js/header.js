/* ============================================================
   Drive Pizza — Header compartido (PaginaWeb)
   El HTML del header ya está en cada página — este módulo solo
   conecta listeners comunes del hamburguer y cuenta.
   ============================================================ */

export function initHeader() {
  // Hamburger — TODO: abrir panel lateral
  document.getElementById('btn-hamburger')
    ?.addEventListener('click', () => { /* futuro: abrir menú lateral */ });

  // Cuenta — TODO: abrir panel de usuario
  document.getElementById('btn-cuenta')
    ?.addEventListener('click', () => { /* futuro: panel de cuenta */ });
}
