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

// Info visual para tarjetas de tamaño de pizza
const PIZZA_SIZES = {
  'Porción': { cms: 'Triangular', porciones: '1 porción' },
  'Pequeña': { cms: '30 Cms', porciones: '4 porciones' },
  'Mediana':  { cms: '35 Cms', porciones: '6 porciones' },
  'Grande':   { cms: '40 Cms', porciones: '8 porciones' },
  'Jumbo':    { cms: '50 Cms', porciones: '10 porciones' },
};

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
  // Calzones
  'Calzone Clásico':            '../Imagenes/productos/CalzoneClasico.jpg',
  'Calzone Especial':           '../Imagenes/productos/CalzoneEspecial.jpg',
  // Stromboli
  'Stromboli Clásico':          '../Imagenes/productos/StromboliClasico.jpg',
  'Stromboli Especial':         '../Imagenes/productos/StromboliEspecial.jpg',
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
const bottomCartBadge   = document.getElementById('bottom-cart-badge');
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
    <div class="pw-sede-bar-box">
      <div class="pw-sede-bar-info">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="pw-sede-bar-pin"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
        <div class="pw-sede-bar-text">
          <span class="pw-sede-bar-label">Preparando en</span>
          <strong class="pw-sede-bar-nombre">${nombre}</strong>
        </div>
      </div>
      <a href="index.html" class="pw-sede-bar-cambiar">Cambiar sede</a>
    </div>`;
  document.title = `Drive Pizza — ${nombre}`;

  // Links redes sociales del footer: datos de la sede o fallback Linktree
  const WA_FALLBACK = 'https://linktr.ee/drivepizzabga';
  const waUrl = sede.whatsapp ? `https://wa.me/${sede.whatsapp}` : WA_FALLBACK;
  document.querySelectorAll('.pw-footer-wa-btn, .pw-footer-social-link[aria-label="WhatsApp"]')
    .forEach(el => { el.href = waUrl; });
  if (sede.instagram) document.querySelector('.pw-footer-social-link[aria-label="Instagram"]').href = sede.instagram;
  if (sede.facebook)  document.querySelector('.pw-footer-social-link[aria-label="Facebook"]').href  = sede.facebook;
  if (sede.tiktok)    document.querySelector('.pw-footer-social-link[aria-label="TikTok"]').href    = sede.tiktok;

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
  const subShellEl  = document.querySelector('.pw-sub-shell');
  if (menuShellEl) {
    document.documentElement.style.setProperty('--pw-header-h', menuShellEl.offsetHeight + 'px');
  }
  if (menuShellEl && subShellEl) {
    document.documentElement.style.setProperty('--pw-sticky-top', (menuShellEl.offsetHeight + subShellEl.offsetHeight) + 'px');
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

const CAT_ICONS = {
  'Pizzas':       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(0 5) rotate(150 12 12)"><g transform="translate(12 12) scale(1.2) translate(-12 -12)"><path d="M9.44 9.44Q12 4 14.56 9.44L17.44 15.56Q20 21 14 21L10 21Q4 21 6.56 15.56Z"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/><circle cx="9.5" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="17" r="1" fill="currentColor" stroke="none"/></g></g></svg>`,
  'Bebidas':      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1.5 16h-7L7 3z"/><line x1="6" y1="8" x2="18" y2="8"/></svg>`,
  'Calzones':     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15 Q5 6 12 5 Q19 6 19 15 Q15 21 12 21 Q9 21 5 15z"/><path d="M5 15 Q12 12 19 15"/></svg>`,
  'Stromboli':    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="4"/><line x1="8" y1="11" x2="8" y2="13"/><line x1="12" y1="11" x2="12" y2="13"/><line x1="16" y1="11" x2="16" y2="13"/></svg>`,
  'Hamburguesas': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8 Q12 4 20 8"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="4" y1="19" x2="20" y2="19"/></svg>`,
  'Sandwiches':   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6 Q12 3 20 6"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="4" y1="14" x2="20" y2="14"/><path d="M4 18 Q12 21 20 18"/></svg>`,
  'Ensaladas':    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 Q17 7 15 13"/><path d="M12 3 Q7 7 9 13"/><path d="M9 13 Q12 20 15 13"/><line x1="7" y1="13" x2="17" y2="13"/></svg>`,
  'Lasañas':      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="15" width="18" height="4" rx="1"/></svg>`,
  'Pastas':       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><path d="M8 7 Q12 5 16 7"/><path d="M6 12 Q12 10 18 12"/><path d="M8 17 Q12 15 16 17"/></svg>`,
  'Maicitos':     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 Q9 2 12 2 Q15 2 15 4 Q17 7 17 13 Q17 19 12 21 Q7 19 7 13 Q7 7 9 4z"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/></svg>`,
  'Entradas':     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="3" x2="8" y2="21"/><path d="M5 3h6v9a3 3 0 01-6 0V3z"/><line x1="16" y1="3" x2="16" y2="21"/></svg>`,
};


const CAT_TO_GRUPO = {};
GRUPOS_NAV.forEach(g => g.cats.forEach(c => { CAT_TO_GRUPO[c] = g.label; }));


function scrollToSection(id) {
  const sec = document.getElementById(id);
  if (!sec) return;

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
    `<button class="pw-cat-pill" data-grupo="${g.label}">${CAT_ICONS[g.label] || ''}${g.label}</button>`
  ).join('');

  catsNav.querySelectorAll('.pw-cat-pill').forEach(pill => {
    pill.addEventListener('click', () => activarGrupo(pill.dataset.grupo, true));
  });

  activarGrupo('Pizzas', false);
}

// ── RENDER PRODUCTOS ──────────────────────────────────────────
function renderProductos() {
  menuBody.innerHTML = GRUPOS_NAV.flatMap(g => g.cats).map(cat => {
    const productos = menuData[cat];
    if (!productos) return '';
    const secId = 'sec-' + cat.replace(/\s+/g, '-');

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
      <section class="pw-cat-section" id="${secId}">
        <div class="pw-cat-section-title">${cat}</div>
        <div class="pw-product-list">${cardsHTML}</div>
      </section>`;
  }).join('');

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

  initActiveCatTitle();
}

