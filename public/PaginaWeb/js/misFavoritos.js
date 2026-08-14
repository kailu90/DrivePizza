/* ============================================================
   Drive Pizza — Vista Mis Favoritos + helpers de toggle
   ============================================================ */
import { PRODUCT_IMAGES } from './menuData.js';
import { formatPrecio }   from './carrito.js';

const LS_KEY = 'dp_favoritos';

const CAT_EMOJI = {
  'Pizzas Super Estofadas': '\ud83c\udf55', 'Pizzas Estofadas': '\ud83c\udf55',
  'Pizzetas Premium': '\ud83c\udf55', 'Pizzas Especiales': '\ud83c\udf55',
  'Pizzas Cl\u00e1sicas': '\ud83c\udf55', 'Pizzas T\u00edpicas': '\ud83c\udf55',
  'Calzones': '\ud83e\udd57', 'Stromboli': '\ud83c\udf2f',
  'Hamburguesas': '\ud83c\udf54', 'Sandwiches': '\ud83e\udd6a',
  'Pastas': '\ud83c\udf5d', 'Lasa\u00f1as': '\ud83e\uded9',
  'Maicitos': '\ud83c\udf3d', 'Entradas/Adici\u00f3n': '\ud83e\udd57',
  'Ensaladas': '\ud83e\udd57', default: '\ud83c\udf7d\ufe0f',
};

function getFavs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

export function isFavorito(nombre) {
  return getFavs().some(f => f.nombre === nombre);
}

export function toggleFavorito(producto, categoria) {
  const favs = getFavs();
  const idx  = favs.findIndex(f => f.nombre === producto.nombre);
  if (idx >= 0) {
    favs.splice(idx, 1);
    localStorage.setItem(LS_KEY, JSON.stringify(favs));
    return false;
  }
  const precios = Object.values(producto.opciones || {});
  favs.push({
    nombre:       producto.nombre,
    categoria:    categoria || producto.categoria || '',
    descripcion:  producto.descripcion || '',
    opciones:     producto.opciones || {},
    precio:       precios.length ? Math.min(...precios) : 0,
    fechaAgregado: new Date().toISOString(),
  });
  localStorage.setItem(LS_KEY, JSON.stringify(favs));
  return true;
}

function fmtFechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function favCard(f) {
  const imgSrc   = PRODUCT_IMAGES[f.nombre];
  const emoji    = CAT_EMOJI[f.categoria] || CAT_EMOJI.default;
  const imgHTML  = imgSrc
    ? `<img src="${imgSrc}" alt="${f.nombre}" loading="lazy">`
    : `<span class="pw-product-img-emoji">${emoji}</span>`;
  const tieneVar = Object.keys(f.opciones || {}).length > 1;
  const enc      = encodeURIComponent(f.nombre);
  return `
    <div class="pw-favs-card">
      <div class="pw-favs-card-img${imgSrc ? '' : ' pw-product-img--placeholder'}">${imgHTML}</div>
      <div class="pw-favs-card-info">
        <span class="pw-favs-cat">${f.categoria}</span>
        <span class="pw-favs-nombre">${f.nombre}</span>
        <span class="pw-favs-precio">${tieneVar ? 'Desde ' : ''}${formatPrecio(f.precio)}</span>
        <span class="pw-favs-fecha">Agregado el ${fmtFechaCorta(f.fechaAgregado)}</span>
      </div>
      <div class="pw-favs-card-actions">
        <button class="pw-favs-btn-quitar js-fav-quitar" data-nombre="${enc}" aria-label="Quitar de favoritos">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>
        </button>
        <button class="pw-favs-btn-agregar js-fav-agregar" data-nombre="${enc}">Agregar</button>
      </div>
    </div>`;
}

export function initMisFavoritosView({ onVolver, onAgregarProducto } = {}) {
  const wrap = document.getElementById('favoritos-wrap');

  wrap.innerHTML = `
    <div class="pw-subview-wrap">
      <div class="pw-subview-header">
        <button class="pw-subview-back" id="btn-favs-back" aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pw-subview-title">Mis favoritos</span>
      </div>
      <div class="pw-subview-inner" id="favs-inner"></div>
    </div>`;

  wrap.querySelector('#btn-favs-back').addEventListener('click', () => onVolver?.());
  renderFavs();

  function renderFavs() {
    const favs  = getFavs();
    const inner = document.getElementById('favs-inner');

    if (!favs.length) {
      inner.innerHTML = `
        <div class="pw-subview-info-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--dp-orange)"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>
          <h3>Tus productos favoritos</h3>
          <p>Toca el coraz\u00f3n en cualquier producto del men\u00fa para guardarlo aqu\u00ed.</p>
        </div>`;
      return;
    }

    // Agrupar por categoria
    const grupos = {};
    favs.forEach(f => { (grupos[f.categoria] = grupos[f.categoria] || []).push(f); });

    inner.innerHTML = Object.entries(grupos).map(([cat, items]) => `
      <div class="pw-favs-group">
        <h4 class="pw-favs-group-title">${cat}</h4>
        ${items.map(favCard).join('')}
      </div>`).join('');

    // Quitar de favoritos
    inner.querySelectorAll('.js-fav-quitar').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const nombre = decodeURIComponent(btn.dataset.nombre);
        const rest   = getFavs().filter(f => f.nombre !== nombre);
        localStorage.setItem(LS_KEY, JSON.stringify(rest));
        // Desactivar corazon en la card del menu si está renderizado
        document.querySelectorAll('.pw-product-fav-btn').forEach(b => {
          const card = b.closest('.pw-product-card');
          if (!card) return;
          try {
            const p = JSON.parse(decodeURIComponent(card.dataset.p));
            if (p.nombre === nombre) {
              b.classList.remove('pw-product-fav-btn--active');
              b.setAttribute('aria-label', 'Agregar a favoritos');
            }
          } catch { /* ignorar */ }
        });
        renderFavs();
      });
    });

    // Agregar al carrito (abre product sheet)
    inner.querySelectorAll('.js-fav-agregar').forEach(btn => {
      btn.addEventListener('click', () => {
        const nombre = decodeURIComponent(btn.dataset.nombre);
        const fav    = getFavs().find(f => f.nombre === nombre);
        if (fav && onAgregarProducto) onAgregarProducto(fav);
      });
    });
  }
}
