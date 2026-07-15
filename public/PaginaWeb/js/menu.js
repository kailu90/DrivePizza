/* ============================================================
   Drive Pizza — Menú y carrito
   ============================================================ */

import { getSedeActual, estaAbierta, formatHorario, displayNombre } from './sede.js';
import { agregarItem, actualizarCantidad, quitarItem, getCarrito, getTotal, getConteo, getTotalAdiciones, formatPrecio, pushItem } from './carrito.js';
import { menuData, preciosBordes, CATEGORIAS_ADICIONABLES, TAMANOS_CON_BORDE, CATS_PIZZAS } from './menuData.js';
import { getPromosHTML, setupPromoListeners, initPromos } from './promos.js';
import { initBottomNav } from './bottomNav.js';
import { initHeader } from './header.js';

// Conectar listeners comunes
initHeader();
initBottomNav();

// Tamaños que permiten mezcla de 2 sabores (igual que TAMANOS_CON_BORDE)
const TAMANOS_MIXABLES = TAMANOS_CON_BORDE; // Pequeña, Mediana, Grande, Jumbo

// ── IMÁGENES DE PRODUCTOS ─────────────────────────────────────
const PRODUCT_IMAGES = {
  // Pizzas
  'Bocadillo':                  '../Imagenes/productos/Bocadillo.jpg',
  'Bocadillo Tocineta':         '../Imagenes/productos/BocadilloTocineta.jpg',
  'Carbonara':                  '../Imagenes/productos/Carbonara.jpg',
  'Carnivora':                  '../Imagenes/productos/Carnivora.jpg',
  'Champiñones':                '../Imagenes/productos/Champiñones.jpg',
  'Ciruelas y Tocineta':        '../Imagenes/productos/CiruelaTocineta.jpg',
  'Criolla':                    '../Imagenes/productos/Criolla.jpg',
  'Doble Queso':                '../Imagenes/productos/DobleQueso.jpg',
  'Drive':                      '../Imagenes/productos/Drive.jpg',
  'Especial de carnes':         '../Imagenes/productos/EspecialCarnes.jpg',
  'Estofada de Carnes':         '../Imagenes/productos/EstofadaCarnes.jpg',
  'Estofada Hawaiana':          '../Imagenes/productos/EstofadaHawaiana.jpg',
  'Estofada Suprema':           '../Imagenes/productos/EstofadaSuprema.jpg',
  'Estofada Triple Queso':      '../Imagenes/productos/EstofadaTripleQueso.jpg',
  'Hawaiana':                   '../Imagenes/productos/Hawaiana.jpg',
  'Hawaiana Chic':              '../Imagenes/productos/HawaianaChic.jpg',
  'Jamon':                      '../Imagenes/productos/Jamón.jpg',
  'La Majestuosa':              '../Imagenes/productos/Majestuosa.jpeg',
  'Maduro tocineta':            '../Imagenes/productos/MaduroTocineta.jpg',
  'Margarita':                  '../Imagenes/productos/Margarita.jpg',
  'Mexicana':                   '../Imagenes/productos/Mexicana.jpg',
  'Napolitana':                 '../Imagenes/productos/Napolitana.jpg',
  'Paisa':                      '../Imagenes/productos/Paisa.jpg',
  'Pepperoni':                  '../Imagenes/productos/Pepperoni.jpg',
  'Pollo':                      '../Imagenes/productos/Pollo.jpg',
  'Pollo Bbq':                  '../Imagenes/productos/PolloBbq.jpg',
  'Pollo Champiñones':          '../Imagenes/productos/PolloChampiñones.jpg',
  'Pollo Miel-Mostaza':         '../Imagenes/productos/PolloMielMostaza.jpg',
  'Super Estofada de Carnes':   '../Imagenes/productos/SuperEstofadaCarnes.jpg',
  'Super Estofada Hawaiana':    '../Imagenes/productos/SuperEstofadaHawaiana.jpg',
  'Suprema':                    '../Imagenes/productos/Suprema.jpg',
  'Suprema de Pollo':           '../Imagenes/productos/SupremaPollo.jpg',
  'Suprema Pepperoni':          '../Imagenes/productos/SupremaPepperoni.jpeg',
  'Teriyaki':                   '../Imagenes/productos/Teriyaki.jpg',
  'Toc':                        '../Imagenes/productos/Toc.jpg',
  'Topetunas':                  '../Imagenes/productos/Topetunas.jpg',
  'Tres Carnes':                '../Imagenes/productos/TresCarnes.jpg',
  'Vegetariana':                '../Imagenes/productos/Vegetariana.jpg',
  // Pizzetas
  'Pizzeta California':         '../Imagenes/productos/PizzetaCalifornia.jpg',
  'Pizzeta Carbonara':          '../Imagenes/productos/PizzetaCarbonara.jpg',
  'Pizzeta Cuatro Quesos':      '../Imagenes/productos/PizzetaCuatroQuesos.jpg',
  'Pizzeta del Huerto':         '../Imagenes/productos/PizzetaDelHuerto.jpg',
  'Pizzeta Florencia':          '../Imagenes/productos/PizzetaFlorencia.jpg',
  'Pizzeta Genova':             '../Imagenes/productos/PizzetaGenova.jpg',
  'Pizzeta Iberica':            '../Imagenes/productos/PizzetaIbérica.jpg',
  'Pizzeta la Majestuosa':      '../Imagenes/productos/PizzetaMajestuosa.jpeg',
  'Pizzeta Livorno':            '../Imagenes/productos/PizzetaLivorno.jpg',
  'Pizzeta Milan':              '../Imagenes/productos/PizzetaMilan.jpg',
  'Pizzeta Venecia':            '../Imagenes/productos/PizzetaVenecia.jpg',
  // Lasañas
  'Lasaña Drive':               '../Imagenes/productos/LasañaDrive.jpg',
  'Lasaña Mixta':               '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Remix':               '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Sencilla':            '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Vegetariana':         '../Imagenes/productos/LasañaVegetariana.jpg',
  // Pastas
  'Bolognesa':                  '../Imagenes/productos/Bolognesa.jpg',
  'Camarón a la criolla':       '../Imagenes/productos/CamarónALaCriolla.jpg',
  'Fetuccine Mixto':            '../Imagenes/productos/FetuccineSencillo.jpg',
  'Fetuccine Remix':            '../Imagenes/productos/FetuccineSencillo.jpg',
  'Fetuccine Sencillo':         '../Imagenes/productos/FetuccineSencillo.jpg',
  'Macaroni Mixto':             '../Imagenes/productos/Macarron.jpg',
  'Macaroni Remix':             '../Imagenes/productos/Macarron.jpg',
  'Macaroni Sencillo':          '../Imagenes/productos/Macarron.jpg',
  'Pasta Alfredo':              '../Imagenes/productos/PastaAlfredo.jpg',
  'Pasta Carbonara':            '../Imagenes/productos/PastaCarbonara.jpg',
  'Pasta Marinera':             '../Imagenes/productos/PastaMarinera.jpg',
  'Pasta Matriziana':           '../Imagenes/productos/PastaMatriziana.jpg',
  'Pasta Pesto Camaron':        '../Imagenes/productos/PastaPestoCamarón.jpg',
  'Pasta Spaguetti Mixto':      '../Imagenes/productos/SpaguettiSencillo.jpg',
  'Pasta Spaguetti Remix':      '../Imagenes/productos/SpaguettiSencillo.jpg',
  'Pasta Spaguetti Sencillo':   '../Imagenes/productos/SpaguettiSencillo.jpg',
  // Sandwiches
  'Sandwiche Atun':             '../Imagenes/productos/SandiwchAtún.jpg',
  'Sandwiche Jamon':            '../Imagenes/productos/SandiwchJamón.jpg',
  'Sandwiche Pollo':            '../Imagenes/productos/SandiwchPollo.jpg',
  // Hamburguesas
  'Hamburguesa Clasica':        '../Imagenes/productos/HamburguesaClásica.jpg',
  'Hamburguesa Estofada':       '../Imagenes/productos/HamburguesaEstofadaPollo.jpg',
  'Hamburguesa Pollo':          '../Imagenes/productos/HamburguesaPollo.jpg',
  // Ensaladas
  'Ensalada Balsámica':         '../Imagenes/productos/EnsaladaBalsámica.jpg',
  'Ensalada Cesar':             '../Imagenes/productos/EnsaladaCesar.jpg',
  'Ensalada Drive':             '../Imagenes/productos/EnsaladaDrivwe.jpg',
  'Ensalada Mi Cuate':          '../Imagenes/productos/EnsaladaMiCuate.jpg',
  'Ensalada Premium':           '../Imagenes/productos/EnsaladaPremium.jpg',
  // Maicitos
  'Maicitos Gratinados':        '../Imagenes/productos/MaicitosGratinados.jpg',
  // Bebidas
  'Agua':                       '../Imagenes/productos/Agua.jpg',
  'Cerveza 3 Cordilleras':      '../Imagenes/productos/Cerveza3Cordilleras.png',
  'Cerveza Nacional':           '../Imagenes/productos/Cerveza.jpg',
  'Gaseosa 1.5 lts':            '../Imagenes/productos/Gaseosa1.5Lts.jpg',
  'Gaseosa 400 ml':             '../Imagenes/productos/Gaseosa400ml.jpg',
  'H2OH':                       '../Imagenes/productos/H2OH!.jpg',
  'Hatsu':                      '../Imagenes/productos/Hatsu.jpg',
  'Hatsu Soda':                 '../Imagenes/productos/Hatsu.jpg',
  'Jugo en Agua':               '../Imagenes/productos/JugosNaturalesAgua.jpg',
  'Jugo en Leche':              '../Imagenes/productos/JugosNaturalesLeche.jpg',
  'Jugo Hit 500 ml':            '../Imagenes/productos/JugosHit500ml.jpg',
  'Limonada':                   '../Imagenes/productos/LimonadaNatural.jpg',
  'Mr Tea':                     '../Imagenes/productos/MrTea.jpg',
  'Soda Bretaña 300 ml':        '../Imagenes/productos/SobasSaborizadas.jpg',
  'Sodas':                      '../Imagenes/productos/SobasSaborizadas.jpg',
};

