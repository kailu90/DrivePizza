//********FUNCION DE RENDERIZADO DE TODOS LOS PRODUCTOS DISPONIBLE*******/
let carrito = [];
window._carritoLen = () => carrito.length;
let _modoReserva = false;
let _toppingsCC = new Set();

const ACOMP_POR_CIUDAD = {
    bucaramanga: ['Salsa Tártara', 'Orégano', 'Sal de Ajo'],
    cartago:     ['Salsa Rosada', 'Miel'],
};
function _renderAcomps(ciudad) {
    const pills = ACOMP_POR_CIUDAD[ciudad] || ACOMP_POR_CIUDAD.bucaramanga;
    const container = document.getElementById('acomp-pills');
    container.innerHTML = pills.map(t =>
        `<button type="button" class="acomp-pill${_toppingsCC.has(t) ? ' active' : ''}" data-topping="${t}">${t}</button>`
    ).join('');
    container.querySelectorAll('.acomp-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const t = pill.dataset.topping;
            if (_toppingsCC.has(t)) { _toppingsCC.delete(t); pill.classList.remove('active'); }
            else                    { _toppingsCC.add(t);    pill.classList.add('active'); }
        });
    });
}

// Sedes donde aplican las promos especiales (65K, Pepperoni, Lasaña)
const SEDES_PROMO_ESPECIAL = new Set(['acropolis', 'megamall', 'unico']);

function _aplicarFiltroSedes() {
    let sedeActiva = document.querySelector('.sede-toggle .sede-btn.active');
    if (sedeActiva && !SEDES_PROMO_ESPECIAL.has(sedeActiva.dataset.sede)) {
        sedeActiva.classList.remove('active');
    }
    document.querySelectorAll('.sede-toggle .sede-btn').forEach(btn => {
        if (!SEDES_PROMO_ESPECIAL.has(btn.dataset.sede)) btn.disabled = true;
    });
    if (!document.getElementById('sede-restriccion-aviso')) {
        const toggle = document.querySelector('.sede-toggle');
        if (toggle) {
            const aviso = document.createElement('p');
            aviso.id = 'sede-restriccion-aviso';
            aviso.className = 'sede-restriccion-aviso';
            aviso.textContent = '⚠️ Esta promo aplica solo en Acrópolis, Megamall y Único.';
            toggle.insertAdjacentElement('afterend', aviso);
        }
    }
}

function _limpiarFiltroSedes() {
    const tienePromoRestringida = carrito.some(i => i.esPromo65k);
    if (tienePromoRestringida) return;
    document.querySelectorAll('.sede-toggle .sede-btn').forEach(btn => {
        btn.disabled = false;
    });
    document.getElementById('sede-restriccion-aviso')?.remove();
}

// ── SALA (Jitsi Meet) ─────────────────────────────────────────────────────
const SALA_ROOM = 'DrivePizzaCallCenter';
let salaWindow = null;
let salaCheckInterval = null;

function buildSalaUrl() {
    const nombre = encodeURIComponent(window.asesorActual || 'Asesor');
    return `https://meet.jit.si/${SALA_ROOM}` +
        `#userInfo.displayName="${nombre}"` +
        `&config.prejoinPageEnabled=false` +
        `&config.startWithVideoMuted=true` +
        `&config.startWithAudioMuted=false` +
        `&config.requireDisplayName=false`;
}