function initActiveCatTitle() {
  const titleEl = document.getElementById('active-cat-title');
  if (!titleEl) return;

  const subShell  = document.querySelector('.pw-sub-shell');
  const catSections = [...menuBody.querySelectorAll('.pw-cat-section')];
  const catTitles   = [...menuBody.querySelectorAll('.pw-cat-section-title')];
  if (!catSections.length) return;

  // Primera tarjeta de cada sección como punto de referencia
  const firstCards = catSections.map(s => s.querySelector('.pw-product-card'));

  titleEl.textContent = catTitles[0].textContent;

  let fadeTimer = null;
  function setTitle(newText) {
    if (titleEl.dataset.pending === newText || titleEl.textContent === newText) return;
    titleEl.dataset.pending = newText;
    titleEl.style.opacity = '0';
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      titleEl.textContent = newText;
      titleEl.style.opacity = '1';
      delete titleEl.dataset.pending;
    }, 130);
  }

  let ticking = false;
  function update() {
    const atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 10);
    let activeIdx = 0;
    if (atBottom) {
      activeIdx = catSections.length - 1;
    } else {
      const anticipation = window.innerWidth >= 600 ? 120 : 90;
      const threshold = (subShell ? subShell.getBoundingClientRect().bottom : 0) + anticipation;
      for (let i = catSections.length - 1; i >= 0; i--) {
        const ref = firstCards[i] || catSections[i];
        if (ref.getBoundingClientRect().top <= threshold) {
          activeIdx = i;
          break;
        }
      }
    }
    setTitle(catTitles[activeIdx].textContent);
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}