const CAT_EMOJI = {
  'Pizzas Especiales':      '🍕',
  'Pizzas Clásicas':        '🍕',
  'Pizzas Típicas':         '🍕',
  'Pizzas Estofadas':       '🍕',
  'Pizzas Super Estofadas': '🍕',
  'Pizzetas Premium':       '🍕',
  'Lasañas':                '🫕',
  'Pastas':                 '🍝',
  'Sandwiches':             '🥪',
  'Hamburguesas':           '🍔',
  'Ensaladas':              '🥗',
  'Stromboli':              '🌯',
  'Calzones':               '🫓',
  'Jugos Naturales':        '🥤',
  'Refrescos':              '🥤',
  'Limonadas':              '🍋',
  'Sodas':                  '🥤',
  'Cervezas':               '🍺',
  'Otros':                  '🥤',
  'Maicitos':               '🌽',
  'Entradas/Adición':       '🍞',
};

// ── ESTADO ────────────────────────────────────────────────────
let productoActivo         = null;
let cantActual             = 1;
let opcionActiva           = null;
let adicionesSeleccionadas = [];
let bordeSeleccionado      = null;
let mezclaState            = null; // { saboresDisponibles, sabor1, tamano, precio1 }

// ── ELEMENTOS ─────────────────────────────────────────────────
const headerSede        = document.getElementById('sede-bar'); // franja debajo del header
const catsNav           = document.getElementById('cats-nav');
const menuBody          = document.getElementById('menu-body');
const closedBanner      = document.getElementById('closed-banner');
const closedMsg         = document.getElementById('closed-msg');
const overlay           = document.getElementById('overlay');
const productSheet      = document.getElementById('product-sheet');
const cartSheet         = document.getElementById('cart-sheet');
const sabor2Sheet       = document.getElementById('sabor2-sheet');
const promoSheet        = document.getElementById('promo-sheet');
const cartBar           = document.getElementById('cart-bar');
const cartBadge         = null; // badge movido al bottom nav (bottom-cart-badge)
const cartBtnTotal      = null;
const cartBarItems      = document.getElementById('cart-bar-items');
const cartBarTotal      = document.getElementById('cart-bar-total');
const sheetNombre       = document.getElementById('sheet-nombre');
const sheetDesc         = document.getElementById('sheet-desc');
const sheetOpcionesWrap = document.getElementById('sheet-opciones-wrap');
const sheetOpciones     = document.getElementById('sheet-opciones');
const sheetMezclaWrap   = document.getElementById('sheet-mezcla-wrap');
const sheetAdicionesWrap= document.getElementById('sheet-adiciones-wrap');
const sheetAdicionesEl  = document.getElementById('sheet-adiciones');
const sheetBordesWrap   = document.getElementById('sheet-bordes-wrap');
const sheetBordesEl     = document.getElementById('sheet-bordes');
const cantNum           = document.getElementById('cant-num');
const sheetObs          = document.getElementById('sheet-obs');
const btnAgregar        = document.getElementById('btn-agregar');
const sabor2Titulo      = document.getElementById('sabor2-titulo');
const sabor2Subtitulo   = document.getElementById('sabor2-subtitulo');
const sabor2Buscar      = document.getElementById('sabor2-buscar');
const sabor2Grid        = document.getElementById('sabor2-grid');

