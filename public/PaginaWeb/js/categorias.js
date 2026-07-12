/* ============================================================
   Drive Pizza — Selector de categorías
   ============================================================ */

import { getSedeActual, displayNombre } from './sede.js';


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
}

init();
