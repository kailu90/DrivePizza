/* ============================================================
   Drive Pizza — Vista de Inicio (SPA)
   Flujo: tipo entrega → ubicacion/ciudad → sede asignada
   ============================================================ */

import { cargarSedes, estaAbierta, formatApertura, setSedeActual, getSedeActual, displayNombre } from './sede.js';
import { vaciarCarrito } from './carrito.js';
import { cargarTodosBarrios, getBarrioCoordsMap } from '../../CallCenter/barriosService.js';

// ── ESTADO ───────────────────────────────────────────────────
let sedesData          = [];
let _tipoEntrega       = null;   // 'domicilio' | 'recoger'
let _ciudadActual      = null;
let userLat            = null;
let userLng            = null;
let barrioSeleccionado = '';
let initialized        = false;
let _onSedeSelected    = null;

// ── ÍNDICE DE BARRIOS ─────────────────────────────────────────
let barrioIndex     = {};
let todosLosBarrios = [];
let barrioCoords    = {};

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

// IDs de todos los paneles del home — para mostrar/ocultar
const HOME_PANELS = [
  'home-tipo-wrapper',
  'home-dir-wrapper',
  'home-ciudad-wrapper',
  'dir-selected-card',
  'sedes-title',
  'sedes-grid',
];

// ── PANEL UTIL ───────────────────────────────────────────────
function _showPanels(...ids) {
  HOME_PANELS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = !ids.includes(id);
  });
}

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