function toggleSala() {
    const btnSala = document.getElementById('btn-sala');

    // Si ya está abierta, traerla al frente
    if (salaWindow && !salaWindow.closed) {
        salaWindow.focus();
        return;
    }

    // Abrir popup posicionado a la derecha de la pantalla
    const w = 430, h = 680;
    const left = window.screen.width - w - 20;
    const top  = Math.round((window.screen.height - h) / 2);

    salaWindow = window.open(
        buildSalaUrl(),
        'SalaCallCenter',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes`
    );

    if (salaWindow) {
        btnSala?.classList.add('sala-activa');
        // Detecta si el agente cierra la ventana manualmente
        salaCheckInterval = setInterval(() => {
            if (salaWindow?.closed) {
                salaWindow = null;
                clearInterval(salaCheckInterval);
                btnSala?.classList.remove('sala-activa');
            }
        }, 1000);
    }
}
// ─────────────────────────────────────────────────────────────────────────

//********Variable para poder utilizar los sabores de las pizzas en los calzones*/
let modoCalzoneActivo = false;

// Tamaños que permiten mezcla ½+½ (Porción y Pizzeta quedan excluidos)
const TAMANOS_MIXABLES = new Set(["Pequeña", "Mediana", "Grande", "Jumbo"]);

// Categorías que pueden llevar adiciones → valor es el tamanoRaw para buscar en preciosAdiciones
const CATEGORIAS_ADICIONABLES = {
    "Pastas":        "Porción",
    "Lasañas":       "Porción",
    "Ensaladas":     "Porción",
    "Sandwiches":    "Unidad",
    "Hamburguesas":  "Hamburguesa",
};

// Estado temporal para la selección de segundo sabor
let _mezclaState = null;

// Inicializar interfaz y llama funciones necesarias.
function init() {
    // El carrito siempre empieza vacío al cargar — limpiar residuos de sesión anterior
    localStorage.removeItem('dp_promo65k_obs');
    localStorage.removeItem('dp_promo3x2_obs');
    localStorage.removeItem('dp_promoLasEsp_obs');
    localStorage.removeItem('dp_promoPepperoni_obs');
    localStorage.removeItem('dp_promoKit_obs');

    renderCategories();
    crearBuscador();
    seleccionarCategoria("Pizzas");

    // Re-renderizar menú cuando cambia la ciudad
    document.addEventListener('ciudad:change', () => {
        renderCategories();
        const activaCat = document.querySelector('.cat-btn.active');
        const cat = activaCat ? activaCat.textContent.trim() : 'Pizzas';
        seleccionarCategoria(cat);
    });
}

// Inyeccción de barra buscadora por nombre de productos
function crearBuscador() {
    const wrapper = document.getElementById('search-wrapper');
    const buscadorHTML = `
        <div class="search-container no-print">
            <input type="text" id="productSearch"
                   placeholder="🔍 Buscar producto (ej: Hawaiana, Pollo, Carne...)"
                   oninput="ejecutarFiltro()"
                   style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px;">
            <div class="ciudad-alerta" id="ciudad-badge">
                <div class="ciudad-alerta__top">
                    <div class="ciudad-alerta__icono">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
                        </svg>
                    </div>
                    <span class="ciudad-alerta__label">Ciudad actual:</span>
                    <span class="ciudad-alerta__ciudad" id="ciudad-badge-texto">BUCARAMANGA</span>
                    <span class="ciudad-alerta__sedes" id="ciudad-badge-sedes">· 6 SEDES</span>
                </div>
                <div class="ciudad-alerta__aviso">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    Verifica la ciudad antes de tomar el pedido
                </div>
            </div>
        </div>
    `;
    wrapper.innerHTML = buscadorHTML;
    _actualizarCiudadBadge(window.ciudadActual || 'bucaramanga');
}

const CIUDAD_CONFIG = {
    bucaramanga: { label: 'BUCARAMANGA', sedes: 6 },
    cartago:     { label: 'CARTAGO',     sedes: 2 },
};

function _actualizarCiudadBadge(ciudad) {
    const cfg = CIUDAD_CONFIG[ciudad] || CIUDAD_CONFIG.bucaramanga;
    const elCiudad = document.getElementById('ciudad-badge-texto');
    const elSedes  = document.getElementById('ciudad-badge-sedes');
    const elBadge  = document.getElementById('ciudad-badge');
    if (elCiudad) elCiudad.textContent = cfg.label;
    if (elSedes)  elSedes.textContent  = `· ${cfg.sedes} SEDES`;
    if (elBadge)  elBadge.dataset.ciudad = ciudad;
}

//Función para mostrar el sidebar lado izquierdo.
function renderCategories() {
    const nav = document.getElementById('categoryNav');
    const _ciudad = (localStorage.getItem('cc_ciudad') || 'bucaramanga').toLowerCase();
    const _excluirCat = new Set(MENU_EXCLUIR?.[_ciudad]?.categorias || []);
    const categoriasVisibles = [
        "Promociones",
        "Pizzas",
        "Bebidas",
        "Calzones Clásicos",
        "Calzones Especiales",
        "Lasañas",
        "Pastas",
        "Maicitos",
        "Hamburguesas",
        "Stromboli Clásico",
        "Stromboli Especial",
        "Sandwiches",
        "Ensaladas",
        "Entradas/Adición",
    ].filter(c => !_excluirCat.has(c));

    nav.innerHTML = categoriasVisibles.map(c =>
        `<button class="cat-btn" onclick="seleccionarCategoria('${c}')">${c}</button>`
    ).join('');
    nav.innerHTML += `<button class="cat-btn cat-btn--reserva" onclick="abrirModalReserva()">📅 Reservas</button>`;
}

// Selección categoria para mostrar variedad según categoria.
function seleccionarCategoria(categoria) {
    modoCalzoneActivo = (categoria === "Calzones");

    // Marcar botón activo
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cat-btn').forEach(b => {
        if (b.textContent.trim() === categoria) b.classList.add('active');
    });

    // Limpiar el texto de búsqueda al cambiar de categoría
    const input = document.getElementById('productSearch');
    if (input) input.value = "";
    
    renderProducts(categoria);
}

 // Muestra sabor según categoria para mostrar variedad según categoria.
function renderProducts(categoria) {
    const grid = document.getElementById('productGrid');
    let productos = [];

    if (categoria === "Promociones") {
        const esMartes = new Date().getDay() === 2;
        const _hoyB = new Date();
        const esFechaBerrionda = _hoyB.getFullYear() === 2026 && _hoyB.getMonth() === 6 && (_hoyB.getDate() === 22 || _hoyB.getDate() === 23);
        grid.innerHTML = `
            <div class="card card-promo ${esMartes ? '' : 'card-promo--inactiva'}" onclick="${esMartes ? 'abrirPromo3x2()' : ''}">
                <div class="promo-badge">MARTES</div>
                <h4>3 × 2</h4>
                <p class="product-desc">Lleva 3 del mismo tamaño, paga solo 2.</p>
                <p class="promo-elegibles">${esMartes ? 'Pizzas · Lasañas · Ensaladas · Calzones' : 'Disponible solo los martes'}</p>
            </div>
            <div class="card card-promo" onclick="abrirPromo65k()">
                <div class="promo-badge">PROMO</div>
                <h4>65K</h4>
                <p class="product-desc">Pizza Grande + Gaseosa 1.5 lts</p>
                <p class="promo-elegibles">Clásica · Típica</p>
            </div>
            <div class="card card-promo" onclick="abrirPromoPepperoni()">
                <div class="promo-badge">PROMO</div>
                <h4>28K</h4>
                <p class="product-desc">Pizza Pepperoni<br>6 porciones · 30 cm</p>
            </div>
            <div class="card card-promo" onclick="abrirPromoLasEsp()">
                <div class="promo-badge">PROMO</div>
                <h4>48K</h4>
                <p class="product-desc">2 Lasañas o 2 Espaguettis<br>+ 2 Gaseosas 250ml</p>
            </div>
            <div class="card card-promo" onclick="abrirPromoKit()">
                <div class="promo-badge">PROMO</div>
                <h4>25K</h4>
                <p class="product-desc">Kit Pizzeritos<br>5 sabores disponibles</p>
            </div>
            <div class="card card-promo" onclick="abrirPromoCombola10()">
                <div class="promo-badge">PROMO</div>
                <h4>99K</h4>
                <p class="product-desc">Combo La 10<br>Pizza Grande Criolla + 6 Cervezas Heineken</p>
            </div>
            <div class="card card-promo ${esFechaBerrionda ? '' : 'card-promo--inactiva'}" onclick="${esFechaBerrionda ? 'abrirPromoBerrionda()' : ''}">
                <div class="promo-badge">PROMO</div>
                <div class="promo-sede-badge">SOLO PIEDECUESTA</div>
                <h4>35K</h4>
                <p class="product-desc">Pizza Berrionda Pequeña<br>Mozarella · Maíz · Chicharrón · Chorizo</p>
                <p class="promo-elegibles">${esFechaBerrionda ? 'Solo Piedecuesta · 22 y 23 Jul' : 'No disponible hoy'}</p>
            </div>
        `;
        return;
    }

    //Agrupamos los productos según la categoría seleccionada, para mostrar las diferentes variaciones.
    if (categoria === "Pizzas") {
        const llavesPizzas = ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Especiales", "Pizzas Clásicas", "Pizzas Típicas", "Pizzetas Premium"];
        llavesPizzas.forEach(key => {
            if (menuData[key]) productos = [...productos, ...menuData[key].map(p => ({...p, esPizza: true, esAdicionable: true}))];
        });
    } else if (categoria === "Calzones Clásicos") {
        const llavesPizzas = [ "Pizzas Clásicas" ];
        llavesPizzas.forEach(key => {
           if (menuData[key]) {
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Calzone ${saborOriginal.nombre}`,
                    opciones: preciosCalzones.calzoneClasico,
                    esAdicionable: true,
                    tamanoRaw: "Unidad"
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });
    } else if (categoria === "Calzones Especiales") {
        const llavesPizzas = [ "Pizzas Super Estofadas" , "Pizzas Estofadas" , "Pizzas Típicas" , "Pizzas Especiales" ];
        llavesPizzas.forEach(key => {
            if (menuData[key]) {
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Calzone ${saborOriginal.nombre}`,
                    opciones: preciosCalzones.calzoneEspecial,
                    esAdicionable: true,
                    tamanoRaw: "Unidad"
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });
    } else if (categoria === "Stromboli Clásico") {
        const llavesPizzas = [ "Pizzas Clásicas" ];
        llavesPizzas.forEach(key => {
           if (menuData[key]) {
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Stromboli ${saborOriginal.nombre}`,
                    opciones: preciosStromboli.stromboliClasico,
                    esAdicionable: true,
                    tamanoRaw: "Unidad"
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });
    } else if (categoria === "Stromboli Especial") {
        const llavesPizzas = [ "Pizzas Super Estofadas" , "Pizzas Estofadas" , "Pizzas Típicas" , "Pizzas Especiales" ];
        llavesPizzas.forEach(key => {
            if (menuData[key]) {
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Stromboli ${saborOriginal.nombre}`,
                    opciones: preciosStromboli.stromboliEspecial,
                    esAdicionable: true,
                    tamanoRaw: "Unidad"
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });
    }  
    
    
    
    else if (categoria === "Bebidas") {
        const llavesBebidas = ["Gaseosas", "Jugos Naturales", "Limonadas", "Sodas", "Refrescos", "Cervezas", "Otros"];
        llavesBebidas.forEach(key => {
            if (menuData[key]) productos = [...productos, ...menuData[key]];
        });
    } else {
        const base = menuData[categoria] || [];
        const tamanoAdicion = CATEGORIAS_ADICIONABLES[categoria];
        productos = tamanoAdicion
            ? base.map(p => ({...p, esAdicionable: true, tamanoRaw: tamanoAdicion}))
            : base;
    }

    // Filtrar por ciudad activa
    const _ciudadMenu = (localStorage.getItem('cc_ciudad') || 'bucaramanga').toLowerCase();
    const _excluirProds = new Set(MENU_EXCLUIR?.[_ciudadMenu]?.productos || []);
    if (_excluirProds.size) productos = productos.filter(p => !_excluirProds.has(p.nombre));

    // 2. Renderizamos las tarjetas
    grid.innerHTML = productos.map(p => {
        // SEGURIDAD: Validamos que p.opciones exista antes de usar Object.values
      let opcionesFinales;
        if (categoria === "Calzone Clásico") {
            // Ignoramos preciosPizzas.clasica y usamos los de calzone
            opcionesFinales = preciosVariedades.calzoneClasico;
        } else if (categoria === "Calzone Especial") {
            opcionesFinales = preciosVariedades.calzoneEspecial;
        } else {
            opcionesFinales = p.opciones || {};
        }
        const listaPrecios = Object.values(opcionesFinales);

        // Si el producto no tiene precios (por un error en products.js), lo saltamos
        if (listaPrecios.length === 0) {
            console.error(`Error: El producto "${p.nombre}" no tiene opciones de precio.`);
            return ''; 
        }

        const precioMin = Math.min(...listaPrecios);
        const precioMostrar = listaPrecios.length > 1 
            ? `$${precioMin.toLocaleString()}+` 
            : `$${listaPrecios[0].toLocaleString()}`;

        const prefijo = modoCalzoneActivo ? "Calzone " : "";
        const nombreCompleto = `${prefijo}${p.nombre}`;

        return `
            <div class="card" data-nombre="${nombreCompleto}" onclick='prepararSeleccion(${JSON.stringify(p)}, ${modoCalzoneActivo})'>
                <h4>${nombreCompleto}</h4>
                ${p.descripcion ? `<p class="product-desc">${p.descripcionCiudad?.[localStorage.getItem('cc_ciudad') || 'bucaramanga'] || p.descripcion}</p>` : ''}
                <p class="price">${precioMostrar}</p>
            </div>
        `;
    }).join('');
}

//Ejecutamos el filtro para buscar por nombre de productos ---
function ejecutarFiltro() {
    const query = document.getElementById('productSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.card');

    cards.forEach(card => {
        // Obtenemos el nombre desde el atributo data-nombre que pusimos arriba
        const nombreProducto = card.getAttribute('data-nombre').toLowerCase();
        card.style.display = nombreProducto.includes(query) ? "block" : "none";
    });
}

function prepararSeleccion(producto, categoria) {
    let productoFinal = { ...producto };
    
    // Si la categoría seleccionada es de calzones, sobreescribimos nombre y precios
    if (categoria === "Calzone Clasico") {
        productoFinal.nombre = `Calzone ${producto.nombre}`;
        productoFinal.opciones = preciosVariedades.calzoneClasico;
    } else if (categoria === "Calzone Especial") {
        productoFinal.nombre = `Calzone ${producto.nombre}`;
        productoFinal.opciones = preciosVariedades.calzoneEspecial;
    }
    
    abrirSeleccion(productoFinal);
}

// Nueva función para manejar la lógica de tamaños/opciones
function abrirSeleccion(producto) {
    // opcionesCiudad permite variantes distintas por ciudad (ej: Hamburguesa Mixta en Cartago)
    const ciudad = localStorage.getItem('cc_ciudad') || 'bucaramanga';
    const opEfectivas = producto.opcionesCiudad?.[ciudad] ?? producto.opciones;
    const opciones = Object.keys(opEfectivas);

    // Si solo tiene una opción (ej: "Unidad"), se agrega directo
    if (opciones.length === 1) {
        const tamano = opciones[0];
        const meta = producto.esAdicionable
            ? { esAdicionable: true, tamanoRaw: producto.tamanoRaw || tamano }
            : {};
        confirmarAgregar(producto.nombre, tamano, opEfectivas[tamano], meta);
        return;
    }

    const modal = document.getElementById('modal-seleccion');
    const titulo = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');

    titulo.innerText = producto.nombre;

    if (producto.esPizza) {
        // Layout especial: botón tamaño + botón ½+½ para tamaños mixables
        gridOpciones.className = 'opciones-grid opciones-pizza';
        gridOpciones.innerHTML = Object.entries(producto.opciones).map(([tam, pre]) => {
            const mixable = TAMANOS_MIXABLES.has(tam);
            return `
                <div class="tamano-fila">
                    <button class="btn-tamano btn-solo" data-tam="${tam}" data-pre="${pre}">
                        ${tam}<br><strong>$${pre.toLocaleString()}</strong>
                    </button>
                    ${mixable
                        ? `<button class="btn-mitad" data-tam="${tam}" data-pre="${pre}"><span class="btn-mitad-disc"></span></button>`
                        : `<div class="btn-mitad-placeholder"></div>`
                    }
                </div>
            `;
        }).join('');

        gridOpciones.querySelectorAll('.btn-solo').forEach(btn => {
            btn.addEventListener('click', () => {
                confirmarAgregar(producto.nombre, btn.dataset.tam, Number(btn.dataset.pre),
                    { esPizza: true, esAdicionable: true, tamanoRaw: btn.dataset.tam, ...(producto.esEstofada && { esEstofada: true }) });
                cerrarModal();
            });
        });

        gridOpciones.querySelectorAll('.btn-mitad').forEach(btn => {
            btn.addEventListener('click', () => {
                cerrarModal();
                abrirSegundoSabor(producto, btn.dataset.tam, Number(btn.dataset.pre));
            });
        });

    } else {
        // Layout para no-pizzas (con soporte de meta para adicionables)
        gridOpciones.className = 'opciones-grid';
        gridOpciones.innerHTML = Object.entries(opEfectivas).map(([tam, pre]) => `
            <button class="btn-tamano" data-tam="${tam}" data-pre="${pre}">
                ${tam} <br> <strong>$${pre.toLocaleString()}</strong>
            </button>
        `).join('');

        gridOpciones.querySelectorAll('.btn-tamano').forEach(btn => {
            btn.addEventListener('click', () => {
                const meta = producto.esAdicionable
                    ? { esAdicionable: true, tamanoRaw: producto.tamanoRaw || btn.dataset.tam }
                    : {};
                confirmarAgregar(producto.nombre, btn.dataset.tam, Number(btn.dataset.pre), meta);
                cerrarModal();
            });
        });
    }

    modal.style.display = 'flex';
}

// ── SEGUNDO SABOR: abre el modal de selección ─────────────────────
function abrirSegundoSabor(sabor1, tamano, precio1) {
    // Reúne todos los sabores de pizza que tienen el mismo tamaño
    const llavesPizzas = ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Especiales", "Pizzas Clásicas", "Pizzas Típicas"];
    let todosSabores = [];
    llavesPizzas.forEach(key => {
        if (menuData[key]) todosSabores = [...todosSabores, ...menuData[key]];
    });

    // Excluye el sabor ya elegido y los que no tienen ese tamaño
    const saboresDisponibles = todosSabores.filter(s =>
        s.nombre !== sabor1.nombre && s.opciones[tamano] !== undefined
    );

    _mezclaState = { saboresDisponibles, sabor1, tamano, precio1 };

    const modal = document.getElementById('modal-seleccion');
    const titulo = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    const modalContent = modal.querySelector('.modal-content');

    titulo.innerHTML = `½ ${sabor1.nombre}<br><small style="font-size:1.4rem;color:#666;font-weight:normal;">${tamano} · Elige el 2° sabor</small>`;
    modalContent.classList.add('modal-sabor2');

    gridOpciones.className = 'opciones-grid opciones-sabores';
    gridOpciones.innerHTML = `
        <div class="busqueda-sabor2-wrapper">
            <input type="text" id="buscar-sabor2"
                   placeholder="🔍 Buscar sabor..."
                   oninput="filtrarSabores2(this.value)"
                   autocomplete="off">
        </div>
        <div id="sabores2-grid" class="sabores2-grid"></div>
    `;

    renderGridSabores2(saboresDisponibles);

    modal.style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('buscar-sabor2');
        if (input) input.focus();
    }, 100);
}

function filtrarSabores2(filtro) {
    if (!_mezclaState) return;
    const filtrados = filtro
        ? _mezclaState.saboresDisponibles.filter(s => s.nombre.toLowerCase().includes(filtro.toLowerCase()))
        : _mezclaState.saboresDisponibles;
    renderGridSabores2(filtrados);
}

function renderGridSabores2(sabores) {
    const grid = document.getElementById('sabores2-grid');
    if (!grid || !_mezclaState) return;
    const { sabor1, tamano, precio1 } = _mezclaState;

    if (sabores.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No se encontraron sabores.</p>';
        return;
    }

    grid.innerHTML = sabores.map(s => {
        const precio2 = s.opciones[tamano];
        const precioFinal = Math.max(precio1, precio2);
        return `
            <button class="btn-sabor2" data-nombre="${s.nombre}" data-precio2="${precio2}">
                <span class="sabor2-nombre">${s.nombre}</span>
                <span class="sabor2-precio">$${precioFinal.toLocaleString()}</span>
            </button>
        `;
    }).join('');

    grid.querySelectorAll('.btn-sabor2').forEach(btn => {
        btn.addEventListener('click', () => {
            const { sabor1, tamano, precio1 } = _mezclaState;
            const sabor2 = sabores.find(s => s.nombre === btn.dataset.nombre);
            const precio2 = Number(btn.dataset.precio2);
            const precioFinal = Math.max(precio1, precio2);
            const nombreMezcla = `${sabor1.nombre} y mitad ${btn.dataset.nombre} (${tamano})`;
            const esEstofada = !!(sabor1.esEstofada || sabor2?.esEstofada);
            confirmarAgregar(nombreMezcla, '', precioFinal,
                { esPizza: true, esAdicionable: true, tamanoRaw: tamano, ...(esEstofada && { esEstofada: true }) });
            cerrarModal();
            _mezclaState = null;
        });
    });
}

function confirmarAgregar(nombre, tamano, precio, meta = {}) {
    // Si tamano viene vacío (caso mezcla ½+½), el nombre ya incluye el tamaño
    const itemPedido = {
        id: Date.now(),
        nombre: tamano ? `${nombre} (${tamano})` : nombre,
        precio: precio,
        qty: 1,
        ...meta
    };

    carrito.push(itemPedido);
    actualizarComanda();
}

function incrementarQty(id) {
    const item = carrito.find(i => i.id === id);
    if (item) { item.qty++; actualizarComanda(); }
}

function decrementarQty(id) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;
    if (item.qty > 1) { item.qty--; actualizarComanda(); }
    else eliminarItem(id);
}

function cerrarModal() {
    const modal = document.getElementById('modal-seleccion');
    if (modal) {
        modal.style.display = 'none';
        // Limpiar clase de modal ampliado y estado de mezcla
        const content = modal.querySelector('.modal-content');
        if (content) content.classList.remove('modal-sabor2');
        _mezclaState = null;
        _promo3x2State = null;
        _promo65kState = null;
        _promoLasEspState = null;
    }
}
// Escuchamos el evento de clic en la ventana (window) o directamente en el modal
window.addEventListener('click', function(event) {
    const modal = document.getElementById('modal-seleccion');
    
    // Verificamos si el clic fue directamente en el fondo (el contenedor principal)
    // y no en sus elementos hijos (como el formulario o botones)
    if (event.target === modal) {
        cerrarModal();
    }
});

// Regresamos al panel de administración del CallCenter
const btnHome = document.getElementById('btn-home'); 

function regresarHome() {
    window.location.href = '../CallCenter/callcenter.html';
}

if (btnHome) {
    btnHome.addEventListener('click', regresarHome);
}



//*******FUNCIONES DEL CARRITO DONDE AÑADIMOS DATOS DE PEDIDO********/
function actualizarComanda() {
    const container = document.getElementById('orderItems');
    const totalDisp = document.getElementById('totalDisplay');
    
    const btnVaciar = document.getElementById('btn-vaciar');
    if(carrito.length === 0) {
        limpiarFormularioCheckout();
        container.innerHTML = '<p class="empty-msg">No hay productos</p>';
        totalDisp.innerText = "$0";
        if (btnVaciar) btnVaciar.style.display = 'none';
        return;
    }
    if (btnVaciar) btnVaciar.style.display = 'inline-flex';

    // Principales (sin pizzaId)
    const principales = carrito.filter(i => !i.pizzaId);
    container.innerHTML = principales.map(item => {
        const adicionesItem = carrito.filter(a => a.pizzaId === item.id);
        const botonAdicion = item.esAdicionable && item.tamanoRaw
            ? `<button class="btn-add-adicion" onclick="abrirAdicionesModal(${item.id}, '${item.tamanoRaw}')" title="Agregar adición o borde">⊕</button>`
            : '';

        const tieneObs = item.obs && item.obs.trim();
        const botonObs = `<button class="btn-obs ${tieneObs ? 'btn-obs--activo' : ''}" onclick="toggleObsItem(${item.id})" title="Agregar nota al producto">✏️</button>`;
        const obsPreview = tieneObs && !item._obsOpen
            ? `<div class="obs-preview">📝 ${item.obs}</div>` : '';
        const obsInput = `
            <div class="obs-input-wrap" id="obs-wrap-${item.id}" style="display:${item._obsOpen ? 'flex' : 'none'};">
                <input type="text" class="obs-input"
                       placeholder="Ej: sin jalapeños, dividida en 8..."
                       value="${item.obs || ''}"
                       oninput="guardarObsItem(${item.id}, this.value)"
                       onblur="cerrarObsIfEmpty(${item.id})"
                       maxlength="120">
            </div>`;

        // Tags visuales para ítems de promo
        const promoTagHtml = item.esObsequio3x2
            ? `<span class="obsequio-tag">🎁 OBSEQUIO</span>`
            : item.esPromo3x2
            ? `<span class="promo-tag">PROMO 3×2</span>`
            : item.esPromo65k
            ? `<span class="promo-tag">COMBO 65K</span>`
            : item.esPromoLasEsp
            ? `<span class="promo-tag">PROMO 48K</span>`
            : item.esPromoPepperoni
            ? `<span class="promo-tag">PROMO 28K</span>`
            : item.esPromoKit
            ? `<span class="promo-tag">KIT PIZZERITOS</span>`
            : item.esPromoBerrionda
            ? `<span class="promo-tag">PROMO 35K</span>`
            : '';
        const nombreDisplay = item.esPromo3x2
            ? item.nombre.replace(/^\[PROMO 3x2\]\s*(🎁\s*OBSEQUIO\s*)?/, '')
            : item.nombre;
        const precioClass = (item.esObsequio3x2 || item.esGaseosa65k || item.esGaseosaLasEsp || item.esExtra28k) ? 'item-precio item-precio--gratis' : 'item-precio';

        const rowPrincipal = `
            <div class="item-grupo ${item._obsOpen ? 'item-grupo--obs-open' : ''}">
                <div class="item-row" data-id="${item.id}">
                    <div class="item-nombre-wrap">
                        <span class="item-nombre">${promoTagHtml}${nombreDisplay}</span>
                        ${obsPreview}
                    </div>
                    <div class="item-controls">
                        ${botonAdicion}
                        ${(item.esObsequio3x2 || item.esPromo65k || item.esPromoLasEsp || item.esPromoPepperoni || item.esPromoKit) ? '' : botonObs}
                        ${(item.esPromo3x2 || item.esPromo65k || item.esPromoLasEsp || item.esPromoPepperoni || item.esPromoKit || item.esPromoBerrionda) ? '' : `<div class="qty-control">
                            <button class="btn-qty" onclick="decrementarQty(${item.id})">−</button>
                            <span class="qty-valor">${item.qty}</span>
                            <button class="btn-qty" onclick="incrementarQty(${item.id})">+</button>
                        </div>`}
                        <strong class="${precioClass}">$${(item.precio * item.qty).toLocaleString()}</strong>
                        <button onclick="eliminarItem(${item.id})" class="btn-delete">🗑️</button>
                    </div>
                </div>
                ${obsInput}
            </div>`;

        const rowsAdiciones = adicionesItem.map(a => `
            <div class="item-row adicion-row" data-id="${a.id}">
                <span class="item-nombre adicion-nombre">↳ ${a.nombre}</span>
                <div class="item-controls">
                    <strong class="item-precio">$${(a.precio * a.qty).toLocaleString()}</strong>
                    <button onclick="eliminarItem(${a.id})" class="btn-delete">🗑️</button>
                </div>
            </div>`).join('');

        return rowPrincipal + rowsAdiciones;
    }).join('');

    const total = carrito.reduce((sum, item) => sum + item.precio * item.qty, 0);
    totalDisp.innerText = `$${total.toLocaleString()}`;
    actualizarCartBar();
}

// ── Cart bar — mobile ──────────────────────────────────────────────────────
function actualizarCartBar() {
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    // No actualizar si el panel ya está abierto
    if (document.querySelector('.order-panel')?.classList.contains('order-panel--open')) return;
    const principales = carrito.filter(i => !i.pizzaId);
    const total = carrito.reduce((sum, i) => sum + i.precio * i.qty, 0);
    if (principales.length === 0) {
        bar.classList.remove('cart-bar--visible');
        return;
    }
    bar.classList.add('cart-bar--visible');
    document.getElementById('cart-bar-count').textContent =
        `${principales.length} ${principales.length === 1 ? 'producto' : 'productos'}`;
    document.getElementById('cart-bar-total').textContent = `$${total.toLocaleString()}`;
}

function abrirCartPanel() {
    document.querySelector('.order-panel').classList.add('order-panel--open');
    document.getElementById('cart-overlay').classList.add('cart-overlay--visible');
    document.getElementById('cart-bar').classList.remove('cart-bar--visible');
}

function cerrarCartPanel() {
    document.querySelector('.order-panel').classList.remove('order-panel--open');
    document.getElementById('cart-overlay').classList.remove('cart-overlay--visible');
    actualizarCartBar();
}

function eliminarItem(id) {
    const itemTarget = carrito.find(i => i.id === id);

    // Si pertenece a una promo 3x2, eliminar los 3 juntos con confirmación
    if (itemTarget?.promoId) {
        if (!confirm('Este producto es parte de una Promo 3×2. ¿Eliminar los 3 productos de la promo?')) return;
        const promoIds = carrito.filter(i => i.promoId === itemTarget.promoId).map(i => i.id);
        promoIds.forEach(fId => {
            const fila = document.querySelector(`.item-row[data-id="${fId}"]`);
            if (fila) fila.classList.add('item-removing');
        });
        setTimeout(() => {
            carrito = carrito.filter(i => i.promoId !== itemTarget.promoId);
            if (!carrito.some(i => i.esPromo3x2)) localStorage.removeItem('dp_promo3x2_obs');
            actualizarComanda();
        }, 300);
        return;
    }

    // Si pertenece a una promo 65K, eliminar ambos productos juntos
    if (itemTarget?.promoId65k) {
        if (!confirm('Este producto es parte de una Promo 65K. ¿Eliminar los productos de la promo?')) return;
        const promoIds = carrito.filter(i => i.promoId65k === itemTarget.promoId65k).map(i => i.id);
        promoIds.forEach(fId => {
            const fila = document.querySelector(`.item-row[data-id="${fId}"]`);
            if (fila) fila.classList.add('item-removing');
        });
        setTimeout(() => {
            carrito = carrito.filter(i => i.promoId65k !== itemTarget.promoId65k);
            if (!carrito.some(i => i.esPromo65k)) localStorage.removeItem('dp_promo65k_obs');
            _limpiarFiltroSedes();
            actualizarComanda();
        }, 300);
        return;
    }

    // Si pertenece a una promo 48K (Lasaña/Espaguetti), eliminar los 4 productos juntos
    if (itemTarget?.promoIdLasEsp) {
        if (!confirm('Este producto es parte de una Promo 48K. ¿Eliminar los productos de la promo?')) return;
        const promoIds = carrito.filter(i => i.promoIdLasEsp === itemTarget.promoIdLasEsp).map(i => i.id);
        promoIds.forEach(fId => {
            const fila = document.querySelector(`.item-row[data-id="${fId}"]`);
            if (fila) fila.classList.add('item-removing');
        });
        setTimeout(() => {
            carrito = carrito.filter(i => i.promoIdLasEsp !== itemTarget.promoIdLasEsp);
            if (!carrito.some(i => i.esPromoLasEsp)) localStorage.removeItem('dp_promoLasEsp_obs');
            actualizarComanda();
        }, 300);
        return;
    }

    // IDs a eliminar: el item + sus adiciones vinculadas (si es pizza)
    const adicionIds = carrito.filter(a => a.pizzaId === id).map(a => a.id);
    const todosIds = [id, ...adicionIds];

    todosIds.forEach(fId => {
        const fila = document.querySelector(`.item-row[data-id="${fId}"]`);
        if (fila) fila.classList.add('item-removing');
    });

    setTimeout(() => {
        carrito = carrito.filter(item => item.id !== id && item.pizzaId !== id);
        if (!carrito.some(i => i.esPromoPepperoni)) localStorage.removeItem('dp_promoPepperoni_obs');
        if (!carrito.some(i => i.esPromoKit))       localStorage.removeItem('dp_promoKit_obs');
        actualizarComanda();
    }, 300);
}

function toggleObsItem(id) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;
    item._obsOpen = !item._obsOpen;
    actualizarComanda();
    if (item._obsOpen) {
        setTimeout(() => document.querySelector(`#obs-wrap-${id} input`)?.focus(), 50);
    }
}

function guardarObsItem(id, value) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;
    item.obs = value;
    const btn = document.querySelector(`.item-row[data-id="${id}"] .btn-obs`);
    if (btn) btn.classList.toggle('btn-obs--activo', value.trim().length > 0);
}

function cerrarObsIfEmpty(id) {
    const item = carrito.find(i => i.id === id);
    if (!item || item.obs?.trim()) return;
    item._obsOpen = false;
    actualizarComanda();
}

function vaciarCarrito() {
    const filas = document.querySelectorAll('.item-row');
    filas.forEach((fila, i) => {
        setTimeout(() => fila.classList.add('item-removing'), i * 60);
    });
    setTimeout(() => {
        carrito = [];
        _toppingsCC = new Set();
        localStorage.removeItem('dp_promo65k_obs');
        localStorage.removeItem('dp_promo3x2_obs');
        localStorage.removeItem('dp_promoLasEsp_obs');
        localStorage.removeItem('dp_promoPepperoni_obs');
        localStorage.removeItem('dp_promoKit_obs');
        _limpiarFiltroSedes();
        actualizarComanda();
    }, filas.length * 60 + 300);
}
function actualizarTotalCheckout() {
    const totalProductos = carrito.reduce((sum, item) => sum + item.precio * item.qty, 0);
    const tipo    = document.querySelector('.entrega-btn.active')?.dataset.tipo || '';
    const sede    = document.querySelector('.sede-btn.active')?.dataset.sede    || '';
    const barrio  = document.getElementById('barrioInput')?.value               || '';
    const valDom  = (tipo === 'domicilio' && window.domicilios?.[sede]?.[barrio]) || 0;

    const elSub   = document.getElementById('checkout-subtotal');
    const elDom   = document.getElementById('checkout-domicilio-val');
    const elTotal = document.getElementById('checkout-total-final');
    const elRow   = document.getElementById('checkout-domicilio-row');
    if (!elSub) return;

    elSub.textContent   = `$${totalProductos.toLocaleString()}`;
    elDom.textContent   = `$${valDom.toLocaleString()}`;
    elTotal.textContent = `$${(totalProductos + valDom).toLocaleString()}`;
    elRow.style.display = tipo === 'domicilio' ? 'flex' : 'none';
}
window.actualizarTotalCheckout = actualizarTotalCheckout;

//Funciónes del checkout del pedido.(datos del cliente)
function abrirCheckout() {
    if (carrito.length === 0) return alert("El carrito está vacío");

    if (_modoReserva) {
        _restaurarModoNormal();
        _modoReserva = false;
    }

    const modal = document.getElementById('modal-checkout');
    modal.style.display = 'flex';
    _renderAcomps(window.ciudadActual || 'bucaramanga');
    actualizarTotalCheckout();

    // IMPORTANTE: El foco automático
    setTimeout(() => {
        document.getElementById('clienteNombre').focus();
    }, 100);
}

const SEDES_RESERVA = new Set(['cabecera', 'cañaveral', 'piedecuesta']);

function _generarSlots(desde, hasta) {
    const slots = [];
    let [h, m] = desde;
    const [hf, mf] = hasta;
    while (h < hf || (h === hf && m <= mf)) {
        const h12 = h > 12 ? h - 12 : h;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const label = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        slots.push({ label, value });
        m += 15;
        if (m >= 60) { m -= 60; h++; }
    }
    return slots;
}

function renderHorariosReserva() {
    const grid = document.getElementById('hora-reserva-grid');
    const slotsPrimarios  = _generarSlots([18, 0],  [21, 0]);
    const slotsEarly      = _generarSlots([15, 15], [17, 45]);
    const slotsLate       = _generarSlots([21, 15], [23, 0]);

    function crearBotones(slots, ocultos = false) {
        return slots.map(s => `
            <button type="button"
                class="hora-btn${ocultos ? ' hora-btn--extra' : ''}"
                data-hora="${s.value}"
                onclick="seleccionarHora(this)">
                ${s.label}
            </button>`).join('');
    }

    grid.innerHTML = `
        ${crearBotones(slotsPrimarios)}
        <div id="horarios-extra" style="display:none; width:100%; display:none;">
            ${crearBotones(slotsEarly)}
            ${crearBotones(slotsLate)}
        </div>
        <button type="button" id="btn-ver-mas-horarios" class="hora-btn-vermas"
            onclick="toggleHorariosExtra()">+ Ver otros horarios ▾</button>
    `;
}

window.seleccionarHora = function(btn) {
    document.querySelectorAll('.hora-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('horaReserva').value = btn.dataset.hora;
};

window.toggleHorariosExtra = function() {
    const extra = document.getElementById('horarios-extra');
    const btn   = document.getElementById('btn-ver-mas-horarios');
    const visible = extra.style.display !== 'none';
    extra.style.display = visible ? 'none' : 'flex';
    btn.textContent = visible ? '+ Ver otros horarios ▾' : '− Ocultar ▴';
};

function abrirModalReserva() {
    limpiarFormularioCheckout();
    renderHorariosReserva();

    // Activar modo reserva: ocultar secciones de pedido, mostrar personas
    document.getElementById('modal-checkout-titulo').textContent = 'NUEVA RESERVA';
    document.getElementById('entrega-toggle-section').style.display = 'none';
    document.getElementById('pago-section').style.display = 'none';
    document.getElementById('acomp-section').style.display = 'none';
    document.getElementById('personas-section').style.display = 'block';
    document.getElementById('btn-enviar-pedido').style.display = 'none';
    document.getElementById('btn-crear-reserva').style.display = 'block';

    // Restringir sedes a las que aplican reservas
    document.querySelectorAll('.sede-toggle .sede-btn').forEach(btn => {
        if (!SEDES_RESERVA.has(btn.dataset.sede)) btn.disabled = true;
    });

    _modoReserva = true;

    const modal = document.getElementById('modal-checkout');
    modal.style.display = 'flex';

    setTimeout(() => {
        document.getElementById('clienteNombre').focus();
    }, 100);
}

async function procesarReservaFinal() {
    const canal     = document.querySelector('.canal-btn.active')?.dataset.canal || '';
    const sede      = document.querySelector('.sede-btn.active')?.dataset.sede   || '';
    const nombre    = document.getElementById('clienteNombre').value.trim();
    const telefono  = document.getElementById('clienteTelefono').value.trim();
    const fecha     = document.getElementById('fechaReserva').value.trim();
    const hora      = document.getElementById('horaReserva').value.trim();
    const personas  = parseInt(document.getElementById('cantidadPersonas').value, 10);
    const obs       = document.getElementById('observaciones').value.trim();

    if (!canal)               return alert('⚠️ Selecciona el canal (WhatsApp o IVR).');
    if (!sede)                return alert('⚠️ Selecciona una sede.');
    if (!nombre)              return alert('⚠️ El nombre del cliente es obligatorio.');
    const telNorm = normalizarTelefono(telefono);
    if (!telNorm)             return alert('⚠️ Por favor validar el número de teléfono.');
    if (!fecha)               return alert('⚠️ La fecha de la reserva es obligatoria.');
    if (!hora)                return alert('⚠️ La hora de la reserva es obligatoria.');
    if (!personas || personas < 1) return alert('⚠️ Ingresa la cantidad de personas (mínimo 1).');

    const datos = {
        tipo: 'reserva',
        canal,
        sede,
        nombre,
        telefono: telNorm,
        fechaReserva: fecha,
        horaReserva: hora,
        cantidadPersonas: personas,
        obs,
        impreso: false
    };

    window.mostrarOverlay?.('Creando reserva...');
    try {
        const pedidoId = await window.enviarAFirebase(datos);

        cerrarCheckout();
        limpiarFormularioCheckout();

        const asesor = window.asesorActual || 'Asesor';
        const sedeLabel = sede.charAt(0).toUpperCase() + sede.slice(1).toLowerCase();
        window.ocultarOverlay?.(true, { asesor, pedidoId, sede: sedeLabel });

    } catch (error) {
        console.error('Error al crear reserva:', error);
        window.ocultarOverlay?.(false);
        alert('Hubo un error al crear la reserva.');
    }
}




function _restaurarModoNormal() {
    document.getElementById('modal-checkout-titulo').textContent = 'DATOS CLIENTE';
    document.getElementById('entrega-toggle-section').style.display = '';
    document.getElementById('pago-section').style.display = '';
    document.getElementById('acomp-section').style.display = '';
    document.getElementById('personas-section').style.display = 'none';
    document.getElementById('btn-enviar-pedido').style.display = '';
    document.getElementById('btn-crear-reserva').style.display = 'none';
    document.querySelectorAll('.sede-toggle .sede-btn').forEach(btn => { btn.disabled = false; });
}

function limpiarFormularioCheckout() {
    document.getElementById('clienteNombre').value = '';
    const telInput = document.getElementById('clienteTelefono');
    telInput.value = '';
    telInput.style.borderColor = '';
    telInput.style.outlineColor = '';
    document.getElementById('clienteDireccion').value = '';
    document.getElementById('barrioInput').value = '';
    document.getElementById('observaciones').value = '';
    document.getElementById('fechaReserva').value = '';
    document.getElementById('horaReserva').value = '';
    document.getElementById('cantidadPersonas').value = '';
    document.getElementById('hora-reserva-grid').innerHTML = '';

    document.querySelectorAll('.sede-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.canal-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.entrega-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pago-btn').forEach(b => b.classList.remove('active'));
    _toppingsCC = new Set();
    document.querySelectorAll('#acomp-pills .acomp-pill').forEach(p => p.classList.remove('active'));
    document.getElementById('direccion-section').style.display = 'none';
    document.getElementById('domicilio-precio').textContent = '';
    const _dc = document.getElementById('dir-chips');
    if (_dc) { _dc.innerHTML = ''; _dc.style.display = 'none'; }

    _restaurarModoNormal();
}

//Cerramos el modal al hacer click por fuera de él.
function cerrarCheckout() {
    const modal = document.getElementById('modal-checkout');
    if (modal) {
        modal.style.display = 'none';
    }
}
// ── Normalización del teléfono ──────────────────────────────────────────────
// Extrae el primer número colombiano válido (3 + 9 dígitos) de cualquier string.
// Funciona con: 573183312050 / 53183312050 / +57 318-331 2050 / 3183312050
function normalizarTelefono(raw) {
    const digits = String(raw).replace(/\D/g, '');
    const match  = digits.match(/3\d{9}/);
    return match ? match[0] : null;
}

document.getElementById('clienteTelefono').addEventListener('input', function () {
    // Solo dígitos, máx 12 caracteres (prefijo + número)
    this.value = this.value.replace(/\D/g, '').slice(0, 12);

    const norm  = normalizarTelefono(this.value);
    const vacio = this.value.length === 0;
    this.style.borderColor  = vacio ? '' : norm ? 'var(--color-primario)' : '#e53e3e';
    this.style.outlineColor = vacio ? '' : norm ? 'var(--color-primario)' : '#e53e3e';
});

// Solo cerramos si el mousedown Y el click terminaron sobre el overlay (no al arrastrar desde un input)
let _checkoutMousedownTarget = null;
const _modalCheckout = document.getElementById('modal-checkout');
_modalCheckout.addEventListener('mousedown', (e) => { _checkoutMousedownTarget = e.target; });
_modalCheckout.addEventListener('click', (e) => {
    if (e.target === _modalCheckout && _checkoutMousedownTarget === _modalCheckout) {
        if (_modoReserva) {
            limpiarFormularioCheckout();
            _modoReserva = false;
        }
        cerrarCheckout();
    }
    _checkoutMousedownTarget = null;
});



//función para realizar el proceso del pago y capturar toda la información necesaria.
// Agregamos 'async' para poder esperar la respuesta de Firebase
async function procesarPedidoFinal() {
    const datos = {
        telefono: document.getElementById('clienteTelefono').value,
        nombre: document.getElementById('clienteNombre').value,
        direccion: document.getElementById('clienteDireccion').value,
        pago: document.querySelector('.pago-btn.active')?.dataset.pago || '',
        obs: document.getElementById('observaciones').value.trim(),
        acompanamientos: _toppingsCC.size ? [..._toppingsCC].join(', ') : null,
        sede: document.querySelector('.sede-btn.active')?.dataset.sede || '',
        canal: document.querySelector('.canal-btn.active')?.dataset.canal || '',
        productos: carrito
            .filter(item => !item.pizzaId && !item.esObsequio3x2)
            .map(item => {
                const prod = { nombre: item.nombre, precio: item.precio, qty: item.qty };
                if (item.obs?.trim()) prod.obs = item.obs.trim();
                const adiciones = carrito
                    .filter(a => a.pizzaId === item.id)
                    .map(a => ({ nombre: a.nombre, precio: a.precio, qty: a.qty }));
                if (adiciones.length > 0) prod.adiciones = adiciones;
                return prod;
            }),
        total: carrito.reduce((sum, item) => sum + item.precio * item.qty, 0),
        impreso: false
    };

    // Anteponer etiqueta de promo si hay una en el carrito
    if (carrito.some(i => i.esPromo3x2)) {
        const label = localStorage.getItem('dp_promo3x2_obs') || 'PROMO 3X2';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    } else if (carrito.some(i => i.esPromo65k)) {
        const label = localStorage.getItem('dp_promo65k_obs') || 'PROMO 65K';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    } else if (carrito.some(i => i.esPromoLasEsp)) {
        const label = localStorage.getItem('dp_promoLasEsp_obs') || 'PROMO 48K';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    } else if (carrito.some(i => i.esPromoPepperoni)) {
        const label = 'PROMO PEPPERONI 28K';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    } else if (carrito.some(i => i.esPromoKit)) {
        const label = localStorage.getItem('dp_promoKit_obs') || 'KIT PIZZERITOS 25K';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    } else if (carrito.some(i => i.esPromoBerrionda)) {
        const label = 'PROMO BERRIONDA 35K';
        datos.obs = datos.obs.trim() ? `${label} — ${datos.obs.trim()}` : label;
    }

    // Domicilio (no suma al total)
    const tipoEntrega = document.querySelector('.entrega-btn.active')?.dataset.tipo || '';
    if (tipoEntrega === 'recoger') {
        datos.domicilio = { tipo: 'recoger', valor: 0 };
    } else {
        const barrioVal = document.getElementById('barrioInput')?.value?.trim() || '';
        if (barrioVal && window.domicilios) {
            const valorDom = window.domicilios[datos.sede]?.[barrioVal] || 0;
            datos.domicilio = { barrio: barrioVal, valor: valorDom };
        }
    }

    // Validación
    if (!datos.canal) return alert("⚠️ Selecciona el canal (WhatsApp o IVR).");
    if (!datos.sede) return alert("⚠️ Selecciona una sede antes de enviar.");
    if (!tipoEntrega) return alert("⚠️ Selecciona el tipo de entrega (Domicilio o Recoger en tienda).");
    if (!datos.pago) return alert("⚠️ Selecciona el método de pago.");
    if (!datos.nombre) return alert("⚠️ El nombre del cliente es obligatorio.");
    const telNorm = normalizarTelefono(datos.telefono);
    if (!telNorm) return alert("⚠️ Por favor validar el número de teléfono.");
    datos.telefono = telNorm;
    const esDomicilio = tipoEntrega !== 'recoger';
    if (esDomicilio && !datos.direccion) {
        return alert("⚠️ Ingresa la dirección del cliente.");
    }
    const barrioVisible = document.getElementById('barrio-field')?.style.display !== 'none';
    const barrioVal     = document.getElementById('barrioInput')?.value?.trim() || '';
    if (esDomicilio && barrioVisible && !barrioVal) {
        return alert("⚠️ Selecciona el barrio para calcular el domicilio.");
    }

    window.mostrarOverlay?.('Enviando pedido...');
    try {
        const pedidoId = await window.enviarAFirebase(datos);
        console.log("Pedido guardado con éxito. ID:", pedidoId);

        cerrarCheckout();
        limpiarFormularioCheckout();
        carrito = [];
        localStorage.removeItem('dp_promo65k_obs');
        localStorage.removeItem('dp_promo3x2_obs');
        localStorage.removeItem('dp_promoLasEsp_obs');
        localStorage.removeItem('dp_promoPepperoni_obs');
        localStorage.removeItem('dp_promoKit_obs');
        actualizarComanda();

        const asesor = window.asesorActual || 'Asesor';
        const sede   = datos.sede.charAt(0).toUpperCase() + datos.sede.slice(1).toLowerCase();
        window.ocultarOverlay?.(true, { asesor, pedidoId, sede });

    } catch (error) {
        console.error("Error:", error);
        window.ocultarOverlay?.(false);
        alert("Hubo un error al enviar el pedido.");
    }
}

// Ahora recibe el 'pedidoId' de Firebase
function confirmarImpresion(datos, pedidoId) {
    const container = document.getElementById('orderItems');
    
    // 1. Evitar duplicados
    const seccionesPrevias = container.querySelectorAll('.info-cliente-ticket');
    seccionesPrevias.forEach(s => s.remove());

    // 2. Usamos los últimos 5 caracteres del ID de Firebase como número de pedido
    // Esto es mucho más profesional que un número aleatorio
    const nPedido = pedidoId;

    // 3. Crear el HTML (He actualizado el nombre a MOLLE PIZZA si es el caso)
    const infoHtml = `
        <div class="info-cliente-ticket" style="font-family: 'Courier New', monospace; color: black;">
            <h2 style="text-align:center; margin:0; font-size: 16pt;">DRIVE PIZZA</h2>
            <p style="text-align:center; margin:5px 0; font-size: 12pt;">${datos.sede.toUpperCase()}</p>
            
            <div style="border: 3px solid black; text-align: center; padding: 10px; margin: 10px 0;">
                <span style="display: block; font-size: 14pt; font-weight: bold;">PEDIDO N°</span>
                <span style="display: block; font-size: 32pt; font-weight: 900;">#${nPedido}</span>
            </div>

            <div style="border-top: 1px dashed black; margin: 10px 0;"></div>
            
            <p style="margin: 4px 0;"><strong>CLIENTE:</strong> ${datos.nombre}</p>
            <p style="margin: 4px 0;"><strong>TEL:</strong> ${datos.telefono}</p>
            <p style="margin: 4px 0;"><strong>DIR:</strong> ${datos.direccion}</p>
            <p style="margin: 4px 0;"><strong>PAGO:</strong> ${datos.pago}</p>
            ${datos.obs ? `<p style="margin: 4px 0;"><strong>OBS:</strong> ${datos.obs}</p>` : ''}
            
            <div style="border-top: 1px solid black; margin: 10px 0;"></div>
            <p style="text-align:center; font-weight:bold; margin-bottom: 10px;">DETALLE DEL PEDIDO</p>
        </div>
    `;
    
    container.insertAdjacentHTML('afterbegin', infoHtml);
    alert(`Pedido #${pedidoId} enviado correctamente a la sede ${datos.sede.toUpperCase()}`);
    carrito = [];
    actualizarComanda();
}
// ── MODAL DE ADICIONES / BORDES VINCULADO A UNA PIZZA ────────────
function abrirAdicionesModal(itemId, tamanoRaw) {
    const itemPadre = carrito.find(i => i.id === itemId);
    if (!itemPadre) return;

    const modal        = document.getElementById('modal-seleccion');
    const titulo       = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    const modalContent = modal.querySelector('.modal-content');

    titulo.innerHTML = `⊕ Adición<br>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">${itemPadre.nombre}</small>`;
    modalContent.classList.add('modal-sabor2');
    gridOpciones.className = 'opciones-grid opciones-adiciones';

    // Los bordes solo aplican a pizzas no estofadas (no tienen precio "Porción")
    const adiciones = (menuData["Adiciones"] || []).filter(a => a.opciones[tamanoRaw] !== undefined);
    const bordes    = itemPadre.esEstofada
        ? []
        : (menuData["Bordes"] || []).filter(b => b.opciones[tamanoRaw] !== undefined);

    if (adiciones.length === 0 && bordes.length === 0) {
        gridOpciones.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay adiciones disponibles para este tamaño.</p>';
        modal.style.display = 'flex';
        return;
    }

    const renderBtn = (prod) => `
        <button class="btn-adicion" data-nombre="${prod.nombre}" data-precio="${prod.opciones[tamanoRaw]}">
            <span class="adicion-nombre">${prod.nombre}</span>
            <span class="adicion-precio">$${prod.opciones[tamanoRaw].toLocaleString()}</span>
            <span class="adicion-badge" style="display:none;">0</span>
        </button>`;

    gridOpciones.innerHTML = `
        <div class="adicion-section-title">Adiciones</div>
        ${adiciones.map(renderBtn).join('')}
        ${bordes.length > 0 ? `<div class="adicion-section-title">Bordes</div>${bordes.map(renderBtn).join('')}` : ''}
        <button class="btn-listo-adiciones" onclick="cerrarModal()">✓ Listo</button>
    `;

    gridOpciones.querySelectorAll('.btn-adicion').forEach(btn => {
        btn.addEventListener('click', () => {
            carrito.push({
                id: Date.now(),
                nombre: `${btn.dataset.nombre} (${tamanoRaw})`,
                precio: Number(btn.dataset.precio),
                qty: 1,
                pizzaId: itemId
            });
            // Feedback visual: incrementar badge sin cerrar
            const badge = btn.querySelector('.adicion-badge');
            const count = (parseInt(badge.textContent) || 0) + 1;
            badge.textContent = count;
            badge.style.display = 'inline-block';
            btn.classList.add('adicion-agregada');
            actualizarComanda();
        });
    });

    modal.style.display = 'flex';
}

// ── CONSULTA DE DOMICILIOS ────────────────────────────────────────────────
let _consultaSede = null;

document.getElementById('btn-consulta-domicilio').addEventListener('click', () => {
    document.getElementById('modal-domicilios').style.display = 'flex';
    document.getElementById('domicilio-buscador').value = '';
    document.getElementById('domicilio-resultados').innerHTML =
        '<p style="text-align:center;color:#aaa;padding:20px;margin:0;">Selecciona una sede para comenzar</p>';
    _consultaSede = null;
    document.querySelectorAll('#domicilio-sede-toggle .sede-btn').forEach(b => b.classList.remove('active'));
});

document.getElementById('domicilio-sede-toggle').addEventListener('click', async e => {
    const btn = e.target.closest('.sede-btn');
    if (!btn) return;
    document.querySelectorAll('#domicilio-sede-toggle .sede-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _consultaSede = btn.dataset.sede;

    // Siempre recargar por sede (evita límite 1000 filas de cargarTodosBarrios)
    if (typeof window.cargarBarriosSede === 'function') {
        document.getElementById('domicilio-resultados').innerHTML =
            '<p style="text-align:center;color:#aaa;padding:20px;margin:0;">Cargando...</p>';
        try {
            const data = await window.cargarBarriosSede(_consultaSede);
            if (!window.domicilios) window.domicilios = {};
            window.domicilios[_consultaSede] = Object.fromEntries(data.map(r => [r.barrio, r.valor]));
        } catch {}
    }
    filtrarConsultaDomicilio();
    document.getElementById('domicilio-buscador').focus();
});

window.filtrarConsultaDomicilio = function() {
    const contenedor = document.getElementById('domicilio-resultados');
    if (!_consultaSede) return;

    const q       = document.getElementById('domicilio-buscador').value.toLowerCase().trim();
    const barrios = window.domicilios?.[_consultaSede] || {};
    const entradas = Object.entries(barrios).filter(([nombre]) =>
        !q || nombre.toLowerCase().includes(q)
    );

    if (entradas.length === 0) {
        contenedor.innerHTML = `
            <p style="text-align:center;padding:20px;margin:0;color:#e74c3c;font-weight:600;">
                ⚠️ Barrio no encontrado — verificar con la pizzería valor domi
            </p>`;
        return;
    }

    contenedor.innerHTML = entradas.map(([nombre, valor]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 14px;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:14px;">${nombre}</span>
            <span style="font-weight:700;color:#27ae60;white-space:nowrap;margin-left:12px;">
                $${valor.toLocaleString('es-CO')}
            </span>
        </div>
    `).join('');
};

window.cerrarConsultaDomicilio = function() {
    document.getElementById('modal-domicilios').style.display = 'none';
};

document.getElementById('modal-domicilios').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-domicilios')) cerrarConsultaDomicilio();
});

// ── PROMO 65K ──────────────────────────────────────────────────────────────
let _promo65kState = null;

window.abrirPromo65k = function () {
    _promo65kState = { step: 1, pizza: null, mezcla: false, sabor1: null, tipo: null };
    _p65kAbrirModal();
};

function _p65kAbrirModal() {
    const modal        = document.getElementById('modal-seleccion');
    const titulo       = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    modal.querySelector('.modal-content').classList.add('modal-sabor2');

    const stepBar = (activo) => `
        <span style="color:${activo === 1 ? 'var(--color-primario)' : '#555'};font-weight:${activo === 1 ? '900' : 'normal'};">1. Pizza Grande</span>
        <span style="color:#ddd;margin:0 5px;">›</span>
        <span style="color:${activo === 2 ? 'var(--color-primario)' : '#ccc'};font-weight:${activo === 2 ? '900' : 'normal'};">2. Gaseosa 1.5 lts</span>`;

    if (_promo65kState.step === 1) {
        titulo.innerHTML = `
            <div style="font-size:1.15rem;margin-bottom:6px;">${stepBar(1)}</div>
            <small id="p65k-subtitulo" style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el sabor de la pizza</small>`;

        gridOpciones.className = 'opciones-grid opciones-sabores';
        gridOpciones.innerHTML = `
            <div class="busqueda-sabor2-wrapper p65k-search-row">
                <input type="text" id="buscar-p65k"
                    placeholder="🔍 Buscar pizza..."
                    oninput="_p65kFiltrarPizzas(this.value)"
                    autocomplete="off">
                <button id="btn-p65k-mezcla" class="btn-mitad btn-mitad--p65k" onclick="_p65kToggleMezcla()" title="Combinar ½+½">
                    <span class="btn-mitad-disc"></span>
                </button>
            </div>
            <div id="p65k-pizza-grid" class="sabores2-grid"></div>`;

        _p65kRenderPizzas('');
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('buscar-p65k')?.focus(), 100);

    } else {
        titulo.innerHTML = `
            <div style="font-size:1.15rem;margin-bottom:6px;">${stepBar(2)}</div>
            <small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el sabor de la gaseosa · Pizza <strong>${_promo65kState.pizza}</strong></small>`;

        const sabores = Object.keys(preciosBebidas.gaseosa1500ml);
        gridOpciones.className = 'opciones-grid';
        gridOpciones.innerHTML = sabores.map(s =>
            `<button class="btn-tamano" onclick="_p65kSelGaseosa('${s}')">${s}</button>`
        ).join('');
        modal.style.display = 'flex';
    }
}

function _p65kRenderPizzas(q) {
    const clasicas = (menuData["Pizzas Clásicas"] || []).map(p => ({ nombre: p.nombre, tipo: 'Clásica' }));
    const tipicas  = (menuData["Pizzas Típicas"]  || []).map(p => ({ nombre: p.nombre, tipo: 'Típica' }));
    let todas = [...clasicas, ...tipicas];

    // En modo mezcla con sabor1 ya elegido: excluir solo el sabor ya elegido
    if (_promo65kState.mezcla && _promo65kState.sabor1) {
        todas = todas.filter(p => p.nombre !== _promo65kState.sabor1);
    }

    const filtradas = q ? todas.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())) : todas;
    const grid = document.getElementById('p65k-pizza-grid');
    if (!grid) return;

    // Actualizar subtítulo
    const sub = document.getElementById('p65k-subtitulo');
    if (sub) {
        if (_promo65kState.mezcla && _promo65kState.sabor1) {
            sub.textContent = 'Elige la segunda mitad de la pizza';
        } else if (_promo65kState.mezcla) {
            sub.textContent = 'Elige la primera mitad de la pizza';
        } else {
            sub.textContent = 'Elige el sabor de la pizza';
        }
    }

    // Estado visual del botón combinar
    const btnMezcla = document.getElementById('btn-p65k-mezcla');
    if (btnMezcla) btnMezcla.classList.toggle('activo', _promo65kState.mezcla);

    // Banner primera mitad ya elegida
    let bannerHTML = '';
    if (_promo65kState.mezcla && _promo65kState.sabor1) {
        bannerHTML = `<div class="p65k-sabor1-banner">
            <span class="p65k-sabor1-texto">½ <strong>${_promo65kState.sabor1}</strong> + ½ …</span>
            <button class="p65k-sabor1-quitar" onclick="_p65kQuitarSabor1()">✕ Cambiar</button>
        </div>`;
    }

    grid.innerHTML = bannerHTML + (filtradas.length === 0
        ? '<p style="text-align:center;color:#999;padding:20px;">No se encontraron pizzas.</p>'
        : filtradas.map(p => `
            <button class="btn-sabor2" onclick="_p65kSelPizza('${p.nombre.replace(/'/g, "\\'")}', '${p.tipo}')">
                <span class="sabor2-nombre">${p.nombre}</span>
                <span class="sabor2-precio">${p.tipo}</span>
            </button>`).join(''));
}

window._p65kFiltrarPizzas = function (q) { _p65kRenderPizzas(q); };

window._p65kToggleMezcla = function () {
    _promo65kState.mezcla = !_promo65kState.mezcla;
    _promo65kState.sabor1 = null;
    _promo65kState.tipo   = null;
    const inp = document.getElementById('buscar-p65k');
    if (inp) inp.value = '';
    _p65kRenderPizzas('');
};

window._p65kQuitarSabor1 = function () {
    _promo65kState.sabor1 = null;
    _promo65kState.tipo   = null;
    const inp = document.getElementById('buscar-p65k');
    if (inp) inp.value = '';
    _p65kRenderPizzas('');
};

window._p65kSelPizza = function (sabor, tipo) {
    if (_promo65kState.mezcla) {
        if (!_promo65kState.sabor1) {
            // Primera mitad elegida — filtrar grid a mismo tipo
            _promo65kState.sabor1 = sabor;
            _promo65kState.tipo   = tipo;
            const inp = document.getElementById('buscar-p65k');
            if (inp) inp.value = '';
            _p65kRenderPizzas('');
        } else {
            // Segunda mitad elegida → combinar y avanzar
            _promo65kState.pizza = `${_promo65kState.sabor1} y mitad ${sabor}`;
            _promo65kState.step  = 2;
            _p65kAbrirModal();
        }
    } else {
        _promo65kState.pizza = sabor;
        _promo65kState.step  = 2;
        _p65kAbrirModal();
    }
};

window._p65kSelGaseosa = function (sabor) {
    const now = Date.now();
    carrito.push({
        id: now,
        nombre: `Pizza Grande ${_promo65kState.pizza}`,
        precio: 65000,
        qty: 1,
        esPromo65k: true,
        promoId65k: now
    });
    carrito.push({
        id: now + 1,
        nombre: `Gaseosa 1.5 lts ${sabor}`,
        precio: 0,
        qty: 1,
        esPromo65k: true,
        esGaseosa65k: true,
        promoId65k: now
    });
    localStorage.setItem('dp_promo65k_obs', 'PROMO 65K');
    _aplicarFiltroSedes();
    cerrarModal();
    actualizarComanda();
};

// ── PROMO 3×2 ──────────────────────────────────────────────────────────────

function getProductosPromo3x2() {
    const grupos = {};

    // Pizzas (sin Pizzetas Premium)
    const llavesPizzas = ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Especiales", "Pizzas Clásicas", "Pizzas Típicas"];
    grupos["Pizzas"] = [];
    llavesPizzas.forEach(key => {
        (menuData[key] || []).forEach(p => grupos["Pizzas"].push({ ...p, esPizza: true, categoriaPromo: "Pizzas" }));
    });

    // Calzones (clásicos + especiales, derivados de sabores de pizza)
    grupos["Calzones"] = [];
    (menuData["Pizzas Clásicas"] || []).forEach(p => grupos["Calzones"].push({
        ...p, nombre: `Calzone ${p.nombre}`, opciones: preciosCalzones.calzoneClasico, categoriaPromo: "Calzones"
    }));
    ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Típicas", "Pizzas Especiales"].forEach(key => {
        (menuData[key] || []).forEach(p => grupos["Calzones"].push({
            ...p, nombre: `Calzone ${p.nombre}`, opciones: preciosCalzones.calzoneEspecial, categoriaPromo: "Calzones"
        }));
    });

    // Stromboli (clásico + especial, derivados de sabores de pizza)
    grupos["Stromboli"] = [];
    (menuData["Pizzas Clásicas"] || []).forEach(p => grupos["Stromboli"].push({
        ...p, nombre: `Stromboli ${p.nombre}`, opciones: preciosStromboli.stromboliClasico, categoriaPromo: "Stromboli"
    }));
    ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Típicas", "Pizzas Especiales"].forEach(key => {
        (menuData[key] || []).forEach(p => grupos["Stromboli"].push({
            ...p, nombre: `Stromboli ${p.nombre}`, opciones: preciosStromboli.stromboliEspecial, categoriaPromo: "Stromboli"
        }));
    });

    // Categorías directas de menuData
    grupos["Lasañas"]     = (menuData["Lasañas"]     || []).map(p => ({ ...p, categoriaPromo: "Lasañas" }));
    grupos["Pastas"]      = (menuData["Pastas"]      || []).map(p => ({ ...p, categoriaPromo: "Pastas" }));
    grupos["Maicitos"]    = (menuData["Maicitos"]    || []).map(p => ({ ...p, categoriaPromo: "Maicitos" }));
    grupos["Hamburguesas"]= (menuData["Hamburguesas"]|| []).map(p => ({ ...p, categoriaPromo: "Hamburguesas" }));
    grupos["Sandwiches"]  = (menuData["Sandwiches"]  || []).map(p => ({ ...p, categoriaPromo: "Sandwiches" }));
    grupos["Ensaladas"]   = (menuData["Ensaladas"]   || []).map(p => ({ ...p, categoriaPromo: "Ensaladas" }));

    return grupos;
}

let _promo3x2State = null;

function abrirPromo3x2() {
    //if (new Date().getDay() !== 2) return;
    _promo3x2State = { step: 0 };
    _promo3x2AbrirModal();
}

// Productos permitidos como obsequio por categoría en la promo 3x2
const PROMO3X2_OBSEQUIO_PIZZAS    = ["Hawaiana", "Tres Carnes"];
const PROMO3X2_OBSEQUIO_ENSALADAS = ["Ensalada Cesar"];
const PROMO3X2_OBSEQUIO_LASAÑAS   = ["Lasaña Sencilla"];
const PROMO3X2_OBSEQUIO_CALZONES  = ["Calzone Hawaiana", "Calzone Tres Carnes"];
const PROMO3X2_PASTAS_EXCLUIDAS        = ["Pasta Carbonara", "Pasta Pesto Camaron", "Pasta Matriziana", "Pasta Marinera"];
const PROMO3X2_OBSEQUIO_PASTAS         = ["Pasta Spaguetti Sencillo"];
const PROMO3X2_OBSEQUIO_HAMBURGUESAS   = ["hamburguesa Clasica"];
const PROMO3X2_OBSEQUIO_SANDWICHES     = ["Sandwiche Jamon"];

function _promo3x2GetFlat(tamanoFijo, soloCategoria) {
    const esObsequio = _promo3x2State?.step === 3;
    let todos = [];
    Object.entries(getProductosPromo3x2()).forEach(([cat, prods]) => {
        if (soloCategoria && cat !== soloCategoria) return;
        // Ignorar filtro de tamaño cuando las variantes son incompatibles entre tipos
        const ignorarTamano = cat === "Lasañas" || cat === "Pastas" || cat === "Hamburguesas" || cat === "Sandwiches";
        let filtrados = (tamanoFijo && !ignorarTamano) ? prods.filter(p => p.opciones?.[tamanoFijo] !== undefined) : prods;
        // Restricciones de obsequio por categoría
        if (esObsequio && cat === "Pizzas")    filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_PIZZAS.includes(p.nombre));
        if (esObsequio && cat === "Ensaladas") filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_ENSALADAS.includes(p.nombre));
        if (esObsequio && cat === "Lasañas")   filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_LASAÑAS.includes(p.nombre));
        if (esObsequio && cat === "Calzones")  filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_CALZONES.includes(p.nombre));
        if (cat === "Pastas") {
            filtrados = filtrados.filter(p => !PROMO3X2_PASTAS_EXCLUIDAS.includes(p.nombre));
            const prod1Nombre = (_promo3x2State?.prod1?.nombre || '').toLowerCase();
            const esFetuccine  = prod1Nombre.includes('fetuccine');
            const esSpaguetti  = prod1Nombre.includes('spaguetti');
            const esMacaroni   = prod1Nombre.includes('macaroni');
            const esP2 = _promo3x2State?.step === 2;
            if (esP2 && esFetuccine)  filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes('fetuccine'));
            if (esP2 && esSpaguetti)  filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes('spaguetti'));
            if (esP2 && esMacaroni)   filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes('macaroni'));
            if (esObsequio && esFetuccine)  filtrados = filtrados.filter(p => p.nombre === "Fetuccine sencillo");
            if (esObsequio && esMacaroni)   filtrados = filtrados.filter(p => p.nombre === "Pasta Macaroni");
            if (esObsequio && !esFetuccine && !esMacaroni) filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_PASTAS.includes(p.nombre));
        }
        if (esObsequio && cat === "Hamburguesas")   filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_HAMBURGUESAS.includes(p.nombre));
        if (esObsequio && cat === "Sandwiches")     filtrados = filtrados.filter(p => PROMO3X2_OBSEQUIO_SANDWICHES.includes(p.nombre));
        todos = [...todos, ...filtrados];
    });
    return todos;
}

function _promo3x2AbrirModal() {
    const state = _promo3x2State;
    const modal = document.getElementById('modal-seleccion');
    const titulo = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    modal.querySelector('.modal-content').classList.add('modal-sabor2');

    // ── PASO 0: selección de categoría ──────────────────────────
    if (state.step === 0) {
        titulo.innerHTML = `3×2 Martes<br><small style="font-size:1.3rem;color:#666;font-weight:normal;">Selecciona la categoría para empezar</small>`;
        gridOpciones.className = 'opciones-grid promo-cat-grid';
        gridOpciones.innerHTML = ['Pizzas', 'Calzones', 'Lasañas', 'Pastas', 'Maicitos', 'Hamburguesas', 'Stromboli', 'Sandwiches', 'Ensaladas'].map(cat => `
            <button class="btn-tamano promo-cat-btn" data-cat="${cat}">
                <strong>${cat}</strong>
            </button>
        `).join('');
        gridOpciones.querySelectorAll('.promo-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.categoriaSeleccionada = btn.dataset.cat;
                state.step = 1;
                _promo3x2AbrirModal();
            });
        });
        modal.style.display = 'flex';
        return;
    }

    // ── PASOS 1-3: búsqueda + grid ───────────────────────────────
    const stepLabels = ['1. Producto 1', '2. Producto 2', '3. Obsequio 🎁'];
    const stepBar = stepLabels.map((lbl, i) => {
        const n = i + 1;
        const color = n === state.step ? 'var(--color-primario)' : n < state.step ? '#555' : '#ccc';
        const weight = n === state.step ? '900' : 'normal';
        return `<span style="color:${color};font-weight:${weight};">${lbl}</span>`;
    }).join(`<span style="color:#ddd;margin:0 5px;">›</span>`);

    const subtitulo = state.step === 2
        ? `<small style="font-size:1.3rem;color:#666;font-weight:normal;">Selecciona el segundo producto de la promo · Mismo tamaño: <strong>${state.prod1?.tamano}</strong></small>`
        : state.step === 3
        ? `<small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el producto de obsequio 🎁</small>`
        : `<small style="font-size:1.3rem;color:#666;font-weight:normal;">${state.categoriaSeleccionada} · Elige el primer producto de la promo</small>`;

    titulo.innerHTML = `
        <div style="font-size:1.15rem;margin-bottom:6px;">${stepBar}</div>
        ${subtitulo}
    `;

    gridOpciones.className = 'opciones-grid opciones-sabores';

    const tamanoFijo = state.prod1?.tamano || null;
    const soloCategoria = state.prod1?.categoriaPromo || state.categoriaSeleccionada;
    const todos = _promo3x2GetFlat(tamanoFijo, soloCategoria);

    gridOpciones.innerHTML = `
        <div class="busqueda-sabor2-wrapper">
            <input type="text" id="buscar-promo"
                   placeholder="🔍 Buscar producto..."
                   oninput="_promo3x2Filtrar(this.value)"
                   autocomplete="off">
        </div>
        <div id="promo-grid" class="sabores2-grid"></div>
    `;

    _promo3x2RenderGrid(todos);
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('buscar-promo')?.focus(), 100);
}

function _promo3x2Filtrar(q) {
    if (!_promo3x2State) return;
    const tamanoFijo = _promo3x2State.prod1?.tamano || null;
    const soloCategoria = _promo3x2State.prod1?.categoriaPromo || _promo3x2State.categoriaSeleccionada;
    const todos = _promo3x2GetFlat(tamanoFijo, soloCategoria);
    _promo3x2RenderGrid(q ? todos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase())) : todos);
}

function _promo3x2RenderGrid(productos) {
    const grid = document.getElementById('promo-grid');
    if (!grid || !_promo3x2State) return;
    const state = _promo3x2State;
    const tamanoFijo = state.prod1?.tamano;
    const esPizzaStep2 = state.step === 2 && state.prod1?.categoriaPromo === 'Pizzas' && TAMANOS_MIXABLES.has(tamanoFijo);

    grid.className = esPizzaStep2 ? 'opciones-pizza' : 'sabores2-grid';

    if (productos.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No se encontraron productos.</p>';
        return;
    }

    grid.innerHTML = productos.map(p => {
        const precios = Object.values(p.opciones || {});
        const precioFijo = tamanoFijo ? p.opciones[tamanoFijo] : undefined;
        const precioTexto = precioFijo !== undefined
            ? `$${precioFijo.toLocaleString()}`
            : precios.length > 1
                ? `$${Math.min(...precios).toLocaleString()}+`
                : `$${(precios[0] ?? 0).toLocaleString()}`;
        if (esPizzaStep2) {
            return `
                <div class="tamano-fila">
                    <button class="btn-sabor2 btn-solo p3x2-sel-btn" data-nombre="${p.nombre}" data-cat="${p.categoriaPromo}">
                        <span class="sabor2-nombre">${p.nombre}</span>
                        <span class="sabor2-precio">${precioTexto}</span>
                    </button>
                    <button class="btn-mitad p3x2-disc-step2" data-nombre="${p.nombre}" data-cat="${p.categoriaPromo}" title="Combinar ½+½">
                        <span class="btn-mitad-disc"></span>
                    </button>
                </div>`;
        }
        return `
            <button class="btn-sabor2 p3x2-sel-btn" data-nombre="${p.nombre}" data-cat="${p.categoriaPromo}">
                <span class="sabor2-nombre">${p.nombre}</span>
                <span class="sabor2-precio">${precioTexto}</span>
            </button>`;
    }).join('');

    grid.querySelectorAll('.p3x2-sel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const producto = getProductosPromo3x2()[btn.dataset.cat]?.find(p => p.nombre === btn.dataset.nombre);
            if (producto) _promo3x2ClickProducto(producto);
        });
    });

    grid.querySelectorAll('.p3x2-disc-step2').forEach(btn => {
        btn.addEventListener('click', () => {
            const producto = getProductosPromo3x2()[btn.dataset.cat]?.find(p => p.nombre === btn.dataset.nombre);
            if (producto) _promo3x2MostrarSegundoSabor(producto, tamanoFijo);
        });
    });
}

function _promo3x2ClickProducto(producto) {
    const state = _promo3x2State;
    const tamanoFijo = state.prod1?.tamano;

    // Categorías donde siempre se muestra el picker (opciones son variantes, no tamaños compartidos)
    const siemprePicker = ["Hamburguesas"].includes(producto.categoriaPromo);

    // Pasos 2 y 3: tamaño ya fijo y el producto lo tiene → confirmar directo (excepto siemprePicker)
    if (tamanoFijo && !siemprePicker && producto.opciones?.[tamanoFijo] !== undefined) {
        _promo3x2ConfirmarItem(producto, tamanoFijo, producto.opciones[tamanoFijo]);
        return;
    }

    // Paso 1: producto con una sola opción → confirmar directo
    const opciones = Object.keys(producto.opciones || {});
    if (opciones.length === 1) {
        _promo3x2ConfirmarItem(producto, opciones[0], producto.opciones[opciones[0]]);
        return;
    }

    // Paso 1: producto con múltiples tamaños → mostrar selector con disc para mix
    document.getElementById('modal-titulo').innerHTML = `
        <div style="font-size:1.15rem;margin-bottom:6px;color:#aaa;">3×2 Martes — Producto ${state.step}</div>
        ${producto.nombre}<br>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el tamaño</small>
    `;
    const gridOpciones = document.getElementById('opciones-tamano');
    gridOpciones.className = 'opciones-grid opciones-pizza';
    gridOpciones.innerHTML = opciones.map(tam => {
        const mixable = TAMANOS_MIXABLES.has(tam);
        return `
            <div class="tamano-fila">
                <button class="btn-tamano btn-solo p3x2-tam-btn" data-tam="${tam}" data-pre="${producto.opciones[tam]}">
                    ${tam}<br><strong>$${producto.opciones[tam].toLocaleString()}</strong>
                </button>
                ${mixable
                    ? `<button class="btn-mitad p3x2-disc-btn" data-tam="${tam}" data-pre="${producto.opciones[tam]}" title="Combinar ½+½"><span class="btn-mitad-disc"></span></button>`
                    : `<div class="btn-mitad-placeholder"></div>`}
            </div>`;
    }).join('');

    gridOpciones.querySelectorAll('.p3x2-tam-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _promo3x2ConfirmarItem(producto, btn.dataset.tam, Number(btn.dataset.pre));
        });
    });
    gridOpciones.querySelectorAll('.p3x2-disc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _promo3x2MostrarSegundoSabor(producto, btn.dataset.tam);
        });
    });
}

// Segundo sabor (compartido paso 1 y paso 2) — se elige desde el disco
function _promo3x2MostrarSegundoSabor(sabor1Producto, tam) {
    const precio1 = sabor1Producto.opciones[tam];
    document.getElementById('modal-titulo').innerHTML = `
        <div style="font-size:1.15rem;margin-bottom:6px;color:#aaa;">3×2 Martes — Producto ${_promo3x2State.step}</div>
        ½ ${sabor1Producto.nombre}<br>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">${tam} · Elige la 2ª mitad</small>
    `;
    const todas = _promo3x2GetFlat(tam, 'Pizzas').filter(p => p.nombre !== sabor1Producto.nombre);
    const gridOpciones = document.getElementById('opciones-tamano');
    gridOpciones.className = 'opciones-grid opciones-sabores';
    gridOpciones.innerHTML = `
        <div class="busqueda-sabor2-wrapper">
            <input type="text" id="buscar-p3x2-mezcla"
                   placeholder="🔍 Buscar 2ª mitad..."
                   autocomplete="off">
        </div>
        <div id="p3x2-mezcla-grid" class="sabores2-grid"></div>`;

    function renderGrid(pizzas) {
        const grid = document.getElementById('p3x2-mezcla-grid');
        if (!grid) return;
        grid.innerHTML = pizzas.length === 0
            ? '<p style="text-align:center;color:#999;padding:20px;">No se encontraron pizzas.</p>'
            : pizzas.map(p => `
                <button class="btn-sabor2" data-nombre="${p.nombre}" data-precio2="${p.opciones[tam] ?? precio1}">
                    <span class="sabor2-nombre">${p.nombre}</span>
                    <span class="sabor2-precio">$${Math.max(precio1, p.opciones[tam] ?? precio1).toLocaleString()}</span>
                </button>`).join('');
        grid.querySelectorAll('.btn-sabor2').forEach(btn => {
            btn.addEventListener('click', () => {
                const precioFinal = Math.max(precio1, Number(btn.dataset.precio2));
                const productoMix = {
                    nombre: `${sabor1Producto.nombre} y mitad ${btn.dataset.nombre}`,
                    categoriaPromo: 'Pizzas',
                    opciones: { [tam]: precioFinal }
                };
                _promo3x2ConfirmarItem(productoMix, tam, precioFinal);
            });
        });
    }

    document.getElementById('buscar-p3x2-mezcla').addEventListener('input', function () {
        const q = this.value.toLowerCase();
        renderGrid(q ? todas.filter(p => p.nombre.toLowerCase().includes(q)) : todas);
    });

    renderGrid(todas);
    setTimeout(() => document.getElementById('buscar-p3x2-mezcla')?.focus(), 100);
}


function _promo3x2ConfirmarItem(producto, tamano, precio) {
    const state = _promo3x2State;
    const nombreCompleto = `${producto.nombre} (${tamano})`;

    if (state.step === 1) {
        state.prod1 = { nombre: nombreCompleto, tamano, precio, categoriaPromo: producto.categoriaPromo };
        state.step = 2;
        _promo3x2AbrirModal();
    } else if (state.step === 2) {
        state.prod2 = { nombre: nombreCompleto, precio };
        state.step = 3;
        _promo3x2AbrirModal();
    } else {
        cerrarModal();
        const now = Date.now();
        carrito.push({ id: now,     nombre: state.prod1.nombre, precio: state.prod1.precio, qty: 1, esPromo3x2: true, promoId: now, esAdicionable: true, tamanoRaw: state.prod1.tamano });
        carrito.push({ id: now + 1, nombre: state.prod2.nombre, precio: state.prod2.precio, qty: 1, esPromo3x2: true, promoId: now, esAdicionable: true, tamanoRaw: state.prod1.tamano });
        carrito.push({ id: now + 2, nombre: `🎁 OBSEQUIO ${nombreCompleto}`, precio: 0, qty: 1, esPromo3x2: true, esObsequio3x2: true, promoId: now });
        const obsAnterior = localStorage.getItem('dp_promo3x2_obs') || '';
        const nuevoObsequio = `Obsequio ${producto.nombre} (${tamano})`;
        const obsActualizada = obsAnterior 
            ? `${obsAnterior} | ${nuevoObsequio}`
            : `PROMO 3X2 - ${nuevoObsequio}`;
        localStorage.setItem('dp_promo3x2_obs', obsActualizada);
        actualizarComanda();
    }
}

// ── PROMO LASAÑA/ESPAGUETTI 48K ────────────────────────────────────────────

const PROMO_LAS_ESP_EXCLUIDAS_PASTAS = [
    "Pasta Carbonara", "Pasta Alfredo", "Pasta Pesto Camaron",
    "Pasta Matriziana", "Pasta Marinera"
];

const PROMO_LAS_ESP_EXCLUIDAS_LASAÑAS = ["Lasaña Drive", "Lasaña Vegetariana"];

function _promoLasEspGetProductos(categoria) {
    if (categoria === 'Lasañas') {
        return (menuData["Lasañas"] || [])
            .filter(p => !PROMO_LAS_ESP_EXCLUIDAS_LASAÑAS.includes(p.nombre))
            .map(p => ({ ...p, categoriaPromo: 'Lasañas' }));
    }
    // Espaguetti: pastas estándar (sencillo/mixto/remix), sin las premium
    return (menuData["Pastas"] || [])
        .filter(p => !PROMO_LAS_ESP_EXCLUIDAS_PASTAS.includes(p.nombre))
        .map(p => ({ ...p, categoriaPromo: 'Espaguetti' }));
}

let _promoLasEspState = null;

window.abrirPromoLasEsp = function () {
    _promoLasEspState = { step: 0, categoria: null, prod1: null, prod2: null, gaseosa1: null };
    _promoLasEspAbrirModal();
};

function _promoLasEspAbrirModal() {
    const state        = _promoLasEspState;
    const modal        = document.getElementById('modal-seleccion');
    const titulo       = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    modal.querySelector('.modal-content').classList.add('modal-sabor2');

    const stepBar = () => {
        const pasos = ['1. Producto 1', '2. Producto 2', '3. Gaseosa 1', '4. Gaseosa 2'];
        return pasos.map((lbl, i) => {
            const n = i + 1;
            const activo = n === state.step;
            const pasado = n < state.step;
            const color  = activo ? 'var(--color-primario)' : pasado ? '#555' : '#ccc';
            const weight = activo ? '900' : 'normal';
            return `<span style="color:${color};font-weight:${weight};">${lbl}</span>`;
        }).join(`<span style="color:#ddd;margin:0 5px;">›</span>`);
    };

    // ── PASO 0: elegir categoría ─────────────────────────────────
    if (state.step === 0) {
        titulo.innerHTML = `Promo 48K<br><small style="font-size:1.3rem;color:#666;font-weight:normal;">¿Deseas promo de lasaña o de espaguetti?</small>`;
        gridOpciones.className = 'opciones-grid promo-cat-grid';
        gridOpciones.innerHTML = ['Lasañas', 'Espaguetti'].map(cat => `
            <button class="btn-tamano promo-cat-btn" data-cat="${cat}">
                <strong>${cat}</strong>
            </button>
        `).join('');
        gridOpciones.querySelectorAll('.promo-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.categoria = btn.dataset.cat;
                state.step = 1;
                _promoLasEspAbrirModal();
            });
        });
        modal.style.display = 'flex';
        return;
    }

    // ── PASOS 1-4: grid de productos / gaseosas ──────────────────
    const esPasoGaseosa = state.step >= 3;

    if (esPasoGaseosa) {
        const numGas = state.step === 3 ? 1 : 2;
        titulo.innerHTML = `
            <div style="font-size:1.15rem;margin-bottom:6px;">${stepBar()}</div>
            <small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el sabor de la gaseosa ${numGas} · <strong>${state.prod1?.nombre} / ${state.prod2?.nombre}</strong></small>`;

        const sabores = Object.keys(preciosBebidas.gaseosa400ml);
        gridOpciones.className = 'opciones-grid';
        gridOpciones.innerHTML = sabores.map(s =>
            `<button class="btn-tamano" onclick="_promoLasEspSelGaseosa('${s}')">${s}</button>`
        ).join('');
        modal.style.display = 'flex';
        return;
    }

    // Pasos 1 y 2: grid de productos
    const subtitulo = state.step === 1
        ? `${state.categoria} · Elige el primer producto`
        : `${state.categoria} · Elige el segundo producto`;

    titulo.innerHTML = `
        <div style="font-size:1.15rem;margin-bottom:6px;">${stepBar()}</div>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">${subtitulo}</small>`;

    const productos = _promoLasEspGetProductos(state.categoria);
    gridOpciones.className = 'opciones-grid opciones-sabores';
    gridOpciones.innerHTML = `
        <div class="busqueda-sabor2-wrapper">
            <input type="text" id="buscar-las-esp"
                   placeholder="🔍 Buscar producto..."
                   oninput="_promoLasEspFiltrar(this.value)"
                   autocomplete="off">
        </div>
        <div id="las-esp-grid" class="sabores2-grid"></div>`;

    _promoLasEspRenderGrid(productos);
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('buscar-las-esp')?.focus(), 100);
}

window._promoLasEspFiltrar = function (q) {
    if (!_promoLasEspState) return;
    const todos = _promoLasEspGetProductos(_promoLasEspState.categoria);
    _promoLasEspRenderGrid(q
        ? todos.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()))
        : todos);
};

function _promoLasEspRenderGrid(productos) {
    const grid = document.getElementById('las-esp-grid');
    if (!grid || !_promoLasEspState) return;

    if (productos.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No se encontraron productos.</p>';
        return;
    }

    grid.innerHTML = productos.map(p => {
        const precios = Object.values(p.opciones || {});
        const precioTexto = precios.length > 1
            ? `$${Math.min(...precios).toLocaleString()}+`
            : `$${(precios[0] ?? 0).toLocaleString()}`;
        return `<button class="btn-sabor2 las-esp-sel-btn" data-nombre="${p.nombre}" data-cat="${p.categoriaPromo}">
            <span class="sabor2-nombre">${p.nombre}</span>
            <span class="sabor2-precio">${precioTexto}</span>
        </button>`;
    }).join('');

    grid.querySelectorAll('.las-esp-sel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const prod = _promoLasEspGetProductos(_promoLasEspState.categoria)
                .find(p => p.nombre === btn.dataset.nombre);
            if (prod) _promoLasEspClickProducto(prod);
        });
    });
}

