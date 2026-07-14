/* ============================================================
   Drive Pizza — Bottom Nav compartido (PaginaWeb)
   Uso: initBottomNav('inicio' | 'menu' | 'pedido' | 'favoritos' | 'cuenta')
   ============================================================ */

export function initBottomNav(active = 'inicio') {
  const nav = document.createElement('nav');
  nav.className = 'pw-bottom-nav';
  nav.innerHTML = `
    <button class="pw-bottom-nav-btn${active === 'inicio' ? ' pw-bottom-nav-btn--active' : ''}" id="bottom-nav-inicio" aria-label="Inicio">
      <span class="pw-bottom-nav-emoji">🏠</span>
      <span>Inicio</span>
    </button>
    <button class="pw-bottom-nav-btn${active === 'menu' ? ' pw-bottom-nav-btn--active' : ''}" id="bottom-nav-menu" aria-label="Menú">
      <span class="pw-bottom-nav-emoji">🍕</span>
      <span>Menú</span>
    </button>
    <button class="pw-bottom-nav-btn pw-bottom-nav-btn--center" id="bottom-nav-cart-btn" aria-label="Pedido">
      <span class="pw-bottom-nav-emoji">🛒</span>
      <span class="pw-cart-badge" id="bottom-cart-badge"></span>
      <span>Pedido</span>
    </button>
    <button class="pw-bottom-nav-btn${active === 'favoritos' ? ' pw-bottom-nav-btn--active' : ''}" id="bottom-nav-favoritos" aria-label="Favoritos">
      <span class="pw-bottom-nav-emoji">❤️</span>
      <span>Favoritos</span>
    </button>
    <button class="pw-bottom-nav-btn${active === 'cuenta' ? ' pw-bottom-nav-btn--active' : ''}" id="bottom-nav-cuenta" aria-label="Cuenta">
      <span class="pw-bottom-nav-emoji">👤</span>
      <span>Cuenta</span>
    </button>
  `;

  document.body.appendChild(nav);

  document.getElementById('bottom-nav-inicio')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('bottom-nav-menu')?.addEventListener('click', () => {
    window.location.href = 'menu.html';
  });

  return nav;
}