// ── NORMALIZAR CIUDAD ────────────────────────────────────────
function _normCiudad(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// ── CIUDADES DISPONIBLES ─────────────────────────────────────
function _getCiudades() {
  const seen = new Set();
  return sedesData.map(s => s.ciudad).filter(c => c && !seen.has(c) && seen.add(c));
}

// ── DETECTAR CIUDAD DESDE LAT/LNG (Nominatim) ───────────────
async function _detectarCiudad(lat, lng) {
  try {
    const url  = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    const data = await res.json();
    const addr = data.address || {};
    const raw  = addr.city || addr.town || addr.municipality
               || addr.county || addr.state_district || '';
    if (!raw) return null;
    const ciudades = _getCiudades();
    const norm     = _normCiudad(raw);
    return ciudades.find(c => _normCiudad(c) === norm)
        || ciudades.find(c => norm.includes(_normCiudad(c)) || _normCiudad(c).includes(norm))
        || null;
  } catch {
    return null;
  }
}

// ── SEDE OPTIMA PARA COORDENADAS ─────────────────────────────
// Prioridad: abierta + dentro de radio_km > abierta mas cercana > cualquiera
// Si lat/lng son null (seleccion manual): retorna primera sede abierta de la ciudad
function _sedeParaCoordenadas(lat, lng, ciudad) {
  const candidatas = ciudad ? sedesData.filter(s => s.ciudad === ciudad) : sedesData;
  if (!candidatas.length) return null;

  if (lat == null || lng == null) {
    return candidatas.find(estaAbierta) || candidatas[0];
  }

  const conDist = candidatas.map(s => ({
    ...s,
    _dist: (s.lat && s.lng) ? haversine(lat, lng, s.lat, s.lng) : Infinity,
  }));
  const radio = s => s.radio_km || 10;

  const ok = conDist.filter(s => estaAbierta(s) && s._dist <= radio(s));
  if (ok.length) return ok.sort((a, b) => a._dist - b._dist)[0];

  const abiertas = conDist.filter(estaAbierta);
  if (abiertas.length) {
    const mejor = abiertas.sort((a, b) => a._dist - b._dist)[0];
    return { ...mejor, _fueraZona: true };
  }

  const closest = conDist.sort((a, b) => a._dist - b._dist)[0];
  return closest ? { ...closest, _fueraZona: true } : null;
}

// ── RENDER: PASO 1 — TIPO ────────────────────────────────────
function _renderTipoSelector() {
  _tipoEntrega = null;
  _showPanels('home-tipo-wrapper');
}

// ── RENDER: PASO 2a — INPUT DOMICILIO ────────────────────────
function _renderDomicilioInput() {
  _showPanels('home-dir-wrapper');
  setTimeout(() => document.getElementById('dir-inicio')?.focus(), 50);
}

// ── RENDER: SELECTOR DE CIUDAD ───────────────────────────────
function _renderCiudadSelector(onCiudad) {
  const ciudades = _getCiudades();
  const wrap = document.getElementById('home-ciudad-wrapper');
  wrap.innerHTML = `
    <div class="pw-selector-header pw-selector-header--nav">
      <button class="pw-auth-back-btn" id="btn-ciudad-back" aria-label="Volver">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <h2 class="pw-selector-title">Selecciona tu ciudad</h2>
    </div>
    <div class="pw-ciudad-pills">
      ${ciudades.map(c => `<button class="pw-ciudad-pill" data-ciudad="${c}">${c}</button>`).join('')}
    </div>`;
  _showPanels('home-ciudad-wrapper');
  wrap.querySelectorAll('.pw-ciudad-pill').forEach(btn => {
    btn.addEventListener('click', () => onCiudad(btn.dataset.ciudad));
  });
  wrap.querySelector('#btn-ciudad-back').addEventListener('click', () => {
    if (_tipoEntrega === 'domicilio') _renderDomicilioInput();
    else _renderTipoSelector();
  });
}

// ── RENDER: CARD SEDE DOMICILIO ──────────────────────────────
function _renderCardDomicilio(sede, { barrio = '', label = '' } = {}) {
  const card    = document.getElementById('dir-selected-card');
  const abierta = estaAbierta(sede);
  const fuera   = !!sede._fueraZona;
  const nombre  = displayNombre(sede);
  const sedeImg = SEDE_IMGS[(sede.name || '').toLowerCase().trim()] || '../Imagenes/sede-placeholder.jpeg';

  let badgeHtml;
  if (!abierta) {
    badgeHtml = `<span class="pw-home-sede-badge pw-home-sede-badge--cerrada">Cerrado &middot; abre a las ${formatApertura(sede)}</span>`;
  } else if (fuera) {
    badgeHtml = `<span class="pw-home-sede-badge pw-home-sede-badge--fuera">Fuera de zona de entrega</span>`;
  } else {
    badgeHtml = `<span class="pw-home-sede-badge pw-home-sede-badge--ok">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Entregamos en tu zona</span>`;
  }

  card.innerHTML = `
    <div class="pw-home-sede-card">
      <div class="pw-home-sede-body">
        <div class="pw-home-sede-info">
          ${badgeHtml}
          <p class="pw-home-sede-nombre">${nombre}</p>
          <div class="pw-home-sede-meta">
            <span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              ${sede.ciudad || label || ''}
            </span>
            <span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              45–60 min
            </span>
          </div>
          <p class="pw-home-sede-sub">Te atendemos desde la sede más conveniente para tu zona</p>
          <button class="pw-home-cambiar-link" id="btn-cambiar-dir">Cambiar ubicación</button>
        </div>
        <div class="pw-home-sede-photo-col">
          <span class="pw-home-sede-meta-estado pw-home-sede-meta-estado--${abierta ? 'ok' : 'cerrada'} pw-home-sede-estado-top">
            ${abierta ? 'Abierto' : 'Cerrado'}
          </span>
          <div class="pw-home-sede-photo">
            <img src="${sedeImg}" alt="${nombre}">
          </div>
          ${abierta && !fuera
            ? `<button class="pw-home-ver-menu-btn" id="btn-pedir-aqui">Ver men&uacute; &#8594;</button>`
            : `<button class="pw-home-ver-menu-btn pw-home-ver-menu-btn--disabled" disabled>No disponible</button>`}
        </div>
      </div>
    </div>`;

  _showPanels('dir-selected-card');

  localStorage.setItem('dp_direccion', JSON.stringify({
    tipoEntrega: 'domicilio',
    lat:         userLat,
    lng:         userLng,
    ciudad:      sede.ciudad || _ciudadActual || null,
    barrio,
    direccion:   '',
    sedeId:      sede.id,
    sedeNombre:  nombre,
  }));

  if (abierta && !fuera) {
    card.querySelector('#btn-pedir-aqui').addEventListener('click', () => {
      const actual = getSedeActual();
      if (!actual || actual.id !== sede.id) vaciarCarrito();
      setSedeActual(sede);
      _onSedeSelected?.(sede);
    });
  }

  card.querySelector('#btn-cambiar-dir').addEventListener('click', _resetHome, { once: true });
}

// ── RENDER: SEDES RECOGER ────────────────────────────────────
function _renderRecogerSedes(ciudad) {
  _ciudadActual = ciudad;
  const grid    = document.getElementById('sedes-grid');
  const titleEl = document.getElementById('sedes-title');

  console.log('_renderRecogerSedes ciudad=', ciudad, 'sedesData=', sedesData.map(s => s.name + '/' + s.ciudad));
  const candidatas = ciudad
    ? (sedesData.filter(s => s.ciudad === ciudad).length
        ? sedesData.filter(s => s.ciudad === ciudad)
        : sedesData)
    : sedesData;

  const sedes = candidatas
    .map(s => ({
      ...s,
      _dist: (userLat != null && s.lat && s.lng)
        ? haversine(userLat, userLng, s.lat, s.lng)
        : null,
    }))
    .sort((a, b) => {
      const aOk = estaAbierta(a), bOk = estaAbierta(b);
      if (aOk !== bOk) return Number(bOk) - Number(aOk);
      if (a._dist !== null && b._dist !== null) return a._dist - b._dist;
      return 0;
    });

  const ciudades = _getCiudades();
  const backLabel = ciudades.length > 1 ? '&#8592; Cambiar ciudad' : '&#8592; Cambiar tipo';

  if (titleEl) {
    titleEl.innerHTML = `
      <span class="pw-sedes-title-text">Sedes en ${ciudad}</span>
      <button class="pw-auth-link pw-sedes-back-btn" id="btn-sedes-back">${backLabel}</button>`;
  }

  grid.innerHTML = sedes.map(sede => {
    const abierta = estaAbierta(sede);
    const nombre  = displayNombre(sede);
    const sedeImg = SEDE_IMGS[(sede.name || '').toLowerCase().trim()] || '../Imagenes/sede-placeholder.jpeg';
    return `
      <div class="pw-sede-card-h${abierta ? '' : ' pw-sede-card-h--cerrada'}"
           data-sede='${JSON.stringify(sede).replace(/'/g, '&#39;')}'
           ${abierta ? `tabindex="0" role="button" aria-label="Recoger en ${nombre}"` : 'aria-disabled="true"'}>
        <div class="pw-sede-card-h-img"><img src="${sedeImg}" alt="${nombre}"></div>
        <div class="pw-sede-card-h-info">
          <span class="pw-sede-status pw-sede-status--${abierta ? 'abierta' : 'cerrada'}">
            ${abierta ? 'Abierto' : 'Cerrado'}
          </span>
          <div class="pw-sede-nombre">${nombre}</div>
          <div class="pw-sede-tiempo">&#128336; 45 - 60 min &nbsp;&#11088; 4.8</div>
        </div>
        <button class="pw-sede-btn pw-sede-btn--${abierta ? 'abierta' : 'cerrada'}${!abierta ? ' pw-sede-btn--horarios' : ''}">
          ${abierta ? 'Recoger aqui &#8594;' : 'Ver horarios &#8594;'}
        </button>
      </div>`;
  }).join('');

  _showPanels('sedes-title', 'sedes-grid');

  document.getElementById('btn-sedes-back')?.addEventListener('click', () => {
    if (ciudades.length > 1) {
      _renderCiudadSelector(c => _renderRecogerSedes(c));
    } else {
      _resetHome();
    }
  });

  grid.querySelectorAll('.pw-sede-btn--horarios').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      abrirModalHorarios(JSON.parse(btn.closest('[data-sede]').dataset.sede));
    });
  });

  grid.querySelectorAll('.pw-sede-card-h:not(.pw-sede-card-h--cerrada)').forEach(card => {
    const abrir = () => {
      const sede  = JSON.parse(card.dataset.sede);
      const actual = getSedeActual();
      if (!actual || actual.id !== sede.id) vaciarCarrito();
      const dpDir = (() => { try { return JSON.parse(localStorage.getItem('dp_direccion')) || {}; } catch { return {}; } })();
      localStorage.setItem('dp_direccion', JSON.stringify({
        ...dpDir,
        tipoEntrega: 'recoger',
        ciudad,
        sedeId:     sede.id,
        sedeNombre: displayNombre(sede),
      }));
      setSedeActual(sede);
      _onSedeSelected?.(sede);
    };
    card.addEventListener('click', abrir);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') abrir(); });
  });
}

// ── FLUJO: DESDE COORDENADAS ─────────────────────────────────
async function _flujoDesdeCoords(lat, lng, label = '') {
  userLat = lat;
  userLng = lng;

  const ciudad = await _detectarCiudad(lat, lng);

  if (ciudad) {
    _ciudadActual = ciudad;
    const sede = _sedeParaCoordenadas(lat, lng, ciudad);
    if (sede) {
      _renderCardDomicilio(sede, { label });
    } else {
      _renderCiudadSelector(c => {
        _ciudadActual = c;
        const s = _sedeParaCoordenadas(lat, lng, c);
        if (s) _renderCardDomicilio(s, { label });
      });
    }
  } else {
    _renderCiudadSelector(c => {
      _ciudadActual = c;
      const s = _sedeParaCoordenadas(lat, lng, c);
      if (s) _renderCardDomicilio(s, { label });
    });
  }
}

// ── FLUJO: DESDE BARRIO (autocomplete) ──────────────────────
async function _flujoDesdeBarrio(barrio) {
  barrioSeleccionado = barrio;
  const coords = barrioCoords[barrio];

  if (coords?.lat && coords?.lng) {
    // Tiene coordenadas → detectar ciudad via Nominatim
    await _flujoDesdeCoords(coords.lat, coords.lng, barrio);
    return;
  }

  // Sin coordenadas → buscar via barrioIndex cual sede cubre este barrio
  const sedesCubren = barrioIndex[barrio] ? [...barrioIndex[barrio]] : [];
  if (sedesCubren.length) {
    const sede = sedesData.find(s => sedesCubren.includes(s.name) && estaAbierta(s))
              || sedesData.find(s => sedesCubren.includes(s.name));
    if (sede) {
      _ciudadActual = sede.ciudad || null;
      _renderCardDomicilio(sede, { barrio, label: barrio });
      return;
    }
  }

  // Fallback: selector de ciudad
  _renderCiudadSelector(c => {
    _ciudadActual = c;
    const s = _sedeParaCoordenadas(null, null, c);
    if (s) _renderCardDomicilio(s, { barrio, label: barrio });
  });
}

// ── RESTORE STATE (usuario recurrente) ───────────────────────
// Recalcula cobertura y disponibilidad en lugar de confiar en dp_sede guardado
function _restoreState() {
  const dpDir = (() => { try { return JSON.parse(localStorage.getItem('dp_direccion')); } catch { return null; } })();
  if (!dpDir?.tipoEntrega) return false;

  _tipoEntrega  = dpDir.tipoEntrega;
  _ciudadActual = dpDir.ciudad || null;
  _setActivePill(_tipoEntrega);

  if (dpDir.tipoEntrega === 'domicilio') {
    let sede = null;

    if (dpDir.lat != null && dpDir.lng != null) {
      // Recalcular con coordenadas guardadas
      userLat = dpDir.lat;
      userLng = dpDir.lng;
      sede    = _sedeParaCoordenadas(dpDir.lat, dpDir.lng, dpDir.ciudad || null);
    } else if (dpDir.sedeId) {
      // Sin coordenadas: usar sedeId como referencia, revalidar estado actual
      sede = sedesData.find(s => s.id === dpDir.sedeId)
          || (dpDir.ciudad && (sedesData.find(s => s.ciudad === dpDir.ciudad && estaAbierta(s))
                            || sedesData.find(s => s.ciudad === dpDir.ciudad)));
    }

    if (sede) {
      _renderCardDomicilio(sede, { barrio: dpDir.barrio || '', label: dpDir.barrio || '' });
      return true;
    }
  }

  if (dpDir.tipoEntrega === 'recoger' && dpDir.ciudad) {
    _renderRecogerSedes(dpDir.ciudad);
    return true;
  }

  return false;
}

// ── RESET ────────────────────────────────────────────────────
function _resetHome() {
  _tipoEntrega       = null;
  _ciudadActual      = null;
  userLat            = null;
  userLng            = null;
  barrioSeleccionado = '';
  const dirField = document.getElementById('dir-inicio');
  if (dirField) dirField.value = '';
  document.getElementById('dir-suggestions').innerHTML = '';
  document.getElementById('dir-suggestions').hidden = true;
  _renderTipoSelector();
}

// ── SETUP: TIPO SELECTOR ─────────────────────────────────────
function _setActivePill(tipo) {
  document.querySelectorAll('#home-tipo-pills .pw-tipo-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.tipo === tipo);
  });
}

function _setupTipoSelector() {
  document.querySelectorAll('#home-tipo-pills .pw-tipo-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _tipoEntrega = pill.dataset.tipo;
      _setActivePill(_tipoEntrega);
      if (_tipoEntrega === 'domicilio') {
        _renderDomicilioInput();
      } else {
        const ciudades = _getCiudades();
        if (ciudades.length <= 1) {
          _renderRecogerSedes(ciudades[0] || null);
        } else {
          _renderCiudadSelector(c => _renderRecogerSedes(c));
        }
      }
    });
  });
}

// ── SETUP: GPS ───────────────────────────────────────────────
function _setupGPS() {
  const gpsBtn     = document.getElementById('home-gps-btn');
  const gpsIconBtn = document.getElementById('home-gps-icon-btn');

  const handler = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    if (gpsBtn) gpsBtn.classList.add('pw-gps-btn-main--loading');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (gpsBtn) gpsBtn.classList.remove('pw-gps-btn-main--loading');
        await _flujoDesdeCoords(coords.latitude, coords.longitude);
      },
      () => {
        if (gpsBtn) gpsBtn.classList.remove('pw-gps-btn-main--loading');
        _renderCiudadSelector(c => {
          _ciudadActual = c;
          const s = _sedeParaCoordenadas(null, null, c);
          if (s) _renderCardDomicilio(s, {});
        });
      },
      { timeout: 10000 }
    );
  };

  gpsBtn?.addEventListener('click', handler);
  gpsIconBtn?.addEventListener('click', handler);
}

// ── SETUP: BUSQUEDA BARRIO ───────────────────────────────────
function _setupAddressSearch() {
  const dirField  = document.getElementById('dir-inicio');
  const dirSug    = document.getElementById('dir-suggestions');
  const btnBack   = document.getElementById('btn-tipo-back');
  const btnCiudad = document.getElementById('btn-elegir-ciudad');
  if (!dirField) return;

  function hideSug() {
    if (dirSug) { dirSug.innerHTML = ''; dirSug.hidden = true; }
  }

  function fetchSug(q) {
    const ql = q.toLowerCase();
    const matches = todosLosBarrios
      .filter(b => b.toLowerCase().includes(ql))
      .sort((a, b) => {
        const aS = a.toLowerCase().startsWith(ql);
        const bS = b.toLowerCase().startsWith(ql);
        if (aS !== bS) return aS ? -1 : 1;
        return a.localeCompare(b, 'es');
      })
      .slice(0, 8);

    if (!matches.length || !dirSug) { hideSug(); return; }
    dirSug.innerHTML = matches.map(b =>
      `<button class="pw-dir-sug-item" data-barrio="${b}">${b}</button>`
    ).join('');
    dirSug.hidden = false;

    dirSug.querySelectorAll('.pw-dir-sug-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        dirField.value = btn.dataset.barrio;
        hideSug();
        await _flujoDesdeBarrio(btn.dataset.barrio);
      });
    });
  }

  dirField.addEventListener('input', () => {
    const q = dirField.value.trim();
    if (q.length < 2) { hideSug(); return; }
    fetchSug(q);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#home-dir-wrapper')) hideSug();
  });

  btnBack?.addEventListener('click', _resetHome);

  btnCiudad?.addEventListener('click', () => {
    _renderCiudadSelector(c => {
      _ciudadActual = c;
      const s = _sedeParaCoordenadas(null, null, c);
      if (s) _renderCardDomicilio(s, {});
    });
  });
}

// ── MODAL HORARIOS ───────────────────────────────────────────
let _overlayListenerSet = false;

function abrirModalHorarios(sede) {
  const overlay = document.getElementById('pw-horarios-overlay');
  if (!overlay) return;

  document.getElementById('pw-horarios-titulo').textContent = displayNombre(sede);
  const lista = document.getElementById('pw-horarios-lista');

  const horarios = sede.horarios_display;
  let horariosHtml = '';
  if (Array.isArray(horarios) && horarios.length) {
    horariosHtml = horarios.map(h => `
      <div class="pw-horarios-fila">
        <span class="pw-horarios-dia">${h.dia}</span>
        <span class="pw-horarios-hora">${h.horario}</span>
      </div>`).join('');
  } else {
    horariosHtml = `<p class="pw-horarios-empty">Horarios no disponibles por el momento.</p>`;
  }

  const lineas = Array.isArray(sede.lineas_domicilio) ? sede.lineas_domicilio : [];
  const wa = sede.whatsapp;
  const contactoHtml = (wa || lineas.length) ? `
    <div class="pw-horarios-contacto">
      <p class="pw-horarios-contacto-label">¿Necesitas ayuda? Contáctanos</p>
      <div class="pw-horarios-contacto-btns">
        ${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="pw-horarios-btn pw-horarios-btn--wa">WhatsApp</a>` : ''}
        ${lineas.map(n => `<a href="tel:${n}" class="pw-horarios-btn pw-horarios-btn--tel">${n}</a>`).join('')}
      </div>
    </div>` : '';

  lista.innerHTML = horariosHtml + contactoHtml;
  overlay.classList.add('open');

  if (!_overlayListenerSet) {
    _overlayListenerSet = true;
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('#pw-horarios-close')) {
        overlay.classList.remove('open');
      }
    });
  }
}