function _promoLasEspClickProducto(producto) {
    const opciones = Object.keys(producto.opciones || {});

    // Una sola variante → confirmar directo
    if (opciones.length === 1) {
        _promoLasEspConfirmarProducto(producto, opciones[0], producto.opciones[opciones[0]]);
        return;
    }

    // Varias variantes → mostrar picker de variante
    const titulo = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');
    titulo.innerHTML = `
        <div style="font-size:1.15rem;margin-bottom:6px;color:#aaa;">Promo 48K — Producto ${_promoLasEspState.step}</div>
        ${producto.nombre}<br>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige la proteína que desees</small>`;
    gridOpciones.className = 'opciones-grid opciones-pizza';
    gridOpciones.innerHTML = opciones.map(v =>
        `<button class="btn-tamano las-esp-var-btn" data-var="${v}" data-pre="${producto.opciones[v]}">
            ${v}<br><strong>$${producto.opciones[v].toLocaleString()}</strong>
        </button>`
    ).join('');
    gridOpciones.querySelectorAll('.las-esp-var-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _promoLasEspConfirmarProducto(producto, btn.dataset.var, Number(btn.dataset.pre));
        });
    });
}

function _promoLasEspConfirmarProducto(producto, variante, precio) {
    const state = _promoLasEspState;
    const nombreCompleto = variante === 'Unidad' ? producto.nombre : `${producto.nombre} (${variante})`;

    if (state.step === 1) {
        state.prod1 = { nombre: nombreCompleto, precio };
        state.step  = 2;
        _promoLasEspAbrirModal();
    } else {
        state.prod2 = { nombre: nombreCompleto, precio };
        state.step  = 3;
        _promoLasEspAbrirModal();
    }
}

