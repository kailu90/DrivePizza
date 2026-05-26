import { HETZNER_URL, WS_URL } from '../Api/config.js'
import { plantaDB } from '../Api/firebaseConfig.js';
import { runTransaction, doc, increment, collection, getDocs, getDoc, query, orderBy, serverTimestamp, where} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getProductos, invalidarProductos, actualizarStockEnCache } from '../Shared/productosService.js'
import { registrarMovimiento, ejecutarAjusteStock, notificarCacheProducto } from './inventoryService.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar } from '../Shared/components.js';

const db   = plantaDB.db;
const auth = plantaDB.auth;

// ── Sidebar ────────────────────────────────────────────────────────────────
CargarSidebar();

// ── Usuario logueado ───────────────────────────────────────────────────────
let usuarioActual = 'Admin';
const ROLES_AJUSTE = ['admin', 'planta-admin'];
verificarAccesoPlanta(({ username, sede, rol }) => {
    usuarioActual = username;
    CargarHeader(sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : 'Planta');
    if (ROLES_AJUSTE.includes(rol)) {
        document.getElementById('btn-ajuste-stock').style.display = '';
        document.getElementById('btn-sync-productos').style.display = '';
    }
});

// ── Caché genérica para modales ────────────────────────────────────────────
const MODAL_CACHE_TTL = 30 * 60 * 1000;

function modalCacheSave(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch {}
}
function modalCacheRead(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const { t, data } = JSON.parse(raw);
        if (Date.now() - t > MODAL_CACHE_TTL) { sessionStorage.removeItem(key); return null; }
        return data;
    } catch { return null; }
}

// ── Referencias DOM ────────────────────────────────────────────────────────
const productsContainer  = document.getElementById('productsContainer');
const totalValueCounter  = document.getElementById('total-value-counter');
const outOfStockCounter  = document.getElementById('out-of-stock-counter');
const totalProductsCounter = document.getElementById('total-products-counter');
const cajasValueCounter      = document.getElementById('cajas-value-counter');
const cajasInStockCounter    = document.getElementById('cajas-in-stock-counter');
const cajasOutOfStockCounter = document.getElementById('cajas-out-of-stock-counter');

const modal       = document.getElementById('modal-stock');
const btnOpen     = document.getElementById('btn-add-stock');
const btnCancel   = document.getElementById('btn-cancel');
const stockForm   = document.getElementById('form-stock');
const btnEnviar   = document.getElementById('btn-enviar');

const supplierBuscarInput  = document.getElementById('supplier-buscar-input');
const supplierResultados   = document.getElementById('supplier-resultados');
const supplierSeleccionado = document.getElementById('supplier-seleccionado');
let proveedorSeleccionado = null;
let _proveedoresList = [];

const stockBuscarInput  = document.getElementById('stock-buscar-input');
const stockResultados   = document.getElementById('stock-resultados');
const stockSeleccionado = document.getElementById('stock-seleccionado');
let stockProductoSeleccionado = null;
const inputQuantity   = document.getElementById('stock-quantity');
const inputObservation = document.getElementById('stock-observation');

const searchInput = document.getElementById('inv-search');

// ── Toggle resumen ─────────────────────────────────────────────────────────
document.getElementById('btn-resumen-toggle').addEventListener('click', () => {
    const panel = document.getElementById('resumen-panel');
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
});

// ── Formato de moneda ──────────────────────────────────────────────────────
const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
});

// ── IDs de cajas/empaques (se muestran en grupo separado) ──────────────────
const IDS_CAJAS = new Set([28, 29, 30, 31, 32, 33, 34, 35, 36, 63, 64]);

// ──Productos para la tabla ──────────────────────────────────────

let todosLosProductos = [];