// ── INIT ──────────────────────────────────────────────────────
function init() {
  const sede = getSedeActual();
  if (!sede) { window.location.href = 'index.html'; return; }

  const nombre = displayNombre(sede);
  if (headerSede) headerSede.innerHTML = `
    <div class="pw-sede-bar-info">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:.25rem"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>Preparando en<br><strong>${nombre}</strong>
    </div>
    <a href="index.html" class="pw-sede-bar-cambiar">Cambiar sede</a>`;
  document.title = `Drive Pizza — ${nombre}`;

  if (!estaAbierta(sede)) {
    closedMsg.textContent = `Esta sede está cerrada ahora. Horario: ${formatHorario(sede)}.`;
    closedBanner.style.display = '';
  }

  initPromos({
    pushItem,
    renderCarrito,
    abrirSheet,
    cerrarSheet: () => cerrarSheet(promoSheet),
    promoSheet,
  });

  renderCategorias();
  renderProductos();
  renderCarrito();
  setupListeners();

  // Altura del header para que pw-sub-shell sepa dónde pegarse
  const menuShellEl = document.querySelector('.pw-menu-shell');
  if (menuShellEl) {
    document.documentElement.style.setProperty('--pw-header-h', menuShellEl.offsetHeight + 'px');
  }

  // Buscador de productos
  const menuSearch = document.getElementById('menu-search');
  menuSearch?.addEventListener('input', () => {
    const q = menuSearch.value.trim().toLowerCase();
    menuBody.querySelectorAll('.pw-cat-section').forEach(sec => {
      let visible = 0;
      sec.querySelectorAll('.pw-product-card').forEach(card => {
        const p = JSON.parse(decodeURIComponent(card.dataset.p));
        const match = !q || p.nombre.toLowerCase().includes(q);
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      sec.style.display = visible === 0 ? 'none' : '';
    });
  });

  // Scroll a la categoría elegida en la página anterior
  const catParam = new URLSearchParams(location.search).get('cat');
  if (catParam && catParam !== 'null') {
    setTimeout(() => scrollToSection('sec-' + catParam.replace(/\s+/g, '-')), 80);
  }
}

// ── NAVEGACIÓN AGRUPADA ────────────────────────────────────────
const GRUPOS_NAV = [
  { label: 'Pizzas',       cats: ['Pizzas Estofadas', 'Pizzas Super Estofadas', 'Pizzas Especiales', 'Pizzas Clásicas', 'Pizzas Típicas', 'Pizzetas Premium'] },
  { label: 'Bebidas',      cats: ['Jugos Naturales', 'Refrescos', 'Limonadas', 'Sodas', 'Cervezas', 'Otros'] },
  { label: 'Calzones',     cats: ['Calzones'] },
  { label: 'Stromboli',    cats: ['Stromboli'] },
  { label: 'Hamburguesas', cats: ['Hamburguesas'] },
  { label: 'Sandwiches',   cats: ['Sandwiches'] },
  { label: 'Ensaladas',    cats: ['Ensaladas'] },
  { label: 'Lasañas',      cats: ['Lasañas'] },
  { label: 'Pastas',       cats: ['Pastas'] },
  { label: 'Maicitos',     cats: ['Maicitos'] },
  { label: 'Entradas',     cats: ['Entradas/Adición'] },
];

const CAT_SHORT = {
  'Pizzas Estofadas':       'Estofadas',
  'Pizzas Super Estofadas': 'Super Estofadas',
  'Pizzas Especiales':      'Especiales',
  'Pizzas Clásicas':        'Clásicas',
  'Pizzas Típicas':         'Típicas',
  'Pizzetas Premium':       'Premium',
};

const CAT_TO_GRUPO = {};
GRUPOS_NAV.forEach(g => g.cats.forEach(c => { CAT_TO_GRUPO[c] = g.label; }));

// Categorías que pertenecen a grupos con múltiples subcats → llevan acordeón
const CATS_COLAPSABLES = new Set(
  GRUPOS_NAV.filter(g => g.cats.length > 1).flatMap(g => g.cats)
);

function scrollToSection(id) {
  const sec = document.getElementById(id);
  if (!sec) return;
  if (sec.dataset.open === 'false') {
    sec.dataset.open = 'true';
    sec.querySelector('.pw-cat-toggle')?.setAttribute('aria-expanded', 'true');
  }
  const shellH    = document.querySelector('.pw-menu-shell')?.offsetHeight ?? 0;
  const subShellH = document.querySelector('.pw-sub-shell')?.offsetHeight ?? 0;
  const offset    = shellH + subShellH + 4;
  window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
}

function activarGrupo(grupoLabel, scroll) {
  catsNav.querySelectorAll('.pw-cat-pill').forEach(p => {
    const activo = p.dataset.grupo === grupoLabel;
    p.classList.toggle('active', activo);
    if (activo) p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  if (!scroll) return;

  const grupo = GRUPOS_NAV.find(g => g.label === grupoLabel);
  const id = grupo?.cats[0]
    ? 'sec-' + grupo.cats[0].replace(/\s+/g, '-')
    : null;
  if (id) scrollToSection(id);
}

function renderCategorias() {
  catsNav.innerHTML = GRUPOS_NAV.map(g =>
    `<button class="pw-cat-pill" data-grupo="${g.label}">${g.label}</button>`
  ).join('');

  catsNav.querySelectorAll('.pw-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => activarGrupo(pill.dataset.grupo, true));
  });

  activarGrupo('Pizzas', false);
}

// ── RENDER PRODUCTOS ──────────────────────────────────────────
function renderProductos() {
  // Poblar lista de promos en el HTML estático
  const promoListEl = document.getElementById('promo-list');
  if (promoListEl) promoListEl.innerHTML = getPromosHTML();

  menuBody.innerHTML = GRUPOS_NAV.flatMap(g => g.cats).map(cat => {
    const productos = menuData[cat];
    if (!productos) return '';
    const secId      = 'sec-' + cat.replace(/\s+/g, '-');
    const colapsable = CATS_COLAPSABLES.has(cat);

    const cardsHTML = productos.map(p => {
      const precios        = Object.values(p.opciones);
      const minPrecio      = Math.min(...precios);
      const tieneVariantes = Object.keys(p.opciones).length > 1;
      const dataP          = encodeURIComponent(JSON.stringify({ ...p, categoria: cat }));
      const imgSrc         = PRODUCT_IMAGES[p.nombre];
      const emoji          = CAT_EMOJI[cat] || '🍽️';
      const imgHTML        = imgSrc
        ? `<img src="${imgSrc}" alt="${p.nombre}" loading="lazy">`
        : `<span class="pw-product-img-emoji">${emoji}</span>`;
      return `
        <div class="pw-product-card" data-p="${dataP}" tabindex="0" role="button"
             aria-label="Agregar ${p.nombre}">
          <div class="pw-product-img${imgSrc ? '' : ' pw-product-img--placeholder'}">${imgHTML}</div>
          <div class="pw-product-info">
            <div class="pw-product-nombre">${p.nombre}</div>
            ${p.descripcion ? `<div class="pw-product-desc">${p.descripcion}</div>` : ''}
            <div class="pw-product-footer">
              <div class="pw-product-price">
                ${tieneVariantes ? '<span class="pw-product-desde">Desde </span>' : ''}
                ${formatPrecio(minPrecio)}
              </div>
              <div class="pw-product-add" aria-hidden="true">+</div>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <section class="pw-cat-section pw-cat-collapsible" id="${secId}" data-open="true">
        <button class="pw-cat-section-title pw-cat-toggle" aria-expanded="true">
          ${CAT_SHORT[cat] || cat}
          <span class="pw-cat-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="pw-product-list pw-collapsible-body">${cardsHTML}</div>
      </section>`;
  }).join('');

  menuBody.querySelectorAll('.pw-cat-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec  = btn.closest('.pw-cat-collapsible');
      const open = sec.dataset.open === 'true';
      sec.dataset.open = open ? 'false' : 'true';
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  menuBody.querySelectorAll('.pw-product-card').forEach(card => {
    const abrir = () => {
      const producto = JSON.parse(decodeURIComponent(card.dataset.p));
      abrirProductSheet(producto);
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  });

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const catKey     = entry.target.id.replace('sec-', '').replace(/-/g, ' ');
      const grupoLabel = CAT_TO_GRUPO[catKey] || catKey;

      catsNav.querySelectorAll('.pw-cat-pill').forEach(p => {
        const activo = p.dataset.grupo === grupoLabel;
        p.classList.toggle('active', activo);
        if (activo) p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });

    });
  }, { rootMargin: '-45% 0px -55% 0px' });

  menuBody.querySelectorAll('.pw-cat-section').forEach(sec => observer.observe(sec));

  setupPromoListeners(document.getElementById('promo-list'));

  const promoList = document.getElementById('promo-list');
  const promoPrev = document.getElementById('promo-prev');
  const promoNext = document.getElementById('promo-next');

  function updatePromoArrows() {
    if (!promoPrev || !promoNext) return;
    const atStart = promoList.scrollLeft <= 2;
    const atEnd   = promoList.scrollLeft + promoList.clientWidth >= promoList.scrollWidth - 2;
    promoPrev.style.display = atStart ? 'none' : '';
    promoNext.style.display = atEnd   ? 'none' : '';
  }

  promoList.addEventListener('scroll', updatePromoArrows, { passive: true });
  updatePromoArrows();

  promoPrev?.addEventListener('click', () => promoList.scrollBy({ left: -320, behavior: 'smooth' }));
  promoNext?.addEventListener('click', () => promoList.scrollBy({ left:  320, behavior: 'smooth' }));
}

// ── PRODUCT SHEET ─────────────────────────────────────────────
function abrirProductSheet(producto) {
  productoActivo         = producto;
  cantActual             = 1;
  opcionActiva           = null;
  adicionesSeleccionadas = [];
  bordeSeleccionado      = null;
  mezclaState            = null;
  sheetObs.value         = '';

  // Cerrar adiciones en mobile al abrir nuevo producto
  document.getElementById('sheet-adiciones-body')?.classList.remove('open');
  document.getElementById('btn-adiciones-toggle')?.setAttribute('aria-expanded', 'false');

  sheetNombre.textContent = producto.nombre;
  sheetDesc.textContent   = producto.descripcion || '';

  const opciones = Object.entries(producto.opciones);

  if (opciones.length === 1) {
    opcionActiva = { nombre: opciones[0][0], precio: opciones[0][1] };
    sheetOpcionesWrap.style.display = 'none';
  } else {
    sheetOpcionesWrap.style.display = '';
    sheetOpciones.innerHTML = opciones.map(([nombre, precio], i) =>
      `<button class="pw-opcion-btn${i === 0 ? ' active' : ''}"
               data-nombre="${nombre}" data-precio="${precio}">
         ${nombre}
         <span class="pw-opcion-precio">${formatPrecio(precio)}</span>
       </button>`
    ).join('');

    opcionActiva = { nombre: opciones[0][0], precio: opciones[0][1] };

    sheetOpciones.querySelectorAll('.pw-opcion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sheetOpciones.querySelectorAll('.pw-opcion-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        opcionActiva           = { nombre: btn.dataset.nombre, precio: Number(btn.dataset.precio) };
        cantActual             = 1;
        adicionesSeleccionadas = [];
        bordeSeleccionado      = null;
        mezclaState            = null;
        cantNum.textContent    = cantActual;
        actualizarMezclaBtn();
        renderAdicionesSection();
        actualizarBtnAgregar();
      });
    });
  }

  cantNum.textContent = cantActual;
  actualizarMezclaBtn();
  renderAdicionesSection();
  actualizarBtnAgregar();
  abrirSheet(productSheet);
}