window._promoLasEspSelGaseosa = function (sabor) {
    const state = _promoLasEspState;
    if (state.step === 3) {
        state.gaseosa1 = sabor;
        state.step = 4;
        _promoLasEspAbrirModal();
    } else {
        // Step 4 — gaseosa 2, agregar todo al carrito
        cerrarModal();
        const now = Date.now();
        carrito.push({ id: now,     nombre: state.prod1.nombre,        precio: 48000, qty: 1, esPromoLasEsp: true, promoIdLasEsp: now });
        carrito.push({ id: now + 1, nombre: state.prod2.nombre,        precio: 0,     qty: 1, esPromoLasEsp: true, esExtra28k: true, promoIdLasEsp: now });
        carrito.push({ id: now + 2, nombre: `Gaseosa ${state.gaseosa1}`, precio: 0, qty: 1, esPromoLasEsp: true, esGaseosaLasEsp: true, promoIdLasEsp: now });
        carrito.push({ id: now + 3, nombre: `Gaseosa ${sabor}`,         precio: 0, qty: 1, esPromoLasEsp: true, esGaseosaLasEsp: true, promoIdLasEsp: now });
        localStorage.setItem('dp_promoLasEsp_obs', `PROMO 48K - ${state.categoria}`);
        actualizarComanda();
    }
};