// ── Render tabla ───────────────────────────────────────────────────────────
function renderProductos(productos) {
    productosRenderizados = productos;
    productsContainer.innerHTML = '';

    let prodValue = 0, prodInStock = 0, prodOutOfStock = 0;
    let cajasValue = 0, cajasInStock = 0, cajasOutOfStock = 0;

    productos.forEach(product => {
        const totalProductValue = product.stock * product.price;
        const esCaja = IDS_CAJAS.has(Number(product.id_product));

        if (product.stock >= 0) {
            if (esCaja) {
                cajasValue += totalProductValue;
                if (product.stock === 0) cajasOutOfStock++; else cajasInStock++;
            } else {
                prodValue += totalProductValue;
                if (product.stock === 0) prodOutOfStock++; else prodInStock++;
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="inventory-management__cell">${product.id_product ?? ''}</td>
            <td class="inventory-management__cell" title="${product.name}">${product.name}</td>
            <td class="inventory-management__cell">${product.measurementUnit}</td>
            <td class="inventory-management__cell">${product.stock}</td>
            <td class="inventory-management__cell">${formatter.format(product.price)}</td>
            <td class="inventory-management__cell">${formatter.format(totalProductValue)}</td>
        `;
        productsContainer.appendChild(row);
    });

    if (totalValueCounter)       totalValueCounter.textContent    = formatter.format(prodValue);
    if (totalProductsCounter)    totalProductsCounter.textContent = prodInStock;
    if (outOfStockCounter)       outOfStockCounter.textContent    = prodOutOfStock;
    if (cajasValueCounter)       cajasValueCounter.textContent    = formatter.format(cajasValue);
    if (cajasInStockCounter)     cajasInStockCounter.textContent  = cajasInStock;
    if (cajasOutOfStockCounter)  cajasOutOfStockCounter.textContent = cajasOutOfStock;
}

// ── Cargar productos ───────────────────────────────────────────────────────
async function cargarProductos(forzar = false) {
    try {
        const productos = await getProductos(forzar)
        const sinNombre = productos.filter(p => !p.name)
        console.log('Productos sin nombre:', sinNombre)
        todosLosProductos = productos.slice().sort((a, b) => 
            (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
        )
        renderProductos(todosLosProductos)
    } catch (error) {
        console.error('Error al cargar productos:', error)
        productsContainer.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:red;">Error al cargar productos.</td></tr>`
    }
}
cargarProductos();

// ── Filtros ────────────────────────────────────────────────────────────────
let productosRenderizados = [];

const fCheck = {
    soloSinLimite:    () => document.getElementById('f-solo-sin-limite').checked,
    soloAgotados:     () => document.getElementById('f-solo-agotados').checked,
    soloConStock:     () => document.getElementById('f-solo-con-stock').checked,
    soloActivos:      () => document.getElementById('f-solo-activos').checked,
    soloInactivos:    () => document.getElementById('f-solo-inactivos').checked,
    soloCajas:        () => document.getElementById('f-solo-cajas').checked,
    soloSinPrecio:    () => document.getElementById('f-solo-sin-precio').checked,
    soloNegativos:    () => document.getElementById('f-solo-negativos').checked,
    ocultarInactivos: () => document.getElementById('f-ocultar-inactivos').checked,
    ocultarSinLimite: () => document.getElementById('f-ocultar-sin-limite').checked,
    ocultarNegativos: () => document.getElementById('f-ocultar-negativos').checked,
};

function aplicarFiltros() {
    const term = searchInput.value.trim().toLowerCase();
    let filtrados = todosLosProductos;
    if (term)                      filtrados = filtrados.filter(p => p.name.toLowerCase().includes(term));
    if (fCheck.soloSinLimite())    filtrados = filtrados.filter(p => p.sinLimiteStock === true);
    if (fCheck.soloAgotados())     filtrados = filtrados.filter(p => (p.stock ?? 0) === 0);
    if (fCheck.soloConStock())     filtrados = filtrados.filter(p => (p.stock ?? 0) > 0);
    if (fCheck.soloActivos())      filtrados = filtrados.filter(p => p.active !== false);
    if (fCheck.soloInactivos())    filtrados = filtrados.filter(p => p.active === false);
    if (fCheck.soloCajas())        filtrados = filtrados.filter(p => IDS_CAJAS.has(Number(p.id_product)));
    if (fCheck.soloSinPrecio())    filtrados = filtrados.filter(p => !p.price || p.price === 0);
    if (fCheck.soloNegativos())    filtrados = filtrados.filter(p => (p.stock ?? 0) < 0);
    if (fCheck.ocultarInactivos()) filtrados = filtrados.filter(p => p.active !== false);
    if (fCheck.ocultarSinLimite()) filtrados = filtrados.filter(p => !p.sinLimiteStock);
    if (fCheck.ocultarNegativos()) filtrados = filtrados.filter(p => (p.stock ?? 0) >= 0);
    renderProductos(filtrados);
    actualizarBadge();
}

function actualizarBadge() {
    const activos = Object.values(fCheck).filter(fn => fn()).length;
    const badge = document.getElementById('filtros-badge');
    const btn   = document.getElementById('btn-filtros');
    badge.textContent = activos;
    badge.style.display = activos > 0 ? 'inline-flex' : 'none';
    btn.classList.toggle('ap-btn--filter-active', activos > 0);
}

searchInput?.addEventListener('input', aplicarFiltros);

// Toggle panel
document.getElementById('btn-filtros').addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = document.getElementById('filtros-panel');
    const oculto = panel.style.display === 'none';
    if (oculto) {
        const rect = e.currentTarget.getBoundingClientRect();
        panel.style.top  = (rect.bottom + 6) + 'px';
        panel.style.left = rect.left + 'px';
    }
    panel.style.display = oculto ? 'block' : 'none';
});

// Cerrar al hacer click fuera
document.addEventListener('click', (e) => {
    if (!document.getElementById('filtros-dropdown').contains(e.target)) {
        document.getElementById('filtros-panel').style.display = 'none';
    }
});

// Cambio en cualquier checkbox
document.getElementById('filtros-panel').addEventListener('change', aplicarFiltros);

// Limpiar filtros
document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
    document.querySelectorAll('#filtros-panel input[type="checkbox"]').forEach(cb => cb.checked = false);
    aplicarFiltros();
});

