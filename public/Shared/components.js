import { supabase } from '../Api/supabaseConfig.js'
import { WS_URL } from '../Api/config.js'

// ── Banner nueva versión (singleton) ─────────────────────────────────────────
function _initVersionBanner() {
    if (document.getElementById('dp-version-banner')) return;

    const style = document.createElement('style');
    style.textContent = `
        #dp-version-banner { display:none; position:fixed; top:0; left:0; right:0;
            background:#1e40af; color:#fff; padding:10px 20px; text-align:center;
            font-family:sans-serif; font-size:14px; z-index:99999;
            box-shadow:0 2px 8px rgba(0,0,0,0.3); }
        #dp-version-banner button { margin-left:16px; background:#fff; color:#1e40af;
            border:none; border-radius:6px; padding:4px 14px; font-size:13px;
            font-weight:600; cursor:pointer; }
    `;
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'dp-version-banner';
    banner.innerHTML = '🚀 Hay una nueva versión disponible. <button onclick="location.reload()">Recargar ahora</button>';
    document.body.appendChild(banner);

    function connect() {
        const ws = new WebSocket(WS_URL);
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.tipo === 'nueva-version') {
                    document.getElementById('dp-version-banner').style.display = 'block';
                }
            } catch {}
        };
        ws.onclose = () => setTimeout(connect, 5000);
    }
    connect();
}

export function initVersionBanner() { _initVersionBanner(); }

export function mostrarBannerRecarga() {
    const b = document.getElementById('dp-version-banner');
    if (b) b.style.display = 'block';
}

export function capitalizarSede(sede) {
    return sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : 'Planta';
}

export function CargarHeader(nombreSede, homeUrl = null, mostrarSala = false) {
    console.log("ingresé a CargarHeader");
    const headerContainer = document.getElementById('header-container');
    if (!headerContainer) return;

    const btnHome = homeUrl ? `
        <button class="header-home-btn with-tooltip" data-tooltip="Regresar al panel" onclick="window.location.href='${homeUrl}'">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        </button>` : '';

    headerContainer.innerHTML = `
        <header class="header">
            <div class="sidebar_img">
                <img src="../Imagenes/logo.png" alt="logo drive">
            </div>
            <div class="header-center">
                ${btnHome}
                <h1 class="header-title">DrivePizza ${nombreSede}</h1>
            </div>
            <nav class="header-menu">
                <ul class="header-list">
                    <li class="header-item" id="header-item-selector" style="display:none">
                        <button id="btn-selector" class="header-link with-tooltip" data-tooltip="Cambiar entorno" title="Cambiar entorno" onclick="window.location.href='../selector.html'">
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="7" height="7"/>
                                <rect x="14" y="3" width="7" height="7"/>
                                <rect x="3" y="14" width="7" height="7"/>
                                <rect x="14" y="14" width="7" height="7"/>
                            </svg>
                        </button>
                    </li>
                    <li class="header-item">
                        <button id="link_logout" class="header-link header-logout-btn" title="Cerrar Sesión">
                            <svg class="header-logout-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                                <polyline points="16 17 21 12 16 7"/>
                                <line x1="21" y1="12" x2="9" y2="12"/>
                            </svg>
                            <span class="header-logout-text">Cerrar Sesión</span>
                        </button>
                    </li>
                </ul>
            </nav>
        </header>`;

    // Lógica del botón logout
    document.getElementById("link_logout")?.addEventListener("click", async () => {
        if (confirm("¿Cerrar sesión?")) {
            await supabase.auth.signOut()
            window.top.location.href = '../index.html'
        }
    });
}

export function MostrarBotonSelector() {
    const item = document.getElementById('header-item-selector');
    if (item) item.style.display = '';
}

export function CargarSidebar(onReady = null) {
    const container = document.getElementById('sidebar-container');
    if (!container) return;

    fetch('sidebar.html')
        .then(r => r.text())
        .then(html => {
            container.innerHTML = html;

            // Overlay para cerrar sidebar en mobile
            let overlay = document.getElementById('sidebar-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'sidebar-overlay';
                overlay.className = 'sidebar-overlay';
                document.body.appendChild(overlay);
            }

            const toggleBtn = document.getElementById('toggle-btn');
            const sidebar   = document.getElementById('sidebar');
            const main      = document.querySelector('.dashboard__main, .inventory__main, .ap-main, .inf-main');
            const footer    = document.querySelector('.dashboard__footer, .inventory__footer');
            const sections  = document.querySelectorAll('.dashboard__section, .inventory__section');
            const isMobile  = () => window.innerWidth <= 768;

            function closeSidebar() {
                sidebar?.classList.add('sidebar--collapsed');
                overlay.classList.remove('active');
                toggleBtn?.classList.add('rotate');
                if (toggleBtn) toggleBtn.textContent = '>';
                if (!isMobile()) {
                    main?.classList.add('margin-hidden');
                    footer?.classList.add('margin-hidden');
                    sections.forEach(s => s.classList.add('margin-hidden-20'));
                    toggleBtn?.classList.add('left-hidden');
                }
            }

            function openSidebar() {
                sidebar?.classList.remove('sidebar--collapsed');
                toggleBtn?.classList.remove('rotate');
                if (toggleBtn) toggleBtn.textContent = '<';
                if (isMobile()) {
                    overlay.classList.add('active');
                } else {
                    main?.classList.remove('margin-hidden');
                    footer?.classList.remove('margin-hidden');
                    sections.forEach(s => s.classList.remove('margin-hidden-20'));
                    toggleBtn?.classList.remove('left-hidden');
                }
            }

            // Auto-ocultar en mobile al cargar
            if (isMobile()) closeSidebar();

            if (toggleBtn && sidebar) {
                toggleBtn.addEventListener('click', () => {
                    sidebar.classList.contains('sidebar--collapsed') ? openSidebar() : closeSidebar();
                });
            }

            // Cerrar al tocar el overlay
            overlay.addEventListener('click', closeSidebar);

            // Cerrar al navegar (mobile)
            sidebar?.querySelectorAll('.sidebar__link').forEach(link => {
                link.addEventListener('click', () => { if (isMobile()) closeSidebar(); });
            });

            if (onReady) onReady();
            document.body.classList.add('loaded');
            revelarSplash();
        })
        .catch(err => {
            console.error('Error al cargar sidebar:', err);
            document.body.classList.add('loaded');
            revelarSplash();
        });
}

export function revelarSplash(minMs = 1000) {
    const splash = document.getElementById('pw-page-transition');
    if (!splash) return;
    // Dentro del shell iframe el nav-overlay del shell ya cubre la transición
    if (window.parent !== window) {
        splash.remove();
        return;
    }
    const wait = Math.max(0, minMs - performance.now());
    setTimeout(() => {
        splash.classList.add('pw-page-transition--reveal');
        splash.addEventListener('animationend', () => splash.remove(), { once: true });
    }, wait);
}
