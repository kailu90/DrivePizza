// ── Estado global del carrito ─────────────────────────────────────
var carrito = [];
var menuDataGF = {};
var _toppingsGF = new Set();

// ── Inicialización ────────────────────────────────────────────────
function initGF(categorias) {
    crearBuscador();
    renderCategoriasGF(categorias);
    const primera = categorias.find(c => c.toLowerCase() !== 'adiciones');
    if (primera) seleccionarCategoriaGF(primera);
}

// ── Buscador ──────────────────────────────────────────────────────
function crearBuscador() {
    const wrapper = document.getElementById('search-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = `
        <div class="search-container no-print">
            <input type="text" id="productSearch"
                   placeholder="🔍 Buscar producto..."
                   oninput="ejecutarFiltro()"
                   style="width:100%; padding:12px; border:2px solid #ddd; border-radius:8px; font-size:16px;">
        </div>`;
}

function ejecutarFiltro() {
    const query = document.getElementById('productSearch')?.value.toLowerCase() || '';
    document.querySelectorAll('.card').forEach(card => {
        const nombre = card.getAttribute('data-nombre')?.toLowerCase() || '';
        card.style.display = nombre.includes(query) ? 'block' : 'none';
    });
}

// ── Categorías ────────────────────────────────────────────────────
function renderCategoriasGF(categorias) {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;
    nav.innerHTML = categorias
        .filter(c => c.toLowerCase() !== 'adiciones')
        .map(c => `<button class="cat-btn" onclick="seleccionarCategoriaGF('${c.replace(/'/g, "\\'")}')">${c}</button>`)
        .join('');
}

function seleccionarCategoriaGF(categoria) {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.cat-btn').forEach(b => {
        if (b.textContent.trim() === categoria) b.classList.add('active');
    });
    const input = document.getElementById('productSearch');
    if (input) input.value = '';
    renderProductsGF(categoria);
}

// ── Renderizado de productos ───────────────────────────────────────
function renderProductsGF(categoria) {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    const productos = menuDataGF[categoria] || [];

    if (productos.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:#aaa; padding:40px;">Sin productos en esta categoría.</p>';
        return;
    }

    grid.innerHTML = productos.map(p => {
        const listaPrecios = Object.values(p.opciones || {});
        if (listaPrecios.length === 0) return '';
        const precioMin = Math.min(...listaPrecios);
        const precioMostrar = listaPrecios.length > 1
            ? `$${precioMin.toLocaleString()}+`
            : `$${listaPrecios[0].toLocaleString()}`;
        return `
            <div class="card" data-nombre="${p.nombre}" onclick='prepararSeleccionGF(${JSON.stringify(p)})'>
                <h4>${p.nombre}</h4>
                ${p.descripcion ? `<p class="product-desc">${p.descripcion}</p>` : ''}
                <p class="price">${precioMostrar}</p>
            </div>`;
    }).join('');
}

// ── Selección de variante ──────────────────────────────────────────
function prepararSeleccionGF(producto) {
    const opciones = Object.keys(producto.opciones || {});
    if (opciones.length === 1) {
        const tam = opciones[0];
        confirmarAgregar(producto.nombre, tam, producto.opciones[tam], producto.esAdicionable);
        return;
    }
    const modal  = document.getElementById('modal-seleccion');
    const titulo = document.getElementById('modal-titulo');
    const grid   = document.getElementById('opciones-tamano');

    titulo.innerText = producto.nombre;
    grid.className = 'opciones-grid';
    grid.innerHTML = Object.entries(producto.opciones).map(([tam, pre]) => `
        <button class="btn-tamano" data-tam="${tam}" data-pre="${pre}">
            ${tam}<br><strong>$${Number(pre).toLocaleString()}</strong>
        </button>`).join('');

    grid.querySelectorAll('.btn-tamano').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmarAgregar(producto.nombre, btn.dataset.tam, Number(btn.dataset.pre), producto.esAdicionable);
            cerrarModal();
        });
    });
    modal.style.display = 'flex';
}

function cerrarModal() {
    const modal = document.getElementById('modal-seleccion');
    if (modal) modal.style.display = 'none';
}

window.addEventListener('click', e => {
    const modal = document.getElementById('modal-seleccion');
    if (e.target === modal) cerrarModal();
});

// ── Agregar al carrito ─────────────────────────────────────────────
function confirmarAgregar(nombre, tamano, precio, esAdicionable = false) {
    carrito.push({
        id:           Date.now(),
        nombre:       (tamano && tamano !== 'Unidad') ? `${nombre} (${tamano})` : nombre,
        precio:       Number(precio),
        qty:          1,
        esAdicionable,
        tamanoRaw:    tamano || 'Unidad',
    });
    actualizarComanda();
}

