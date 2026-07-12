/* ============================================================
   Drive Pizza — Selector de categorías
   ============================================================ */

import { getSedeActual, displayNombre } from './sede.js';

// ── BANNER ────────────────────────────────────────────────────
// Para agregar piezas publicitarias: añade objetos { src, alt, href? } a este array.
// src: ruta relativa desde PaginaWeb/ → '../Imagenes/banners/pieza1.jpg'
// href: (opcional) enlace al hacer clic en el banner
const BANNERS = [
  // { src: '../Imagenes/banners/pieza1.jpg', alt: 'Promoción pizza familiar', href: 'menu.html?cat=Pizzas Estofadas' },
];

function initBanner() {
  if (!BANNERS.length) return;

  const wrapper = document.getElementById('pw-banner');
  const track   = document.getElementById('pw-banner-track');
  const dotsEl  = document.getElementById('pw-banner-dots');

  // Renderizar slides
  track.innerHTML = BANNERS.map(b => `
    <div class="pw-banner-slide">
      ${b.href
        ? `<a href="${b.href}"><img src="${b.src}" alt="${b.alt ?? ''}"></a>`
        : `<img src="${b.src}" alt="${b.alt ?? ''}">`}
    </div>`).join('');

  // Renderizar dots
  dotsEl.innerHTML = BANNERS.map((_, i) =>
    `<button class="pw-banner-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Ir a banner ${i + 1}"></button>`
  ).join('');

  wrapper.style.display = '';

  let current  = 0;
  let timer    = null;
  const dots   = dotsEl.querySelectorAll('.pw-banner-dot');

  function goTo(idx) {
    current = (idx + BANNERS.length) % BANNERS.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function startAuto() {
    timer = setInterval(() => goTo(current + 1), 4500);
  }

  function resetAuto() {
    clearInterval(timer);
    startAuto();
  }

  dots.forEach(d => d.addEventListener('click', () => { goTo(Number(d.dataset.i)); resetAuto(); }));

  // Swipe táctil
  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 40) { goTo(current + (delta < 0 ? 1 : -1)); resetAuto(); }
  }, { passive: true });

  if (BANNERS.length > 1) startAuto();
}

// nombre: texto visible | cat: sección del menú a la que scrollea
// cat: null → abre menu.html desde el inicio
const CATEGORIAS = [
  { nombre: 'Promociones',         emoji: '🎉', bg: '#c85e10', cat: null               },
  { nombre: 'Pizzas',              emoji: '🍕', bg: '#314B27', cat: 'Pizzas Estofadas'  },
  { nombre: 'Pizzas Premium',      emoji: '🍕', bg: '#7a4a1a', cat: 'Pizzetas Premium'  },
  { nombre: 'Calzones',            emoji: '🥙', bg: '#3a6b2a', cat: 'Calzones'          },
  { nombre: 'Lasañas',             emoji: '🫕', bg: '#6b3a2a', cat: 'Lasañas'           },
  { nombre: 'Pastas',              emoji: '🍝', bg: '#5a3a18', cat: 'Pastas'            },
  { nombre: 'Hamburguesas',        emoji: '🍔', bg: '#6b3a1a', cat: 'Hamburguesas'      },
  { nombre: 'Stromboli',           emoji: '🌯', bg: '#4a3a6b', cat: 'Stromboli'         },
  { nombre: 'Sandwiches',          emoji: '🥪', bg: '#5a4a2a', cat: 'Sandwiches'        },
  { nombre: 'Ensaladas',           emoji: '🥗', bg: '#2a6b3a', cat: 'Ensaladas'         },
  { nombre: 'Bebidas',             emoji: '🥤', bg: '#1a5a7a', cat: 'Refrescos'         },
  { nombre: 'Entradas/Adiciones',  emoji: '🍞', bg: '#8a6a2a', cat: 'Entradas/Adición'  },
];

function init() {
  const sede = getSedeActual();
  if (!sede) { window.location.href = 'index.html'; return; }

  const grid = document.getElementById('cats-grid');

  grid.innerHTML = CATEGORIAS.map(({ nombre, emoji, bg, cat }) => {
    const destino = cat
      ? 'menu.html?cat=' + encodeURIComponent(cat)
      : 'menu.html';
    return `
      <a class="pw-cat-card" href="${destino}" aria-label="${nombre}">
        <div class="pw-cat-img" style="background:${bg}">
          <span>${emoji}</span>
        </div>
        <div class="pw-cat-name">${nombre}</div>
      </a>`;
  }).join('');

  initBanner();
}

init();