// ── PROMO PEPPERONI 28K ────────────────────────────────────────────────────

const SABORES_KIT = ['Hawaiana', 'Tres Carnes', 'Jamón', 'Pepperoni', 'Pollo'];

window.abrirPromoKit = function () {
    const modal        = document.getElementById('modal-seleccion');
    const titulo       = document.getElementById('modal-titulo');
    const gridOpciones = document.getElementById('opciones-tamano');

    modal.querySelector('.modal-content').classList.remove('modal-sabor2');
    titulo.innerHTML = `Kit Pizzeritos · 25K<br><small style="font-size:1.3rem;color:#666;font-weight:normal;">Elige el sabor</small>`;
    gridOpciones.className = 'opciones-grid';
    gridOpciones.innerHTML = SABORES_KIT.map(s =>
        `<button class="btn-tamano" onclick="_promoKitSelSabor('${s}')">${s}</button>`
    ).join('');
    modal.style.display = 'flex';
};

window._promoKitSelSabor = function (sabor) {
    carrito.push({
        id: Date.now(),
        nombre: `Kit Pizzeritos - ${sabor}`,
        precio: 25000,
        qty: 1,
        esPromoKit: true,
    });
    localStorage.setItem('dp_promoKit_obs', 'KIT PIZZERITOS 25K');
    cerrarModal();
    actualizarComanda();
};