// ── BOTÓN ½+½ ─────────────────────────────────────────────────
function actualizarMezclaBtn() {
  const esPizza = productoActivo && CATS_PIZZAS.includes(productoActivo.categoria);
  const mixable = esPizza && opcionActiva && TAMANOS_MIXABLES.has(opcionActiva.nombre);
  sheetMezclaWrap.style.display = mixable ? '' : 'none';
}

function abrirSegundoSabor() {
  if (!opcionActiva || !productoActivo) return;

  const sabor1  = productoActivo;
  const tamano  = opcionActiva.nombre;
  const precio1 = opcionActiva.precio;

  // Reúne todos los sabores de pizza (excluye Pizzetas) que tengan ese tamaño
  const llavesPizzas = CATS_PIZZAS.filter(k => k !== 'Pizzetas Premium');
  let todosSabores = [];
  llavesPizzas.forEach(key => {
    if (menuData[key]) {
      todosSabores = [...todosSabores, ...menuData[key].map(p => ({ ...p, categoria: key }))];
    }
  });

  const saboresDisponibles = todosSabores.filter(s =>
    s.nombre !== sabor1.nombre && s.opciones[tamano] !== undefined
  );

  mezclaState = { saboresDisponibles, sabor1, tamano, precio1 };

  sabor2Titulo.textContent    = `½ ${sabor1.nombre}`;
  sabor2Subtitulo.textContent = `${tamano} · Elige el 2° sabor`;
  sabor2Buscar.value          = '';
  renderSabores2('');

  abrirSheet(sabor2Sheet);
  setTimeout(() => sabor2Buscar.focus(), 150);
}