// ── Modal: abrir / cerrar ──────────────────────────────────────────────────
function closeModal() {
    modal.close();
    stockForm.reset();
    stockBuscarInput.value = '';
    stockResultados.innerHTML = '';
    stockSeleccionado.style.display = 'none';
    stockProductoSeleccionado = null;
    supplierBuscarInput.value = '';
    supplierResultados.innerHTML = '';
    supplierSeleccionado.style.display = 'none';
    proveedorSeleccionado = null;
}

btnOpen.addEventListener('click', () => {
    modal.showModal();
    obtenerProveedoresParaStock();
    setTimeout(() => stockBuscarInput.focus(), 100);
});

btnCancel.addEventListener('click', closeModal);

modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// ── Autocomplete: Ingreso de Stock ────────────────────────────────────────
stockBuscarInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { stockResultados.innerHTML = ''; return; }
    const resultados = todosLosProductos
        .filter(p => p.active !== false && p.name.toLowerCase().includes(q))
        .slice(0, 8);
    stockResultados.innerHTML = resultados.map(p =>
        `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}" data-unit="${p.measurementUnit || ''}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`
    ).join('');
});

stockResultados?.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    stockProductoSeleccionado = { id: item.dataset.id, name: item.dataset.name, unit: item.dataset.unit };
    stockBuscarInput.value = item.dataset.name;
    stockResultados.innerHTML = '';
    document.getElementById('stock-nombre-prod').textContent = item.dataset.name;
    stockSeleccionado.style.display = 'block';
});

// ── Cargar proveedores y autocomplete ────────────────────────────────────
async function obtenerProveedoresParaStock() {
    try {
        let proveedores = modalCacheRead('inv_proveedores');
        if (!proveedores) {
            const q = query(collection(db, 'Planta', 'principal', 'Proveedores'), orderBy('name', 'asc'));
            const snap = await getDocs(q);
            proveedores = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
            modalCacheSave('inv_proveedores', proveedores);
        }
        _proveedoresList = proveedores;
    } catch (error) {
        console.error('Error al cargar proveedores:', error);
    }
}

supplierBuscarInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { supplierResultados.innerHTML = ''; return; }
    const resultados = _proveedoresList
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 8);
    supplierResultados.innerHTML = resultados.map(p =>
        `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`
    ).join('');
});

supplierResultados?.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    proveedorSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    supplierBuscarInput.value = item.dataset.name;
    supplierResultados.innerHTML = '';
    document.getElementById('supplier-nombre').textContent = item.dataset.name;
    supplierSeleccionado.style.display = 'block';
});

// ── Modal confirmación de stock ────────────────────────────────────────────
const modalConfirmStock  = document.getElementById('modal-confirm-stock');
const btnConfirmStockOk  = document.getElementById('btn-confirm-stock-ok');
const btnConfirmStockCancelar = document.getElementById('btn-confirm-stock-cancelar');

btnConfirmStockCancelar.addEventListener('click', () => modalConfirmStock.close());
modalConfirmStock.addEventListener('click', (e) => {
    if (e.target === modalConfirmStock) modalConfirmStock.close();
});

// ── Enviar ingreso de stock ────────────────────────────────────────────────
stockForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const productId    = stockProductoSeleccionado?.id || '';
    const productName  = stockProductoSeleccionado?.name || '';
    const unidadMedida = stockProductoSeleccionado?.unit || '';
    const supplierId   = proveedorSeleccionado?.id || '';
    const supplierName = proveedorSeleccionado?.name || '';
    const quantityToAdd = parseInt(inputQuantity.value, 10);
    const observations = inputObservation.value.trim();

    if (!productId || !supplierId || isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert('Completa los campos correctamente.');
        return;
    }

    // Poblar tabla resumen del modal de confirmación
    const unidad = unidadMedida || 'unidad';
    const filas = [
        ['Producto',   productName],
        ['Cantidad',   `${quantityToAdd} ${quantityToAdd === 1 ? unidad : unidad + 's'}`],
        ['Proveedor',  supplierName],
        ...(observations ? [['Observación', observations]] : []),
    ];
    document.getElementById('confirm-stock-tabla').innerHTML = filas.map(([label, valor]) => `
        <tr>
            <td style="padding:7px 10px;color:#666;white-space:nowrap;width:110px;">${label}</td>
            <td style="padding:7px 10px;font-weight:600;">${valor}</td>
        </tr>
    `).join('');

    modalConfirmStock.showModal();

    // Al confirmar: ejecutar la transacción
    btnConfirmStockOk.onclick = async () => {
        modalConfirmStock.close();
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Procesando...';

        try {
            const productRef = doc(db, 'Planta', 'principal', 'Productos', productId);
            await runTransaction(db, async (transaction) => {
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists()) throw 'Producto no encontrado.';
                transaction.update(productRef, {
                    stock: increment(quantityToAdd),
                    ultimaActualizacion: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });

            await registrarMovimiento({
                tipo:            'ENTRADA',
                productoId:      productId,
                productoNombre:  productName,
                proveedorId:     supplierId,
                proveedorNombre: supplierName,
                cantidad:        quantityToAdd,
                unidadMedida,
                motivo:          'Ingreso Manual Stock',
                notas:           observations || '',
                usuario:         usuarioActual
            });

            alert(`✅ Ingreso exitoso\n\n${productName}\n${quantityToAdd} ${unidad}${quantityToAdd !== 1 ? 's' : ''}`);

            actualizarStockEnCache(productId, quantityToAdd);
            notificarCacheProducto(productId);
            aplicarFiltros();
            closeModal();

        } catch (error) {
            console.error('❌ Error en la transacción:', error);
            alert('Error: ' + error);
        } finally {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar';
        }
    };
});

