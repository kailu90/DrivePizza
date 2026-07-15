/* ============================================================
   Drive Pizza — Bottom Nav (PaginaWeb)
   El HTML del nav ya está en cada página — este módulo solo
   conecta listeners y actualiza el badge del carrito.
   ============================================================ */

export function initBottomNav() {
  document.getElementById('bottom-nav-inicio')
    ?.addEventListener('click', () => { window.location.href = 'index.html'; });

  document.getElementById('bottom-nav-menu')
    ?.addEventListener('click', () => { window.location.href = 'menu.html'; });
}
