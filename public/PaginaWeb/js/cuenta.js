/* ============================================================
   Drive Pizza — Vista Mi Cuenta
   ============================================================ */

const CHEVRON = `<svg class="pw-cuenta-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

const AVATAR_SVG = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/></svg>`;

const MENU_ITEMS = [
  {
    id: 'pedidos',
    titulo: 'Mis pedidos',
    sub: 'Consulta tu historial y detalles',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  },
  {
    id: 'direcciones',
    titulo: 'Mis direcciones',
    sub: 'Gestiona tus direcciones guardadas',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  },
  {
    id: 'favoritos',
    titulo: 'Favoritos',
    sub: 'Tus productos favoritos',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>`,
  },
  {
    id: 'pago',
    titulo: 'Métodos de pago',
    sub: 'Administra tus métodos de pago',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  },
  {
    id: 'promos',
    titulo: 'Promociones y beneficios',
    sub: 'Descubre ofertas exclusivas',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    id: 'ayuda',
    titulo: 'Ayuda',
    sub: 'Preguntas frecuentes y soporte',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none"/></svg>`,
  },
];

const EXIT_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

export function initCuentaView({ onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu } = {}) {
  const wrap = document.getElementById('cuenta-wrap');
  const nombre = localStorage.getItem('dp_nombre') || 'amigo';

  const itemsHTML = MENU_ITEMS.map(item => `
    <button class="pw-cuenta-menu-item" data-cuenta-action="${item.id}">
      <div class="pw-cuenta-menu-icon">${item.icon}</div>
      <div class="pw-cuenta-menu-text">
        <span class="pw-cuenta-menu-titulo">${item.titulo}</span>
        <span class="pw-cuenta-menu-sub">${item.sub}</span>
      </div>
      ${CHEVRON}
    </button>
  `).join('');

  wrap.innerHTML = `
    <div class="pw-cuenta-inner">

      <div class="pw-cuenta-perfil">
        <div class="pw-cuenta-avatar">${AVATAR_SVG}</div>
        <div class="pw-cuenta-perfil-info">
          <h2 class="pw-cuenta-titulo">Mi cuenta</h2>
          <p class="pw-cuenta-hola">Hola, ${nombre} <span aria-hidden="true">👋</span></p>
          <span class="pw-cuenta-sub">Disfruta tu pizza favorita</span>
        </div>
      </div>

      <div class="pw-cuenta-cta-card">
        <div class="pw-cuenta-cta-text">
          <p class="pw-cuenta-cta-titulo">¿Listo para tu próximo pedido?</p>
          <p class="pw-cuenta-cta-sub">Pide de nuevo en segundos</p>
          <button class="pw-cuenta-cta-btn" id="btn-cuenta-pedir">Pedir de nuevo</button>
        </div>
        <img class="pw-cuenta-cta-img" src="../Imagenes/productos/pizza-suprema-pepperoni.jpg" alt="" aria-hidden="true">
      </div>

      <h3 class="pw-cuenta-section-title">Accesos rápidos</h3>

      <div class="pw-cuenta-menu-list">
        ${itemsHTML}
        <div class="pw-cuenta-menu-separator"></div>
        <button class="pw-cuenta-menu-item pw-cuenta-menu-item--danger" id="btn-cuenta-salir">
          <div class="pw-cuenta-menu-icon pw-cuenta-menu-icon--danger">${EXIT_SVG}</div>
          <div class="pw-cuenta-menu-text">
            <span class="pw-cuenta-menu-titulo">Cerrar sesión</span>
          </div>
          ${CHEVRON}
        </button>
      </div>

    </div>
  `;

  // Listeners accesos rápidos
  wrap.querySelector('[data-cuenta-action="pedidos"]')?.addEventListener('click', () => onMisPedidos?.());
  wrap.querySelector('[data-cuenta-action="direcciones"]')?.addEventListener('click', () => onMisDirecciones?.());
  wrap.querySelector('[data-cuenta-action="favoritos"]')?.addEventListener('click', () => onFavoritos?.());

  // Botón pedir de nuevo → vuelve al menú
  wrap.querySelector('#btn-cuenta-pedir')?.addEventListener('click', () => onIrAlMenu?.());

  // Cerrar sesión → limpia localStorage relevante y va a index
  wrap.querySelector('#btn-cuenta-salir')?.addEventListener('click', () => {
    ['dp_sede', 'dp_direccion', 'dp_nombre'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'index.html';
  });
}