// ── Modal de Ajuste de Inventario (solo planta-admin / admin) ──────────────
const modalAjuste       = document.getElementById('modal-ajuste');
const btnAbrirAjuste    = document.getElementById('btn-ajuste-stock');
const formAjuste        = document.getElementById('form-ajuste');
const btnAjusteCancel   = document.getElementById('btn-ajuste-cancel');
const btnAjusteEnviar   = document.getElementById('btn-ajuste-enviar');
const ajusteBuscarInput  = document.getElementById('ajuste-buscar-input');
const ajusteResultados   = document.getElementById('ajuste-resultados');
const ajusteSeleccionadoDiv = document.getElementById('ajuste-seleccionado');
let ajusteProductoSeleccionado = null;
const ajusteStockActual = document.getElementById('ajuste-stock-actual');
const ajusteStockReal   = document.getElementById('ajuste-stock-real');
const ajusteDifWrap     = document.getElementById('ajuste-diferencia-wrap');
const ajusteDifLabel    = document.getElementById('ajuste-diferencia-label');

function closeModalAjuste() {
    modalAjuste.close();
    formAjuste.reset();
    ajusteStockActual.value = '';
    ajusteDifWrap.style.display = 'none';
    ajusteBuscarInput.value = '';
    ajusteResultados.innerHTML = '';
    ajusteSeleccionadoDiv.style.display = 'none';
    ajusteProductoSeleccionado = null;
}

btnAbrirAjuste?.addEventListener('click', () => {
    modalAjuste.showModal();
    setTimeout(() => ajusteBuscarInput.focus(), 100);
});

btnAjusteCancel?.addEventListener('click', closeModalAjuste);
modalAjuste?.addEventListener('click', (e) => { if (e.target === modalAjuste) closeModalAjuste(); });

// ── Autocomplete: Ajuste de Inventario ───────────────────────────────────
ajusteBuscarInput?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { ajusteResultados.innerHTML = ''; return; }
    const resultados = todosLosProductos
        .filter(p => p.active !== false && p.name.toLowerCase().includes(q))
        .slice(0, 8);
    ajusteResultados.innerHTML = resultados.map(p =>
        `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`
    ).join('');
});

ajusteResultados?.addEventListener('click', async (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    ajusteProductoSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    ajusteBuscarInput.value = item.dataset.name;
    ajusteResultados.innerHTML = '';
    document.getElementById('ajuste-nombre-prod').textContent = item.dataset.name;
    ajusteSeleccionadoDiv.style.display = 'block';
    ajusteStockActual.value = 'Cargando...';
    ajusteDifWrap.style.display = 'none';
    ajusteStockReal.value = '';
    try {
        const snap = await getDoc(doc(db, 'Planta', 'principal', 'Productos', item.dataset.id));
        ajusteStockActual.value = snap.exists() ? (snap.data().stock ?? 0) : '—';
    } catch {
        ajusteStockActual.value = '—';
    }
});

ajusteStockReal?.addEventListener('input', () => {
    const actual = parseFloat(ajusteStockActual.value);
    const real   = parseFloat(ajusteStockReal.value);
    if (isNaN(actual) || isNaN(real) || ajusteStockReal.value === '') {
        ajusteDifWrap.style.display = 'none';
        return;
    }
    const dif = real - actual;
    ajusteDifWrap.style.display = '';
    if (dif === 0) {
        ajusteDifLabel.textContent = 'Sin diferencia (el stock no cambiará)';
        ajusteDifLabel.style.background = '#e9ecef';
        ajusteDifLabel.style.color = '#495057';
    } else if (dif > 0) {
        ajusteDifLabel.textContent = `▲ Diferencia: +${dif} unidades (el stock aumentará)`;
        ajusteDifLabel.style.background = '#d4edda';
        ajusteDifLabel.style.color = '#155724';
    } else {
        ajusteDifLabel.textContent = `▼ Diferencia: ${dif} unidades (el stock disminuirá)`;
        ajusteDifLabel.style.background = '#f8d7da';
        ajusteDifLabel.style.color = '#721c24';
    }
});

