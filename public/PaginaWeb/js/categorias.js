/* ============================================================
   Drive Pizza — Selector de categorías
   ============================================================ */

import { getSedeActual, displayNombre } from './sede.js';
import { menuData } from './menuData.js';

const CATS_EXCLUIR = new Set(['Adiciones', 'Bordes']);

const CAT_ICON = {
  'Pizzas Super Estofadas': { emoji: '🍕', bg: '#1d4a3a' },
  'Pizzas Estofadas':       { emoji: '🍕', bg: '#314B27' },
  'Pizzas Especiales':      { emoji: '🍕', bg: '#2a4a6b' },
  'Pizzas Clasicas':        { emoji: '🍕', bg: '#6b2a2a' },
  'Pizzas Clásicas':        { emoji: '🍕', bg: '#6b2a2a' },
  'Pizzas Tipicas':         { emoji: '🍕', bg: '#1d5a6b' },
  'Pizzas Típicas':         { emoji: '🍕', bg: '#1d5a6b' },
  'Pizzetas Premium':       { emoji: '🍕', bg: '#7a4a1a' },
  'Pastas':                 { emoji: '🍝', bg: '#7a4a1a' },
  'Lasañas':                { emoji: '🫕', bg: '#6b3a2a' },
  'Calzones':               { emoji: '🥙', bg: '#3a6b2a' },
  'Stromboli':              { emoji: '🌯', bg: '#4a3a6b' },
  'Maicitos':               { emoji: '🌽', bg: '#6b6b1a' },
  'Hamburguesas':           { emoji: '🍔', bg: '#6b3a1a' },
  'Sandwiches':             { emoji: '🥪', bg: '#5a4a2a' },
  'Ensaladas':              { emoji: '🥗', bg: '#2a6b3a' },
  'Entradas/Adición':       { emoji: '🍞', bg: '#8a6a2a' },
  'Refrescos':              { emoji: '🥤', bg: '#1a5a7a' },
  'Jugos Naturales':        { emoji: '🧃', bg: '#4a7a1a' },
  'Limonadas':              { emoji: '🍋', bg: '#7a7a1a' },
  'Sodas':                  { emoji: '🫧', bg: '#1a4a7a' },
  'Cervezas':               { emoji: '🍺', bg: '#7a5a1a' },
  'Otros':                  { emoji: '🛒', bg: '#4a4a4a' },
};

function init() {
  const sede = getSedeActual();
  if (!sede) { window.location.href = 'index.html'; return; }

  document.getElementById('header-sede').textContent = displayNombre(sede);

  const cats = Object.keys(menuData).filter(c => !CATS_EXCLUIR.has(c));
  const grid = document.getElementById('cats-grid');

  grid.innerHTML = cats.map(cat => {
    const { emoji, bg } = CAT_ICON[cat] || { emoji: '🍽️', bg: '#4a4a4a' };
    return `
      <div class="pw-cat-card" data-cat="${cat}" role="button" tabindex="0" aria-label="${cat}">
        <div class="pw-cat-img" style="background:${bg}">
          <span>${emoji}</span>
        </div>
        <div class="pw-cat-name">${cat}</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.pw-cat-card').forEach(card => {
    const ir = () => {
      window.location.href = 'menu.html?cat=' + encodeURIComponent(card.dataset.cat);
    };
    card.addEventListener('click', ir);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); }
    });
  });
}

init();