// ── ESTADO DE PASOS (activar/desactivar) ──────────────────────
function actualizarEstadoPasos() {
  if (!productoActivo) return;
  const tieneVariantes = Object.keys(productoActivo.opciones).length > 1;
  const desbloqueado   = !tieneVariantes || opcionActiva !== null;
  ['step-personalizar', 'step-cantidad', 'step-obs'].forEach(id => {
    document.getElementById(id)?.classList.toggle('pw-step-disabled', !desbloqueado);
  });
}

// ── LABELS DE PASOS (scroll vertical) ────────────────────────
function renderStepLabels() {
  if (!productoActivo) return;
  const tieneVariantes = Object.keys(productoActivo.opciones).length > 1;
  const esAdicionable  = CATS_PIZZAS.includes(productoActivo.categoria) || CATEGORIAS_ADICIONABLES[productoActivo.categoria] !== undefined;

  const visibles = [];
  if (tieneVariantes) visibles.push('tamano');
  if (esAdicionable)  visibles.push('personalizar');
  visibles.push('cantidad');
  visibles.push('obs');

  const total = visibles.length;

  document.getElementById('step-tamano').style.display      = tieneVariantes ? '' : 'none';
  document.getElementById('step-personalizar').style.display = esAdicionable  ? '' : 'none';

  visibles.forEach((key, i) => {
    const el = document.getElementById('step-num-' + key);
    if (el) el.textContent = `Paso ${i + 1} de ${total}`;
  });
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
  document.getElementById('sheet-bordes-body')?.classList.remove('open');
  document.getElementById('btn-bordes-toggle')?.setAttribute('aria-expanded', 'false');
  // Resetear tarjetas de tamaño y mezcla
  const tamanoOpts   = document.getElementById('tamano-opts');
  const tamanoSelecc = document.getElementById('tamano-selecc');
  const mezclaSelecc = document.getElementById('mezcla-selecc');
  if (tamanoOpts)   tamanoOpts.style.display   = '';
  if (tamanoSelecc) tamanoSelecc.style.display = 'none';
  if (mezclaSelecc) mezclaSelecc.style.display = 'none';

  // Imagen del producto
  const sheetImgWrap = document.getElementById('sheet-img-wrap');
  const sheetImg     = document.getElementById('sheet-img');
  const imgSrc       = PRODUCT_IMAGES[producto.nombre];
  if (imgSrc) {
    sheetImg.src = imgSrc;
    sheetImgWrap.classList.add('has-img');
  } else {
    sheetImgWrap.classList.remove('has-img');
    sheetImg.src = '';
  }

  sheetNombre.textContent = producto.nombre;
  sheetDesc.textContent   = producto.descripcion || '';

  const opciones = Object.entries(producto.opciones);

  if (opciones.length === 1) {
    opcionActiva = { nombre: opciones[0][0], precio: opciones[0][1] };
    sheetOpcionesWrap.style.display = 'none';
  } else {
    sheetOpcionesWrap.style.display = '';
    const usaCards = opciones.every(([nombre]) => PIZZA_SIZES[nombre]);
    sheetOpciones.className = usaCards ? 'pw-opciones pw-opciones-grid' : 'pw-opciones';
    sheetOpciones.innerHTML = opciones.map(([nombre, precio]) => {
      const size = PIZZA_SIZES[nombre];
      if (size) {
        return `<button class="pw-opcion-btn pw-opcion-card"
                         data-nombre="${nombre}" data-precio="${precio}">
                  <span class="pw-opcion-card-nombre">${nombre}</span>
                  <span class="pw-opcion-card-cms">${size.cms}</span>
                  <span class="pw-opcion-card-porciones">${size.porciones}</span>
                  <span class="pw-opcion-precio">${formatPrecio(precio)}</span>
                </button>`;
      }
      return `<button class="pw-opcion-btn"
                       data-nombre="${nombre}" data-precio="${precio}">
                ${nombre}
                <span class="pw-opcion-precio">${formatPrecio(precio)}</span>
              </button>`;
    }).join('');

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
        actualizarResumenTamano();
        actualizarResumenBorde();
        actualizarResumenAdiciones();
        actualizarEstadoPasos();
        actualizarBtnAgregar();
      });
    });
  }

  cantNum.textContent = cantActual;
  actualizarMezclaBtn();
  renderAdicionesSection();
  actualizarResumenBorde();
  actualizarResumenAdiciones();
  actualizarEstadoPasos();
  renderStepLabels();
  actualizarBtnAgregar();
  abrirSheet(productSheet);
}