// ── Renderizado del carrito ────────────────────────────────────────
function actualizarComanda() {
    const container = document.getElementById('orderItems');
    const totalDisp = document.getElementById('totalDisplay');
    const btnVaciar = document.getElementById('btn-vaciar');

    if (carrito.length === 0) {
        container.innerHTML = '<p class="empty-msg">No hay productos seleccionados</p>';
        totalDisp.innerText = '$0';
        if (btnVaciar) btnVaciar.style.display = 'none';
        return;
    }
    if (btnVaciar) btnVaciar.style.display = 'inline-flex';

    const principales = carrito.filter(i => !i.pizzaId);
    container.innerHTML = principales.map(item => {
        const adicionesItem = carrito.filter(a => a.pizzaId === item.id);
        const botonAdicion  = item.esAdicionable
            ? `<button class="btn-add-adicion" onclick="abrirAdicionesModalGF(${item.id})" title="Agregar adición">⊕</button>`
            : '';
        const tieneObs = item.obs && item.obs.trim();
        const botonObs = `<button class="btn-obs ${tieneObs ? 'btn-obs--activo' : ''}" onclick="toggleObsItem(${item.id})" title="Agregar nota">✏️</button>`;
        const obsPreview = tieneObs && !item._obsOpen
            ? `<div class="obs-preview">📝 ${item.obs}</div>` : '';
        const obsInput = `
            <div class="obs-input-wrap" id="obs-wrap-${item.id}" style="display:${item._obsOpen ? 'flex' : 'none'};">
                <input type="text" class="obs-input"
                       placeholder="Ej: sin jalapeños..."
                       value="${item.obs || ''}"
                       oninput="guardarObsItem(${item.id}, this.value)"
                       onblur="cerrarObsIfEmpty(${item.id})"
                       maxlength="120">
            </div>`;
        const rowPrincipal = `
            <div class="item-grupo ${item._obsOpen ? 'item-grupo--obs-open' : ''}">
                <div class="item-row" data-id="${item.id}">
                    <div class="item-nombre-wrap">
                        <span class="item-nombre">${item.nombre}</span>
                        ${obsPreview}
                    </div>
                    <div class="item-controls">
                        ${botonAdicion}
                        ${botonObs}
                        <div class="qty-control">
                            <button class="btn-qty" onclick="decrementarQty(${item.id})">−</button>
                            <span class="qty-valor">${item.qty}</span>
                            <button class="btn-qty" onclick="incrementarQty(${item.id})">+</button>
                        </div>
                        <strong class="item-precio">$${(item.precio * item.qty).toLocaleString()}</strong>
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

    const total = carrito.reduce((sum, i) => sum + i.precio * i.qty, 0);
    totalDisp.innerText = `$${total.toLocaleString()}`;
    actualizarCartBar();
}

// ── Cantidad ───────────────────────────────────────────────────────
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

function eliminarItem(id) {
    const adicionIds = carrito.filter(a => a.pizzaId === id).map(a => a.id);
    const todosIds   = [id, ...adicionIds];
    todosIds.forEach(fId => {
        const fila = document.querySelector(`.item-row[data-id="${fId}"]`);
        if (fila) fila.classList.add('item-removing');
    });
    setTimeout(() => {
        carrito = carrito.filter(i => i.id !== id && i.pizzaId !== id);
        actualizarComanda();
    }, 300);
}

function vaciarCarrito() {
    const filas = document.querySelectorAll('.item-row');
    filas.forEach((fila, i) => setTimeout(() => fila.classList.add('item-removing'), i * 60));
    setTimeout(() => {
        carrito = [];
        actualizarComanda();
    }, filas.length * 60 + 300);
}

// ── Observación por ítem ───────────────────────────────────────────
function toggleObsItem(id) {
    const item = carrito.find(i => i.id === id);
    if (!item) return;
    item._obsOpen = !item._obsOpen;
    actualizarComanda();
    if (item._obsOpen) setTimeout(() => document.querySelector(`#obs-wrap-${id} input`)?.focus(), 50);
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

// ── Cart bar (mobile) ──────────────────────────────────────────────
function actualizarCartBar() {
    const bar = document.getElementById('cart-bar');
    if (!bar) return;
    if (document.querySelector('.order-panel')?.classList.contains('order-panel--open')) return;
    const principales = carrito.filter(i => !i.pizzaId);
    const total = carrito.reduce((sum, i) => sum + i.precio * i.qty, 0);
    if (principales.length === 0) { bar.classList.remove('cart-bar--visible'); return; }
    bar.classList.add('cart-bar--visible');
    document.getElementById('cart-bar-count').textContent =
        `${principales.length} ${principales.length === 1 ? 'producto' : 'productos'}`;
    document.getElementById('cart-bar-total').textContent = `$${total.toLocaleString()}`;
}

function abrirCartPanel() {
    document.querySelector('.order-panel')?.classList.add('order-panel--open');
    document.getElementById('cart-overlay')?.classList.add('cart-overlay--visible');
    document.getElementById('cart-bar')?.classList.remove('cart-bar--visible');
}

function cerrarCartPanel() {
    document.querySelector('.order-panel')?.classList.remove('order-panel--open');
    document.getElementById('cart-overlay')?.classList.remove('cart-overlay--visible');
    actualizarCartBar();
}

// ── Modal de adiciones ─────────────────────────────────────────────
function abrirAdicionesModalGF(itemId) {
    const itemPadre = carrito.find(i => i.id === itemId);
    if (!itemPadre) return;

    const modal  = document.getElementById('modal-seleccion');
    const titulo = document.getElementById('modal-titulo');
    const grid   = document.getElementById('opciones-tamano');

    titulo.innerHTML = `⊕ Adición<br>
        <small style="font-size:1.3rem;color:#666;font-weight:normal;">${itemPadre.nombre}</small>`;
    grid.className = 'opciones-grid opciones-adiciones';

    const tamanoRaw   = itemPadre.tamanoRaw || 'Unidad';
    const adicionesKey = Object.keys(menuDataGF).find(k => k.toLowerCase() === 'adiciones');
    const todasAdiciones = adicionesKey ? menuDataGF[adicionesKey] : [];
    // Filtra las que tienen precio para ese tamaño; si ninguna aplica, muestra todas
    let adiciones = todasAdiciones.filter(a => a.opciones[tamanoRaw] !== undefined);
    if (adiciones.length === 0) adiciones = todasAdiciones;

    if (adiciones.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay adiciones disponibles.</p>';
        modal.style.display = 'flex';
        return;
    }

    const renderBtn = (prod) => {
        const precio = prod.opciones[tamanoRaw] ?? Object.values(prod.opciones)[0];
        return `
            <button class="btn-adicion" data-nombre="${prod.nombre}" data-precio="${precio}">
                <span class="adicion-nombre">${prod.nombre}</span>
                <span class="adicion-precio">$${Number(precio).toLocaleString()}</span>
                <span class="adicion-badge" style="display:none;">0</span>
            </button>`;
    };

    grid.innerHTML = `
        <div class="adicion-section-title">Adiciones</div>
        ${adiciones.map(renderBtn).join('')}
        <button class="btn-listo-adiciones" onclick="cerrarModal()">✓ Listo</button>
    `;

    grid.querySelectorAll('.btn-adicion').forEach(btn => {
        btn.addEventListener('click', () => {
            carrito.push({
                id:      Date.now(),
                nombre:  btn.dataset.nombre,
                precio:  Number(btn.dataset.precio),
                qty:     1,
                pizzaId: itemId,
            });
            const badge = btn.querySelector('.adicion-badge');
            badge.textContent = (parseInt(badge.textContent) || 0) + 1;
            badge.style.display = 'inline-block';
            btn.classList.add('adicion-agregada');
            actualizarComanda();
        });
    });

    modal.style.display = 'flex';
}

// ── Checkout ───────────────────────────────────────────────────────
function abrirCheckout() {
    if (carrito.length === 0) { alert('El carrito está vacío'); return; }
    const total = carrito.reduce((sum, i) => sum + i.precio * i.qty, 0);
    const el = document.getElementById('checkout-total-final');
    if (el) el.textContent = `$${total.toLocaleString()}`;
    document.getElementById('modal-checkout').style.display = 'flex';
}

function cerrarCheckout() {
    document.getElementById('modal-checkout').style.display = 'none';
}

function limpiarFormularioCheckout() {
    const mesa = document.getElementById('mesaInput');
    if (mesa) mesa.value = '';
    const obs = document.getElementById('observaciones');
    if (obs) obs.value = '';
    document.querySelectorAll('.pago-btn').forEach(b => b.classList.remove('active'));
    _toppingsGF = new Set();
    document.querySelectorAll('#acomp-pills .acomp-pill').forEach(p => p.classList.remove('active'));
}

// ── Envío del pedido ───────────────────────────────────────────────
async function procesarPedidoGF() {
    const pago = document.querySelector('.pago-btn.active')?.dataset.pago || '';
    const mesa = document.getElementById('mesaInput').value.trim();
    const obs  = document.getElementById('observaciones').value.trim();

    if (!pago) { alert('⚠️ Selecciona el método de pago.'); return; }

    const datos = {
        nombre:          mesa || 'Mesa S/N',
        telefono:        '',
        pago,
        obs,
        acompanamientos: _toppingsGF.size ? [..._toppingsGF].join(', ') : null,
        productos: carrito.map(i => {
            const prod = { nombre: i.nombre, precio: i.precio, qty: i.qty };
            if (i.obs?.trim()) prod.obs = i.obs.trim();
            return prod;
        }),
        total: carrito.reduce((sum, i) => sum + i.precio * i.qty, 0),
    };

    window.mostrarOverlay?.('Enviando pedido...');
    try {
        const nPedido = await window.enviarAFirebase(datos);
        cerrarCheckout();
        limpiarFormularioCheckout();
        carrito = [];
        actualizarComanda();
        window.ocultarOverlay?.(true, {
            asesor:   window.asesorGF || '',
            pedidoId: nPedido,
            sede:     'Gastrofusión',
        });
    } catch (err) {
        console.error('[GF] Error al enviar pedido:', err);
        window.ocultarOverlay?.(false);
        alert('Hubo un error al enviar el pedido.');
    }
}