// ── INIT ─────────────────────────────────────────────────────
export async function initHomeView({ onSedeSelected } = {}) {
  console.log('HOME NUEVO v2 — initHomeView ejecutado');
  _onSedeSelected = onSedeSelected;

  if (!initialized) {
    initialized = true;
    initBanner();
    _setupTipoSelector();
    _setupGPS();
    _setupAddressSearch();

    // Deshabilitar tipo pills mientras cargan los datos
    document.querySelectorAll('#home-tipo-pills .pw-tipo-pill').forEach(p => { p.disabled = true; });

    try {
      const [domicilios] = await Promise.all([
        cargarTodosBarrios(),
        cargarSedes().then(s => { sedesData = s; console.log('sedes cargadas:', s.length, s.map(x => x.name + '/' + x.ciudad)); }),
      ]);
      Object.entries(domicilios).forEach(([sedeName, barrios]) => {
        Object.keys(barrios).forEach(barrio => {
          if (!barrioIndex[barrio]) barrioIndex[barrio] = new Set();
          barrioIndex[barrio].add(sedeName);
        });
      });
      todosLosBarrios = Object.keys(barrioIndex).sort((a, b) => a.localeCompare(b, 'es'));
      barrioCoords    = getBarrioCoordsMap();
    } catch {
      sedesData = [];
    }

    document.querySelectorAll('#home-tipo-pills .pw-tipo-pill').forEach(p => { p.disabled = false; });
  }

  if (!_restoreState()) {
    _renderTipoSelector();
  }
}