// ── BOTÓN ½+½ ─────────────────────────────────────────────────
function actualizarMezclaBtn() {
  const esPizza = productoActivo && CATS_PIZZAS.includes(productoActivo.categoria);
  const mixable = esPizza && (!opcionActiva || TAMANOS_MIXABLES.has(opcionActiva.nombre));
  sheetMezclaWrap.style.display = mixable ? '' : 'none';
}

function abrirSegundoSabor() {
  if (!productoActivo) return;
  if (!opcionActiva) {
    const modal = document.getElementById('modal-aviso-tamano');
    if (modal) {
      modal.style.display = '';
      const cerrar = () => { modal.style.display = 'none'; };
      document.getElementById('btn-aviso-tamano-ok').onclick    = cerrar;
      modal.onclick = (e) => { if (e.target === modal) cerrar(); };
    }
    return;
  }

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
      const precio2     = Number(btn.dataset.precio2);
      const esEstofada2 = btn.dataset.estofada === 'true';
      mezclaState.sabor2      = { nombre: btn.dataset.nombre, esEstofada: esEstofada2 };
      mezclaState.precioFinal = Math.max(mezclaState.precio1, precio2);

      cerrarSheet(sabor2Sheet);
      actualizarResumenMezcla();
      actualizarBtnAgregar();
    });
  });
}

// ── RESUMEN DE SELECCIÓN ──────────────────────────────────────
function actualizarResumenTamano() {
  const optsEl   = document.getElementById('tamano-opts');
  const seleccEl = document.getElementById('tamano-selecc');
  const valEl    = document.getElementById('tamano-selecc-val');
  if (!optsEl || !seleccEl) return;
  if (opcionActiva) {
    if (valEl) valEl.textContent = `${opcionActiva.nombre} · ${formatPrecio(opcionActiva.precio)}`;
    optsEl.style.display   = 'none';
    seleccEl.style.display = '';
  } else {
    optsEl.style.display   = '';
    seleccEl.style.display = 'none';
  }
}

function actualizarResumenBorde() {
  const optsEl   = document.getElementById('bordes-opts');
  const seleccEl = document.getElementById('borde-selecc');
  const valEl    = document.getElementById('borde-selecc-val');
  if (!optsEl || !seleccEl) return;
  if (bordeSeleccionado) {
    if (valEl) valEl.textContent = `${bordeSeleccionado.nombre.replace('Borde ', '')} (+${formatPrecio(bordeSeleccionado.precio)})`;
    optsEl.style.display   = 'none';
    seleccEl.style.display = '';
  } else {
    optsEl.style.display   = '';
    seleccEl.style.display = 'none';
  }
}

function actualizarResumenAdiciones() {
  const seleccEl = document.getElementById('adiciones-selecc');
  const valEl    = document.getElementById('adiciones-selecc-val');
  if (!seleccEl) return;
  if (adicionesSeleccionadas.length > 0) {
    if (valEl) valEl.textContent = adicionesSeleccionadas.map(a => a.nombre.replace('Adición ', '')).join(', ');
    seleccEl.style.display = '';
  } else {
    seleccEl.style.display = 'none';
  }
}