window.abrirPromoCombola10 = function () {
    carrito.push({
        id: Date.now(),
        nombre: 'Combo La 10 - Pizza Grande Criolla + 6 Cervezas Heineken',
        precio: 99000,
        qty: 1,
        esPromoCombola10: true,
    });
    actualizarComanda();
};

window.abrirPromoPepperoni = function () {
    carrito.push({
        id: Date.now(),
        nombre: 'Pizza Pepperoni 6 Porciones',
        precio: 28000,
        qty: 1,
        esPromoPepperoni: true,
    });
    localStorage.setItem('dp_promoPepperoni_obs', 'PROMO PEPPERONI 28K');
    actualizarComanda();
};

// ── PROMO BERRIONDA 35K (22-23 Jul 2026 · Solo Piedecuesta) ───────────────

window.abrirPromoBerrionda = function () {
    carrito.push({
        id: Date.now(),
        nombre: 'Pizza Berrionda (Pequeña)',
        precio: 35000,
        qty: 1,
        esPromoBerrionda: true,
        esAdicionable: true,
        tamanoRaw: 'Pequeña',
    });
    actualizarComanda();
};

// Iniciar
init();

// ── Cart bar: listeners (mobile) ──────────────────────────────────────────
document.getElementById('cart-bar-btn')?.addEventListener('click', abrirCartPanel);
document.getElementById('cart-overlay')?.addEventListener('click', cerrarCartPanel);

//Limpiado automático del buscador con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        const input = document.getElementById('productSearch');
        if (input) {
            input.value = "";
            ejecutarFiltro(); // Resetea la vista de las cards
            input.focus();    // Devuelve el cursor al buscador
        }
        cerrarModal(); // También cerramos cualquier modal abierto
    }
});