function renderSabores2(filtro) {
  if (!mezclaState) return;
  const { saboresDisponibles, sabor1, tamano, precio1 } = mezclaState;

  const filtrados = filtro
    ? saboresDisponibles.filter(s => s.nombre.toLowerCase().includes(filtro.toLowerCase()))
    : saboresDisponibles;

  if (!filtrados.length) {
    sabor2Grid.innerHTML = '<p class="pw-sabor2-vacio">No se encontraron sabores.</p>';
    return;
  }

  sabor2Grid.innerHTML = filtrados.map(s => {
    const precio2     = s.opciones[tamano];
    const precioFinal = Math.max(precio1, precio2);
    return `<button class="pw-sabor2-btn"
                    data-nombre="${s.nombre}"
                    data-precio2="${precio2}"
                    data-estofada="${!!s.esEstofada}">
               <span class="pw-sabor2-nombre">${s.nombre}</span>
               <span class="pw-sabor2-precio">${formatPrecio(precioFinal)}</span>
             </button>`;
  }).join('');

  sabor2Grid.querySelectorAll('.pw-sabor2-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { sabor1, tamano, precio1 } = mezclaState;
      const precio2     = Number(btn.dataset.precio2);
      const precioFinal = Math.max(precio1, precio2);
      const esEstofada2 = btn.dataset.estofada === 'true';
      const esEstofadaFinal = !!(sabor1.esEstofada || esEstofada2);

      // Adiciones seleccionadas; borde solo si ninguno de los 2 sabores es estofado
      const todasAdiciones = [...adicionesSeleccionadas];
      if (bordeSeleccionado && !esEstofadaFinal) todasAdiciones.push(bordeSeleccionado);

      agregarItem({
        nombre:       `${sabor1.nombre} y mitad ${btn.dataset.nombre}`,
        categoria:    sabor1.categoria,
        opcion:       tamano,
        precio:       precioFinal,
        obs:          sheetObs.value.trim(),
        adiciones:    todasAdiciones,
        esAdicionable: true,
        esEstofada:   esEstofadaFinal,
      });

      mezclaState = null;
      cerrarTodo();
      renderCarrito();
    });
  });
}