// ── MODAL CONFIRMACIÓN ADICIÓN EXTRA ──────────────────────────
function confirmarAdicionExtra(nombre, precio, btn) {
  const modal  = document.getElementById('modal-adicion-extra');
  const msgEl  = document.getElementById('modal-adicion-msg');
  if (!modal) return;

  const nombreLimpio = nombre.replace('Adición ', '');
  const total = adicionesSeleccionadas.length;
  if (msgEl) msgEl.textContent = `Ya tienes ${total} ingrediente${total > 1 ? 's' : ''} adicionado${total > 1 ? 's' : ''}. ¿Deseas agregar "${nombreLimpio}" como ingrediente extra?`;
  modal.style.display = '';

  const cerrar = () => {
    modal.style.display = 'none';
    document.getElementById('btn-adicion-extra-confirm').removeEventListener('click', onConfirm);
    document.getElementById('btn-adicion-extra-cancel').removeEventListener('click', onCancel);
    modal.removeEventListener('click', onOverlay);
  };
  const onConfirm = () => {
    adicionesSeleccionadas.push({ nombre, precio });
    btn.classList.add('active');
    actualizarResumenAdiciones();
    actualizarBtnAgregar();
    cerrar();
  };
  const onCancel  = () => cerrar();
  const onOverlay = (e) => { if (e.target === modal) cerrar(); };

  document.getElementById('btn-adicion-extra-confirm').addEventListener('click', onConfirm);
  document.getElementById('btn-adicion-extra-cancel').addEventListener('click', onCancel);
  modal.addEventListener('click', onOverlay);
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
               <span class="pw-adicion-nombre">${a.nombre.replace('Adición ', '')}</span>
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
        actualizarResumenAdiciones();
        actualizarBtnAgregar();
      } else if (adicionesSeleccionadas.length >= 2) {
        confirmarAdicionExtra(nombre, precio, btn);
      } else {
        adicionesSeleccionadas.push({ nombre, precio });
        btn.classList.add('active');
        actualizarResumenAdiciones();
        actualizarBtnAgregar();
      }
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
                 <span class="pw-adicion-nombre">${b.nombre.replace('Borde ', '')}</span>
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
        actualizarResumenBorde();
        actualizarBtnAgregar();
      });
    });
  } else {
    sheetBordesWrap.style.display = 'none';
    bordeSeleccionado = null;
  }

}

function actualizarResumenMezcla() {
  const mezclaEl  = document.getElementById('mezcla-selecc');
  const tamanoEl  = document.getElementById('tamano-selecc');
  const optsEl    = document.getElementById('tamano-opts');
  const valEl     = document.getElementById('mezcla-selecc-val');
  if (!mezclaEl) return;
  if (mezclaState?.sabor2) {
    if (valEl) valEl.textContent = `Mitad ${mezclaState.sabor1.nombre} + mitad ${mezclaState.sabor2.nombre} · ${formatPrecio(mezclaState.precioFinal)}`;
    mezclaEl.style.display = '';
    if (tamanoEl) tamanoEl.style.display = 'none';
    if (optsEl)   optsEl.style.display   = 'none';
  } else {
    mezclaEl.style.display = 'none';
    actualizarResumenTamano();
  }
}

function actualizarBtnAgregar() {
  if (!opcionActiva) {
    btnAgregar.textContent = 'Selecciona una opción';
    return;
  }
  const precioBase     = mezclaState?.sabor2 ? mezclaState.precioFinal : opcionActiva.precio;
  const adicionesTotal = adicionesSeleccionadas.reduce((s, a) => s + a.precio, 0)
                       + (bordeSeleccionado ? bordeSeleccionado.precio : 0);
  const total = (precioBase + adicionesTotal) * cantActual;
  btnAgregar.textContent = `Agregar · ${formatPrecio(total)}`;
}

