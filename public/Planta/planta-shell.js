import { supabase }                                                   from '../Api/supabaseConfig.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta }                                      from '../Auth/plantaAuth.js';

const frame  = document.getElementById('planta-frame');
const navBar = document.getElementById('shell-nav-bar');
let _currentPage = './dashboard.html';
let _barTimer = null;

function _barStart() {
    clearTimeout(_barTimer);
    navBar.classList.remove('done');
    navBar.classList.add('loading');
}
function _barDone() {
    navBar.classList.remove('loading');
    navBar.classList.add('done');
    _barTimer = setTimeout(() => navBar.classList.remove('done'), 500);
}

// ── Posicionar nav bar justo debajo del header real ───────────────────────────
function _alinearNavBar() {
    const header = document.querySelector('.header');
    if (!header) return;
    navBar.style.top = header.getBoundingClientRect().height + 'px';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    requestAnimationFrame(_alinearNavBar);
    CargarFooter();
    CargarSidebar(() => {
        _interceptarSidebar();
        _setActiveLink(_currentPage);
        _actualizarBadgeSiropes();
    });
});

// ── Navegación ────────────────────────────────────────────────────────────────
function _navTo(page) {
    if (!page || page === _currentPage) return;
    _currentPage = page;
    _setActiveLink(page);
    _barStart();
    frame.src = page;
}

function _interceptarSidebar() {
    document.querySelectorAll('.sidebar__link').forEach(link => {
        link.addEventListener('click', e => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('http') || href.includes('..')) return;
            e.preventDefault();
            _navTo(href);
        });
    });
}

function _setActiveLink(page) {
    document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
    document.querySelector(`.sidebar__link[href="${page}"]`)?.classList.add('sidebar__link--active');
}

// ── Iframe load: eliminar splash + ocultar overlay ────────────────────────────
frame?.addEventListener('load', () => {
    // Inyectar body.loaded en el iframe (mismo origen) para suprimir su splash
    try {
        const iDoc = frame.contentDocument;
        if (iDoc?.body) {
            iDoc.body.classList.add('loaded');
            iDoc.getElementById('pw-page-transition')?.remove();
        }
    } catch {}

    _barDone();

    // Sincronizar active link si el iframe navegó internamente
    try {
        const path = new URL(frame.contentWindow.location.href).pathname;
        const page = './' + path.split('/').pop();
        if (page !== _currentPage) { _currentPage = page; _setActiveLink(page); }
    } catch {}
});

// ── Badge siropes ─────────────────────────────────────────────────────────────
async function _actualizarBadgeSiropes() {
    const { count } = await supabase
        .from('entregas_siropes')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente');
    _setBadgeSiropes(count ?? 0);
}

function _setBadgeSiropes(count) {
    const link = document.getElementById('sidebar-siropes-link');
    if (!link) { setTimeout(() => _setBadgeSiropes(count), 800); return; }
    link.querySelector('.siropes-badge')?.remove();
    const b = document.createElement('span');
    b.className = 'siropes-badge';
    b.textContent = count;
    b.style.cssText = `background:${count > 0 ? '#e67e22' : '#aaa'};color:#fff;border-radius:10px;padding:1px 7px;font-size:1.1rem;font-weight:700;margin-left:6px;vertical-align:middle;`;
    link.appendChild(b);
}

// ── Mensajes desde iframe ─────────────────────────────────────────────────────
window.addEventListener('message', e => {
    if (e.source !== frame?.contentWindow) return;
    const { type, count, page } = e.data || {};
    if (type === 'badge-siropes') _setBadgeSiropes(count ?? 0);
    if (type === 'nav-to')        _navTo(page);
});
