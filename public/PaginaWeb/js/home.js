/* ============================================================
   Drive Pizza — Vista de Inicio (SPA)
   ============================================================ */

import { cargarSedes, estaAbierta, setSedeActual, getSedeActual, displayNombre } from './sede.js';
import { vaciarCarrito } from './carrito.js';

// ── ESTADO ───────────────────────────────────────────────────
let sedesData    = [];
let userLat      = null;
let userLng      = null;
let initialized  = false;
let _onSedeSelected = null;

// ── CONSTANTES ───────────────────────────────────────────────
const BANNERS = [
  { src: '../Imagenes/banners/banner1-desk.jpg',    srcMobile: '../Imagenes/banners/BannerPaginaWeb.jpeg',  alt: 'Drive Pizza' },
  { src: '../Imagenes/banners/banner2-desk.jpg',    srcMobile: '../Imagenes/banners/BannerPaginaWeb2.jpeg', alt: 'Drive Pizza', objectPosition: 'center bottom' },
  { src: '../Imagenes/banners/BannerBerrionda.png', srcMobile: '../Imagenes/banners/BannerBerrionda.png',   alt: 'Promo Berrionda' },
];

const SEDE_IMGS = {
  'acropolis':   '../Imagenes/sedes/acropolis.png',
  'cabecera':    '../Imagenes/sedes/cabecera.png',
  'cañaveral':   '../Imagenes/sedes/canaveral.png',
  'canaveral':   '../Imagenes/sedes/canaveral.png',
  'megamall':    '../Imagenes/sedes/megamall.png',
  'piedecuesta': '../Imagenes/sedes/piedecuesta.png',
  'unico':       '../Imagenes/sedes/unico.jpeg',
  'único':       '../Imagenes/sedes/unico.jpeg',
};

// ── BANNER ───────────────────────────────────────────────────
function initBanner() {
  const wrapper = document.getElementById('pw-banner');
  const track   = document.getElementById('pw-banner-track');
  const dotsEl  = document.getElementById('pw-banner-dots');
  if (!wrapper || !track || !dotsEl || !BANNERS.length) return;

  track.innerHTML = BANNERS.map(b => `
    <div class="pw-banner-slide">
      ${b.href ? `<a href="${b.href}">` : ''}
      <picture>
        ${b.srcMobile ? `<source media="(max-width:599px)" srcset="${b.srcMobile}">` : ''}
        <img src="${b.src}" alt="${b.alt ?? ''}" ${b.objectPosition ? `style="object-position:${b.objectPosition}"` : ''}>
      </picture>
      <div class="pw-banner-overlay"></div>
      ${b.href ? '</a>' : ''}
    </div>`).join('');

  dotsEl.innerHTML = BANNERS.map((_, i) =>
    `<button class="pw-banner-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Ir a banner ${i + 1}"></button>`
  ).join('');

  wrapper.style.display = '';

  let current = 0, timer = null;
  const dots = dotsEl.querySelectorAll('.pw-banner-dot');

  function goTo(idx) {
    current = (idx + BANNERS.length) % BANNERS.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }
  function startAuto() { timer = setInterval(() => goTo(current + 1), 4500); }
  function resetAuto()  { clearInterval(timer); startAuto(); }

  dots.forEach(d => d.addEventListener('click', () => { goTo(Number(d.dataset.i)); resetAuto(); }));

  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend',   e => {
    const delta = e.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 40) { goTo(current + (delta < 0 ? 1 : -1)); resetAuto(); }
  }, { passive: true });

  if (BANNERS.length > 1) startAuto();
}