// ── ADICIONES Y BORDES ────────────────────────────────────────
function renderAdicionesSection() {
  if (!productoActivo || !opcionActiva) return;

  const cat        = productoActivo.categoria;
  const esPizza    = CATS_PIZZAS.includes(cat);
  const tamanoRaw  = esPizza ? opcionActiva.nombre : CATEGORIAS_ADICIONABLES[cat];
  const esAdicionable = esPizza || tamanoRaw !== undefined;

  if (!esAdicionable) {
    sheetAdicionesWrap.style.display = 'none';
    return;
  }

  sheetAdicionesWrap.style.display = '';

  // Re-disparar animación del hint
  const hint = document.getElementById('adiciones-hint');
  if (hint) {
    hint.classList.remove('pw-animate');
    void hint.offsetWidth; // fuerza reflow
    hint.classList.add('pw-animate');
  }

  const adicionesData        = menuData['Adiciones'] || [];
  const adicionesDisponibles = adicionesData
    .map(a => {
      const precio = a.opciones[tamanoRaw];
      return typeof precio === 'number' ? { nombre: a.nombre, precio } : null;
    })
    .filter(Boolean);

  sheetAdicionesEl.innerHTML = adicionesDisponibles.map(a => {
    const activa = adicionesSeleccionadas.some(s => s.nombre === a.nombre);
    return `<button class="pw-adicion-btn${activa ? ' active' : ''}"
                    data-nombre="${a.nombre}" data-precio="${a.precio}">
               ${a.nombre.replace('Adición ', '')}
               <span class="pw-adicion-precio">+${formatPrecio(a.precio)}</span>
             </button>`;
  }).join('');

  sheetAdicionesEl.querySelectorAll('.pw-adicion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nombre = btn.dataset.nombre;
      const precio = Number(btn.dataset.precio);
      const idx = adicionesSeleccionadas.findIndex(s => s.nombre === nombre);
      if (idx >= 0) {
        adicionesSeleccionadas.splice(idx, 1);
        btn.classList.remove('active');
      } else {
        adicionesSeleccionadas.push({ nombre, precio });
        btn.classList.add('active');
      }
      actualizarBtnAgregar();
    });
  });

  // Bordes: solo pizzas no estofadas en tamaños válidos
  const esBordeable = esPizza && !productoActivo.esEstofada && TAMANOS_CON_BORDE.has(opcionActiva.nombre);

  if (esBordeable) {
    sheetBordesWrap.style.display = '';
    const bordePrecio = preciosBordes[opcionActiva.nombre];
    const bordesData  = menuData['Bordes'] || [];

    sheetBordesEl.innerHTML = bordesData.map(b => {
      const activo = bordeSeleccionado?.nombre === b.nombre;
      return `<button class="pw-adicion-btn${activo ? ' active' : ''}"
                      data-nombre="${b.nombre}" data-precio="${bordePrecio}">
                 ${b.nombre}
                 <span class="pw-adicion-precio">+${formatPrecio(bordePrecio)}</span>
               </button>`;
    }).join('');

    sheetBordesEl.querySelectorAll('.pw-adicion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nombre = btn.dataset.nombre;
        const precio = Number(btn.dataset.precio);
        if (bordeSeleccionado?.nombre === nombre) {
          bordeSeleccionado = null;
          btn.classList.remove('active');
        } else {
          bordeSeleccionado = { nombre, precio };
          sheetBordesEl.querySelectorAll('.pw-adicion-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
        actualizarBtnAgregar();
      });
    });
  } else {
    sheetBordesWrap.style.display = 'none';
    bordeSeleccionado = null;
  }
}

