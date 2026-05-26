import { plantaDB } from '../Api/firebaseConfig.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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
            await signOut(plantaDB.auth);
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
        })
        .catch(err => {
            console.error('Error al cargar sidebar:', err);
            document.body.classList.add('loaded');
        });
}