// ── HAVERSINE ────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── RENDER SEDES ─────────────────────────────────────────────
function renderSedes() {
  const grid = document.getElementById('sedes-grid');
  if (!grid) return;
  const tieneUbicacion = userLat !== null && userLng !== null;

  const sedes = sedesData.map(s => {
    const dist      = (tieneUbicacion && s.lat && s.lng) ? haversine(userLat, userLng, s.lat, s.lng) : null;
    const fueraZona = tieneUbicacion && dist !== null && s.radio_km ? dist > s.radio_km : false;
    return { ...s, _dist: dist, _fueraZona: fueraZona };
  });

  sedes.sort((a, b) => {
    const aD = estaAbierta(a) && !a._fueraZona;
    const bD = estaAbierta(b) && !b._fueraZona;
    if (aD !== bD) return Number(bD) - Number(aD);
    if (a._dist !== null && b._dist !== null) return a._dist - b._dist;
    return 0;
  });

  const iCercana = tieneUbicacion ? sedes.findIndex(s => s._dist !== null && !s._fueraZona) : -1;

  grid.innerHTML = sedes.map((sede, idx) => {
    const abierta      = estaAbierta(sede);
    const fueraZona    = sede._fueraZona;
    const disponible   = abierta && !fueraZona;
    const nombre       = displayNombre(sede);
    const sedeImg      = SEDE_IMGS[(sede.name || '').toLowerCase().trim()] || '../Imagenes/sede-placeholder.jpeg';
    const esMasCercana = idx === iCercana;
    const distLabel    = sede._dist !== null
      ? (sede._dist < 1 ? `Distancia ${Math.round(sede._dist * 1000)} m` : `Distancia ${sede._dist.toFixed(1)} km`)
      : '';
    return `
      <div class="pw-sede-card-h${disponible ? '' : ' pw-sede-card-h--cerrada'}"
           data-sede='${JSON.stringify(sede).replace(/'/g, '&#39;')}'
           ${disponible ? `tabindex="0" role="button" aria-label="Pedir en ${nombre}"` : 'aria-disabled="true"'}>
        <div class="pw-sede-card-h-img"><img src="${sedeImg}" alt="${nombre}"></div>
        <div class="pw-sede-card-h-info">
          <span class="pw-sede-status pw-sede-status--${fueraZona ? 'fuera' : (abierta ? 'abierta' : 'cerrada')}">
            ${fueraZona ? 'Fuera de zona' : (abierta ? 'Abierto' : 'Cerrado')}
          </span>
          <div class="pw-sede-nombre">${nombre}</div>
          ${distLabel ? `<div class="pw-sede-dist">${distLabel}</div>` : ''}
          <div class="pw-sede-tiempo">&#128336; 45 - 60 min &nbsp;&#11088; 4.8</div>
          ${esMasCercana ? `<span class="pw-sede-badge-cercana">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            Más cercana</span>` : ''}
        </div>
        <button class="pw-sede-btn pw-sede-btn--${disponible ? 'abierta' : 'cerrada'}" ${!disponible ? 'disabled' : ''}>
          ${disponible ? 'Ver menú →' : (fueraZona ? 'Fuera de zona' : 'Ver horarios')}
        </button>
      </div>`;
  }).join('');

  grid.querySelectorAll('.pw-sede-card-h:not(.pw-sede-card-h--cerrada)').forEach(card => {
    const abrir = () => {
      const sede   = JSON.parse(card.dataset.sede);
      const actual = getSedeActual();
      if (!actual || actual.id !== sede.id) vaciarCarrito();
      setSedeActual(sede);
      _onSedeSelected?.(sede);
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') abrir(); });
  });
}

// ── DIRECCIÓN CARD ───────────────────────────────────────────
function renderDirCard(dirCompleta) {
  const dirWrapper      = document.getElementById('home-dir-wrapper');
  const dirSelectedCard = document.getElementById('dir-selected-card');
  const sedesTitle      = document.getElementById('sedes-title');
  if (!dirSelectedCard) return;

  const sedesCalc = sedesData.map(s => {
    const dist      = (userLat && s.lat && s.lng) ? haversine(userLat, userLng, s.lat, s.lng) : null;
    const fueraZona = dist !== null && s.radio_km ? dist > s.radio_km : false;
    return { ...s, _dist: dist, _fueraZona: fueraZona };
  });
  sedesCalc.sort((a, b) => {
    const aD = estaAbierta(a) && !a._fueraZona;
    const bD = estaAbierta(b) && !b._fueraZona;
    if (aD !== bD) return Number(bD) - Number(aD);
    if (a._dist !== null && b._dist !== null) return a._dist - b._dist;
    return 0;
  });
  const sedeEntrega = sedesCalc.find(s => estaAbierta(s) && !s._fueraZona) || null;
  const enZona      = !!sedeEntrega;
  const nombreSede  = sedeEntrega ? displayNombre(sedeEntrega) : '—';

  dirSelectedCard.innerHTML = `
    <div class="pw-dir-card-top">
      <div class="pw-dir-card-col">
        <span class="pw-dir-card-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          Entrega en
        </span>
        <strong class="pw-dir-card-sede">${nombreSede}</strong>
        <span class="pw-dir-card-addr">${dirCompleta}</span>
      </div>
      <div class="pw-dir-card-col pw-dir-card-col--right">
        <span class="pw-dir-card-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v5"/><circle cx="15.5" cy="17.5" r="2.5"/><circle cx="5.5" cy="17.5" r="2.5"/><path d="M3 11h13"/></svg>
          Tiempo estimado
        </span>
        <strong class="pw-dir-card-tiempo">45 - 60 min</strong>
      </div>
      <button class="pw-dir-card-cambiar" id="btn-cambiar-dir">Cambiar &#8594;</button>
    </div>
    <div class="pw-dir-card-bottom">
      <span class="pw-dir-card-zona pw-dir-card-zona--${enZona ? 'ok' : 'fuera'}">
        ${enZona
          ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Entregamos en tu zona`
          : `&#9888; Fuera de zona de entrega`}
      </span>
    </div>`;

  localStorage.setItem('dp_direccion', JSON.stringify({
    direccion: dirCompleta, barrio: dirCompleta,
    lat: userLat, lng: userLng,
    sedeId: sedeEntrega?.id ?? null, sedeNombre: nombreSede,
  }));

  if (dirWrapper) dirWrapper.hidden = true;
  dirSelectedCard.hidden = false;
  if (sedesTitle) sedesTitle.textContent = 'Sedes cercanas';
  renderSedes();

  dirSelectedCard.querySelector('#btn-cambiar-dir')?.addEventListener('click', () => {
    dirSelectedCard.hidden = true;
    if (dirWrapper) dirWrapper.hidden = false;
    const dirField = document.getElementById('dir-inicio');
    if (dirField) dirField.value = '';
    userLat = null; userLng = null;
    if (sedesTitle) sedesTitle.textContent = 'Elige una sede';
    renderSedes();
  }, { once: true });
}

// ── RESTAURAR ESTADO ─────────────────────────────────────────
function restoreState() {
  const sede = getSedeActual();
  const dpDir = (() => { try { return JSON.parse(localStorage.getItem('dp_direccion')); } catch { return null; } })();
  if (!sede) return;

  const dirWrapper      = document.getElementById('home-dir-wrapper');
  const dirSelectedCard = document.getElementById('dir-selected-card');
  const sedesTitle      = document.getElementById('sedes-title');
  if (!dirSelectedCard) return;

  if (dpDir?.lat) { userLat = dpDir.lat; userLng = dpDir.lng; renderSedes(); }

  const nombreSede = displayNombre(sede);
  const addrLine   = dpDir?.direccion ? `<span class="pw-dir-card-addr">${dpDir.direccion}</span>` : '';

  dirSelectedCard.innerHTML = `
    <div class="pw-dir-card-top">
      <div class="pw-dir-card-col">
        <span class="pw-dir-card-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          Entrega en
        </span>
        <strong class="pw-dir-card-sede">${nombreSede}</strong>
        ${addrLine}
      </div>
      <div class="pw-dir-card-col pw-dir-card-col--right">
        <span class="pw-dir-card-label">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v5"/><circle cx="15.5" cy="17.5" r="2.5"/><circle cx="5.5" cy="17.5" r="2.5"/><path d="M3 11h13"/></svg>
          Tiempo estimado
        </span>
        <strong class="pw-dir-card-tiempo">45 - 60 min</strong>
      </div>
      <button class="pw-dir-card-cambiar" id="btn-cambiar-dir">Cambiar &#8594;</button>
    </div>
    <div class="pw-dir-card-bottom">
      <span class="pw-dir-card-zona pw-dir-card-zona--ok">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Sede seleccionada
      </span>
    </div>`;
  dirSelectedCard.hidden = false;
  if (dirWrapper) dirWrapper.hidden = true;
  if (sedesTitle) sedesTitle.textContent = 'Sedes cercanas';

  dirSelectedCard.querySelector('#btn-cambiar-dir')?.addEventListener('click', () => {
    dirSelectedCard.hidden = true;
    if (dirWrapper) dirWrapper.hidden = false;
    const dirField = document.getElementById('dir-inicio');
    if (dirField) dirField.value = '';
    userLat = null; userLng = null;
    if (sedesTitle) sedesTitle.textContent = 'Elige una sede';
    renderSedes();
  }, { once: true });
}

// ── AUTOCOMPLETE ─────────────────────────────────────────────
function setupAddressSearch() {
  const dirField = document.getElementById('dir-inicio');
  const dirSug   = document.getElementById('dir-suggestions');
  const gpsBtn   = document.getElementById('home-gps-btn');
  if (!dirField) return;

  let dirTimer;
  const CIUDADES_AMB = ['bucaramanga', 'floridablanca', 'girón', 'giron', 'piedecuesta', 'santander'];

  async function fetchSug(q) {
    try {
      const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=co&format=json&limit=8&addressdetails=1&viewbox=-73.25,7.20,-72.95,6.95&bounded=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();
      const filtrados = data.filter(r => CIUDADES_AMB.some(c => r.display_name.toLowerCase().includes(c)));
      if (!filtrados.length) { hideSug(); return; }
      dirSug.innerHTML = filtrados.map(r => {
        const label = r.display_name.split(',').slice(0, 3).join(',').trim();
        return `<button class="pw-dir-sug-item" data-value="${label}" data-lat="${r.lat}" data-lon="${r.lon}">${label}</button>`;
      }).join('');
      dirSug.hidden = false;
      dirSug.querySelectorAll('.pw-dir-sug-item').forEach(btn => {
        btn.addEventListener('click', () => {
          dirField.value = btn.dataset.value;
          userLat = parseFloat(btn.dataset.lat);
          userLng = parseFloat(btn.dataset.lon);
          hideSug();
          renderSedes();
          renderDirCard(dirField.value);
        });
      });
    } catch { hideSug(); }
  }

  function hideSug() { if (dirSug) { dirSug.innerHTML = ''; dirSug.hidden = true; } }

  dirField.addEventListener('input', () => {
    clearTimeout(dirTimer);
    const q = dirField.value.trim();
    if (q.length < 3) { hideSug(); return; }
    dirTimer = setTimeout(() => fetchSug(q), 350);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#home-dir-wrapper')) hideSug();
  });

  if (!gpsBtn) return;
  gpsBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Tu navegador no soporta geolocalización.'); return; }
    gpsBtn.classList.add('pw-direccion-gps--loading');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          userLat = coords.latitude;
          userLng = coords.longitude;
          const url  = `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&addressdetails=1`;
          const res  = await fetch(url, { headers: { 'Accept-Language': 'es' } });
          const data = await res.json();
          dirField.value = data.display_name.split(',').slice(0, 3).join(',').trim();
          renderSedes();
          renderDirCard(dirField.value);
        } catch {
          alert('No pudimos obtener tu dirección. Intenta escribiéndola.');
        } finally {
          gpsBtn.classList.remove('pw-direccion-gps--loading');
        }
      },
      () => {
        alert('No se pudo acceder a tu ubicación. Verifica los permisos.');
        gpsBtn.classList.remove('pw-direccion-gps--loading');
      },
      { timeout: 10000 }
    );
  });
}

// ── INIT ─────────────────────────────────────────────────────
export async function initHomeView({ onSedeSelected } = {}) {
  _onSedeSelected = onSedeSelected;

  if (!initialized) {
    initialized = true;
    initBanner();
    setupAddressSearch();
    try {
      sedesData = await cargarSedes();
    } catch { sedesData = []; }
    renderSedes();
  }

  restoreState();
}
