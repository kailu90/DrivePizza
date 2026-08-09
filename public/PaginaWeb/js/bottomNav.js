/* ============================================================
   Drive Pizza — Bottom Nav (PaginaWeb)
   El HTML del nav ya está en cada página — este módulo solo
   conecta listeners y actualiza el badge del carrito.
   ============================================================ */

export function initBottomNav({ onInicio, onMenu, onFavoritos, onCuenta } = {}) {
  document.getElementById('bottom-nav-inicio')?.addEventListener('click', () => {
    onInicio ? onInicio() : (window.location.href = 'index.html');
  });

  document.getElementById('bottom-nav-menu')?.addEventListener('click', () => {
    onMenu ? onMenu() : (window.location.href = 'menu.html');
  });

  document.getElementById('bottom-nav-favoritos')?.addEventListener('click', () => {
    onFavoritos?.();
  });

  document.getElementById('bottom-nav-cuenta')?.addEventListener('click', () => {
    onCuenta?.();
  });
}