function actualizarBtnAgregar() {
  if (!opcionActiva) {
    btnAgregar.textContent = 'Selecciona una opción';
    return;
  }
  const adicionesTotal = adicionesSeleccionadas.reduce((s, a) => s + a.precio, 0)
                       + (bordeSeleccionado ? bordeSeleccionado.precio : 0);
  const total = (opcionActiva.precio + adicionesTotal) * cantActual;
  btnAgregar.textContent = `Agregar · ${formatPrecio(total)}`;
}

// ── RENDER CARRITO ────────────────────────────────────────────
function renderCarrito() {
  const carrito = getCarrito();
  const conteo  = getConteo();
  const total   = getTotal();

  if (cartBadge) { cartBadge.textContent = conteo; cartBadge.classList.toggle('visible', conteo > 0); }
  cartBar.classList.toggle('visible', conteo > 0);
  const bottomCartBadge = document.getElementById('bottom-cart-badge');
  if (bottomCartBadge) {
    bottomCartBadge.textContent = conteo;
    bottomCartBadge.classList.toggle('visible', conteo > 0);
  }
  if (cartBtnTotal) cartBtnTotal.textContent = conteo > 0 ? formatPrecio(total) : '';
  if (conteo > 0) {
    cartBarItems.textContent = `${conteo} ${conteo === 1 ? 'producto' : 'productos'}`;
    cartBarTotal.textContent  = formatPrecio(total);
  }

  const list   = document.getElementById('cart-items-list');
  const footer = document.getElementById('cart-footer');

  if (!carrito.length) {
    list.innerHTML   = '<div class="pw-cart-empty">Tu carrito está vacío</div>';
    footer.innerHTML = '';
    return;
  }

  list.innerHTML = carrito.map((item, idx) => {
    const precioUnitario = item.precio + getTotalAdiciones(item);
    const subtotal = precioUnitario * item.cantidad;
    const formulaHtml = item.cantidad > 1
      ? `<span class="pw-cart-formula">${item.cantidad} × ${formatPrecio(precioUnitario)} = </span>`
      : '';
    return `
    <div class="pw-cart-item">
      <div class="pw-cart-item-header">
        <button class="pw-cart-delete-btn" data-idx="${idx}" aria-label="Eliminar producto">🗑</button>
        <span class="pw-cart-item-nombre">${item.nombre}</span>
      </div>
      <div class="pw-cart-item-row">
        <span class="pw-cart-item-opcion">${item.opcion}</span>
        <span class="pw-cart-item-base-precio">${formatPrecio(item.precio)}</span>
      </div>
      ${item.adiciones?.length ? item.adiciones.map(a => `
      <div class="pw-cart-item-adicion">
        <span>${a.nombre}</span>
        <span class="pw-cart-adicion-precio">+${formatPrecio(a.precio)}</span>
      </div>`).join('') : ''}
      ${item.obs ? `<div class="pw-cart-item-obs">"${item.obs}"</div>` : ''}
      <div class="pw-cart-item-footer">
        <div class="pw-cart-item-qty">
          <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="-1" aria-label="Quitar uno">−</button>
          <span class="pw-cart-qty-num">${item.cantidad}</span>
          <button class="pw-cart-qty-btn" data-idx="${idx}" data-delta="1" aria-label="Agregar uno">+</button>
        </div>
        <div class="pw-cart-item-precio">${formulaHtml}${formatPrecio(subtotal)}</div>
      </div>
    </div>`;
  }).join('');

  footer.innerHTML = `
    <div class="pw-cart-total-row">
      <span>Total</span>
      <span>${formatPrecio(total)}</span>
    </div>
    <button class="pw-btn-primary" id="btn-checkout">Proceder al pago</button>`;

  list.querySelectorAll('.pw-cart-qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      actualizarCantidad(Number(btn.dataset.idx), Number(btn.dataset.delta));
      renderCarrito();
    });
  });

  list.querySelectorAll('.pw-cart-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      quitarItem(Number(btn.dataset.idx));
      renderCarrito();
    });
  });

  document.getElementById('btn-checkout')?.addEventListener('click', () => {
    window.location.href = 'checkout.html';
  });
}