formAjuste?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId   = ajusteProductoSeleccionado?.id || '';
    const productName = ajusteProductoSeleccionado?.name || '';
    const stockNuevo  = parseInt(ajusteStockReal.value, 10);
    const motivo      = document.getElementById('ajuste-motivo').value.trim();
    const notas       = document.getElementById('ajuste-notas').value.trim();

    if (!productId || isNaN(stockNuevo) || stockNuevo < 0 || !motivo) {
        alert('Completa todos los campos obligatorios.');
        return;
    }

    btnAjusteEnviar.disabled = true;
    btnAjusteEnviar.textContent = 'Procesando...';

    try {
        const { stockAnterior, diferencia } = await ejecutarAjusteStock({
            productId, name: productName, stockNuevo, motivo, notas, usuario: usuarioActual
        });

        const signo = diferencia >= 0 ? `+${diferencia}` : `${diferencia}`;
        alert(`✅ Ajuste realizado\n\n${productName}\n${stockAnterior} → ${stockNuevo} (${signo})`);

        invalidarProductos();
        await cargarProductos(true);
        closeModalAjuste();
    } catch (error) {
        console.error('❌ Error en ajuste:', error);
        alert('Error al guardar el ajuste: ' + error);
    } finally {
        btnAjusteEnviar.disabled = false;
        btnAjusteEnviar.textContent = 'Guardar Ajuste';
    }
});

// ── WebSocket: actualización en tiempo real ────────────────────────────────
let wsInventario;
function conectarWebSocketInventario() {
    wsInventario = new WebSocket(WS_URL);

    wsInventario.onopen = () => {
        console.log('Inventario WebSocket conectado');
    };

    wsInventario.onmessage = (event) => {
        try {
            const mensaje = JSON.parse(event.data);
            if (mensaje.tipo === 'planta:productos:actualizado') {
                cargarProductos(true);
            }
        } catch (e) {
            console.error('Error procesando mensaje WebSocket inventario:', e);
        }
    };

    wsInventario.onclose = () => {
        console.log('Inventario WebSocket desconectado, reconectando en 5s...');
        setTimeout(conectarWebSocketInventario, 5000);
    };

    wsInventario.onerror = (err) => {
        console.error('Inventario WebSocket error:', err);
    };
}
conectarWebSocketInventario();

// ── Sincronizar productos con Firestore ────────────────────────────────────
document.getElementById('btn-sync-productos')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-productos');
    btn.disabled = true;
    btn.textContent = 'Sincronizando...';
    try {
        const res = await fetch(`${HETZNER_URL}/planta/cache/sync-productos`, { method: 'POST' });
        const data = await res.json();
        btn.textContent = res.ok ? `✅ ${data.sincronizados ?? 0} productos` : 'Error';
    } catch {
        btn.textContent = 'Error';
    }
    setTimeout(() => { btn.textContent = '🔄 Sincronizar'; btn.disabled = false; }, 3000);
});

// ── Exportar inventario a Excel ────────────────────────────────────────────
document.getElementById('btn-exportar-excel')?.addEventListener('click', () => {
    if (!productosRenderizados.length) {
        alert('No hay productos cargados para exportar.');
        return;
    }

    const filas = productosRenderizados.map(p => ({
        'ID':             p.id_product ?? '',
        'Producto':       p.name,
        'Unidad':         p.measurementUnit || '',
        'Stock':          p.stock ?? 0,
        'Precio Unidad':  p.price ?? 0,
        'Valor Total':    (p.stock ?? 0) * (p.price ?? 0),
    }));

    const ws = XLSX.utils.json_to_sheet(filas);

    // Ancho de columnas
    ws['!cols'] = [
        { wch: 6 },   // ID
        { wch: 30 },  // Producto
        { wch: 12 },  // Unidad
        { wch: 10 },  // Stock
        { wch: 16 },  // Precio Unidad
        { wch: 16 },  // Valor Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    const fecha = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `inventario_${fecha}.xlsx`);
});