// ── RENDER CARRITO ────────────────────────────────────────────
function renderCarrito() {
  const carrito = getCarrito();
  const conteo  = getConteo();
  const total   = getTotal();

  if (bottomCartBadge) {
    bottomCartBadge.textContent = conteo;
    bottomCartBadge.classList.toggle('visible', conteo > 0);
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

  // Cambiar mezcla seleccionada (reabrir sabor2)
  document.getElementById('btn-mezcla-cambiar')?.addEventListener('click', () => {
    if (mezclaState) {
      mezclaState.sabor2      = null;
      mezclaState.precioFinal = null;
    }
    actualizarResumenMezcla();
    abrirSegundoSabor();
  });

  // Cambiar tamaño seleccionado
  document.getElementById('btn-tamano-cambiar')?.addEventListener('click', () => {
    const optsEl   = document.getElementById('tamano-opts');
    const seleccEl = document.getElementById('tamano-selecc');
    if (optsEl)   optsEl.style.display   = '';
    if (seleccEl) seleccEl.style.display = 'none';
  });

  // Cambiar borde seleccionado
  document.getElementById('btn-borde-cambiar')?.addEventListener('click', () => {
    bordeSeleccionado = null;
    sheetBordesEl.querySelectorAll('.pw-adicion-btn').forEach(b => b.classList.remove('active'));
    actualizarResumenBorde();
    actualizarBtnAgregar();
  });

  // Cambiar adiciones seleccionadas
  document.getElementById('btn-adiciones-cambiar')?.addEventListener('click', () => {
    adicionesSeleccionadas = [];
    sheetAdicionesEl.querySelectorAll('.pw-adicion-btn').forEach(b => b.classList.remove('active'));
    actualizarResumenAdiciones();
    actualizarBtnAgregar();
  });

  // Agregar al carrito
  btnAgregar.addEventListener('click', () => {
    if (!opcionActiva) return;
    if (mezclaState?.sabor2) {
      const { sabor1, tamano, sabor2, precioFinal } = mezclaState;
      const esEstofadaFinal = !!(sabor1.esEstofada || sabor2.esEstofada);
      const todasAdiciones  = [...adicionesSeleccionadas];
      if (bordeSeleccionado && !esEstofadaFinal) todasAdiciones.push(bordeSeleccionado);
      agregarItem({
        nombre:        `${sabor1.nombre} y mitad ${sabor2.nombre}`,
        categoria:     sabor1.categoria,
        opcion:        tamano,
        precio:        precioFinal,
        obs:           sheetObs.value.trim(),
        adiciones:     todasAdiciones,
        esAdicionable: true,
        esEstofada:    esEstofadaFinal,
      });
    } else {
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
    }
    cerrarSheet(productSheet);
    renderCarrito();
  });

  // ½+½ mezcla
  document.getElementById('btn-mezcla').addEventListener('click', abrirSegundoSabor);
  document.getElementById('btn-cerrar-sabor2').addEventListener('click', () => {
    cerrarSheet(sabor2Sheet);
    actualizarResumenMezcla();
  });
  sabor2Buscar.addEventListener('input', () => renderSabores2(sabor2Buscar.value));

  // Cerrar sheets
  document.getElementById('btn-adiciones-toggle')?.addEventListener('click', () => {
    const body    = document.getElementById('sheet-adiciones-body');
    const btn     = document.getElementById('btn-adiciones-toggle');
    const open    = body.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  document.getElementById('btn-bordes-toggle')?.addEventListener('click', () => {
    const body = document.getElementById('sheet-bordes-body');
    const btn  = document.getElementById('btn-bordes-toggle');
    const open = body.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  document.getElementById('btn-cerrar-producto').addEventListener('click', () => cerrarSheet(productSheet));
  document.getElementById('btn-cerrar-carrito').addEventListener('click', () => cerrarSheet(cartSheet));
  document.getElementById('btn-cerrar-promo').addEventListener('click', () => cerrarSheet(promoSheet));

  // Abrir carrito
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