// ── SHEETS ────────────────────────────────────────────────────
function abrirSheet(sheet) {
  overlay.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarSheet(sheet) {
  sheet.classList.remove('open');
  if (!productSheet.classList.contains('open') &&
      !cartSheet.classList.contains('open') &&
      !sabor2Sheet.classList.contains('open') &&
      !promoSheet.classList.contains('open')) {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function cerrarTodo() {
  productSheet.classList.remove('open');
  cartSheet.classList.remove('open');
  sabor2Sheet.classList.remove('open');
  promoSheet.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// ── LISTENERS ─────────────────────────────────────────────────
function setupListeners() {
  document.getElementById('btn-menos').addEventListener('click', () => {
    if (cantActual > 1) { cantActual--; cantNum.textContent = cantActual; actualizarBtnAgregar(); }
  });
  document.getElementById('btn-mas').addEventListener('click', () => {
    cantActual++; cantNum.textContent = cantActual; actualizarBtnAgregar();
  });

  // Agregar normal al carrito
  btnAgregar.addEventListener('click', () => {
    if (!opcionActiva) return;
    const todasAdiciones = [...adicionesSeleccionadas];
    if (bordeSeleccionado) todasAdiciones.push(bordeSeleccionado);
    agregarItem({
      nombre:       productoActivo.nombre,
      categoria:    productoActivo.categoria,
      opcion:       opcionActiva.nombre,
      precio:       opcionActiva.precio,
      obs:          sheetObs.value.trim(),
      adiciones:    todasAdiciones,
      esAdicionable: CATS_PIZZAS.includes(productoActivo.categoria) || !!CATEGORIAS_ADICIONABLES[productoActivo.categoria],
      esEstofada:   !!productoActivo.esEstofada,
    });
    cerrarSheet(productSheet);
    renderCarrito();
  });

  // ½+½ mezcla
  document.getElementById('btn-mezcla').addEventListener('click', abrirSegundoSabor);
  document.getElementById('btn-cerrar-sabor2').addEventListener('click', () => cerrarSheet(sabor2Sheet));
  sabor2Buscar.addEventListener('input', () => renderSabores2(sabor2Buscar.value));

  // Cerrar sheets
  document.getElementById('btn-adiciones-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('sheet-adiciones-body');
    const btn  = document.getElementById('btn-adiciones-toggle');
    const open = body.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  document.getElementById('btn-cerrar-producto').addEventListener('click', () => cerrarSheet(productSheet));
  document.getElementById('btn-cerrar-carrito').addEventListener('click', () => cerrarSheet(cartSheet));
  document.getElementById('btn-cerrar-promo').addEventListener('click', () => cerrarSheet(promoSheet));

  // Abrir carrito
  document.getElementById('btn-abrir-carrito')?.addEventListener('click', () => abrirSheet(cartSheet));
  document.getElementById('btn-cart-bar').addEventListener('click', () => abrirSheet(cartSheet));
  document.getElementById('bottom-nav-cart-btn')?.addEventListener('click', () => abrirSheet(cartSheet));

  // Overlay cierra todo
  overlay.addEventListener('click', cerrarTodo);

  // Swipe hacia abajo cierra sheet (UX móvil)
  [productSheet, cartSheet, sabor2Sheet, promoSheet].forEach(sheet => {
    let startY = 0;
    sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchend', e => {
      const delta = e.changedTouches[0].clientY - startY;
      if (delta > 80) cerrarSheet(sheet);
    }, { passive: true });
  });
}

// ── ARRANCAR ──────────────────────────────────────────────────
init();
