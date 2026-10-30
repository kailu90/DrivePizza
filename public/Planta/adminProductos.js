import { supabase } from '../Api/supabaseConfig.js';
import { getProductos, invalidarProductos, actualizarStockEnCache } from '../Shared/productosService.js'
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { UNIDADES_MEDIDA } from './planta.config.js';
import { registrarMovimiento, ejecutarAjusteStock } from './inventoryService.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
CargarSidebar();


let usuarioActual = 'Admin';

// ── Caché sessionStorage ──────────────────────────────────────────────────────
const CACHE_CATEGORIAS = 'ap_categorias';
const TTL_CATEGORIAS   = 60 * 60 * 1000;   // 60 min (cambian muy poco)

function cacheGuardar(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch {}
}
function cacheLeer(key, ttl) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const { t, data } = JSON.parse(raw);
        if (Date.now() - t > ttl) { sessionStorage.removeItem(key); return null; }
        return data;
    } catch { return null; }
}

// ── Estado ───────────────────────────────────────────────────────────────────
let allProducts = [];
let categoriasMap = {};   // idCategory → name
let categoriasArr = [];   // [{ idCategory, name }]
let editingDocId = null;
let _proveedoresList = [];
let _proveedorSeleccionado = null; // { id, name }

// ── Auth guard ────────────────────────────────────────────────────────────────
const ROLES_AJUSTE = ['admin', 'planta-admin'];

verificarAccesoPlanta(async ({ username, sede, rol }) => {
  usuarioActual = username;
  CargarHeader(capitalizarSede(sede));
  await Promise.all([loadCategorias(), loadProducts(), loadProveedores()]);
  buildCatFilter();
  renderTable();
  if (ROLES_AJUSTE.includes(rol)) {
      document.getElementById('btn-ajuste-stock').style.display = '';
  }
  document.body.classList.add('loaded');
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function loadCategorias() {
  const cached = cacheLeer(CACHE_CATEGORIAS, TTL_CATEGORIAS);
  if (cached) {
    categoriasArr = cached.arr;
    categoriasMap = cached.map;
  } else {
    const { data, error } = await supabase.from('categorias').select('id_category,name').order('name')
    if (error) throw error
    data.forEach(c => {
      categoriasArr.push({ idCategory: c.id_category, name: c.name })
      categoriasMap[c.id_category] = c.name
    })
    cacheGuardar(CACHE_CATEGORIAS, { arr: categoriasArr, map: categoriasMap })
  }

  // Poblar select del formulario
  const sel = document.getElementById('f-categoria');
  categoriasArr.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.idCategory;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}
// ── Cargar Productos ─────────────────────────────────────────────────
async function loadProducts() {
    allProducts = await getProductos()
    allProducts = allProducts.map(p => ({ ...p, _docId: p.id }))
}

// ── Cargar Proveedores ────────────────────────────────────────────────
async function loadProveedores() {
    const cached = cacheLeer('ap_proveedores', TTL_CATEGORIAS);
    if (cached) {
        _proveedoresList = cached;
    } else {
        const { data, error } = await supabase.from('proveedores').select('id,nombre').eq('active', true).order('nombre')
        if (error) throw error
        _proveedoresList = data.map(p => ({ id: String(p.id), name: p.nombre }))
        cacheGuardar('ap_proveedores', _proveedoresList)
    }
    const sel = document.getElementById('ap-filter-proveedor');
    sel.innerHTML = '<option value="">Todos los proveedores</option>';
    _proveedoresList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

// ── Poblar select de unidades ─────────────────────────────────────────────────
(function buildUnidades() {
  const sel = document.getElementById('f-unidad');
  UNIDADES_MEDIDA.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    sel.appendChild(opt);
  });
})();

// ── Filtro de categorías en toolbar ──────────────────────────────────────────
function buildCatFilter() {
  const sel = document.getElementById('ap-filter-cat');
  categoriasArr.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.idCategory;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

// ── Render tabla ──────────────────────────────────────────────────────────────
const ROT_LABEL = { alta: 'Alta rotación', media: 'Media rotación', baja: 'Baja rotación' };

function getFilteredProducts() {
  const search    = document.getElementById('ap-search').value.trim().toLowerCase();
  const cat       = document.getElementById('ap-filter-cat').value;
  const status    = document.getElementById('ap-filter-status').value;
  const rotacion  = document.getElementById('ap-filter-rotacion').value;
  const proveedor = document.getElementById('ap-filter-proveedor').value;

  return allProducts.filter(p => {
    if (search    && !p.name?.toLowerCase().includes(search))  return false;
    if (cat       && String(p.idCategory) !== String(cat))     return false;
    if (status === 'active'   && !p.active)  return false;
    if (status === 'inactive' &&  p.active)  return false;
    if (rotacion === 'sin'    && p.rotacion) return false;
    if (rotacion  && rotacion !== 'sin' && p.rotacion !== rotacion) return false;
    if (proveedor && p.proveedorId !== proveedor)              return false;
    return true;
  });
}

function renderTable() {
  const tbody   = document.getElementById('ap-tbody');
  const counter = document.getElementById('ap-count');
  const filtered = getFilteredProducts();

  counter.textContent = `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="ap-loading">Sin resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(p => {
    const catNombre  = categoriasMap[p.idCategory] || '—';
    const precio     = p.price != null ? '$' + Number(p.price).toLocaleString('es-CO') : '—';
    const rotClass   = p.rotacion ? `ap-rot--${p.rotacion}` : 'ap-rot--none';
    const rotTitle   = ROT_LABEL[p.rotacion] || 'Sin clasificar';
    const tr = document.createElement('tr');
    tr.className = p.active ? '' : 'ap-row--inactive';
    tr.innerHTML = `
      <td class="ap-cell ap-col-center">
        <span class="ap-rot ${rotClass}" title="${rotTitle}"></span>
      </td>
      <td class="ap-cell ap-cell--name">${p.name || '—'}</td>
      <td class="ap-cell ap-cell--cat">${catNombre}</td>
      <td class="ap-cell">${p.proveedorNombre || '—'}</td>
      <td class="ap-cell ap-col-num">${precio}</td>
      <td class="ap-cell ap-col-num">${p.stock ?? '—'}${p.sinLimiteStock ? ' <span title="Sin límite de stock">∞</span>' : ''}</td>
      <td class="ap-cell">${p.measurementUnit || '—'}</td>
      <td class="ap-cell ap-cell--pres">${p.quantities || '—'}</td>
      <td class="ap-cell ap-col-center">
        <label class="ap-toggle" title="${p.active ? 'Desactivar' : 'Activar'}">
          <input type="checkbox" class="ap-toggle__input" data-id="${p._docId}" ${p.active ? 'checked' : ''}>
          <span class="ap-toggle__slider"></span>
        </label>
      </td>
      <td class="ap-cell ap-col-center">
        <button class="ap-btn ap-btn--edit" data-id="${p._docId}">Editar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── Eventos de filtro ─────────────────────────────────────────────────────────
['ap-search', 'ap-filter-cat', 'ap-filter-status', 'ap-filter-rotacion', 'ap-filter-proveedor'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderTable);
});

// ── Delegación en tbody ───────────────────────────────────────────────────────
document.getElementById('ap-tbody').addEventListener('change', async (e) => {
  if (!e.target.classList.contains('ap-toggle__input')) return;
  const checkbox = e.target;
  const docId = checkbox.dataset.id;
  const newActive = checkbox.checked;
  const p = allProducts.find(x => x._docId === docId);
  try {
    const { error: toggleErr } = await supabase.from('productos').update({ active: newActive, updated_at: new Date().toISOString() }).eq('id', parseInt(docId))
    if (toggleErr) throw toggleErr
    if (p) p.active = newActive;
    invalidarProductos();
    renderTable();
    registrarMovimiento({
      tipo: 'MODIFICACION',
      productoId: docId,
      productoNombre: p?.name || '',
      campo: 'active',
      valorAnterior: !newActive,
      valorNuevo: newActive,
      motivo: newActive ? 'Producto activado' : 'Producto desactivado',
      usuario: usuarioActual
    }).catch(console.error);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    checkbox.checked = !newActive;
  }
});

document.getElementById('ap-tbody').addEventListener('click', (e) => {
  if (!e.target.classList.contains('ap-btn--edit')) return;
  const docId = e.target.dataset.id;
  const p = allProducts.find(x => x._docId === docId);
  if (p) openModal(p);
});

// ── Modal ─────────────────────────────────────────────────────────────────────
const modal  = document.getElementById('ap-modal');
const form   = document.getElementById('ap-form');
const errMsg = document.getElementById('ap-modal-error');

async function openModal(product = null) {
  // Recargar proveedores si el caché fue invalidado (ej: se creó uno nuevo en otra pestaña)
  if (!cacheLeer('ap_proveedores', TTL_CATEGORIAS)) await loadProveedores();

  editingDocId = product ? product._docId : null;
  const isEdit = !!product;
  document.getElementById('ap-modal-title').textContent = isEdit ? 'Editar producto' : 'Nuevo producto';
  errMsg.textContent = '';

  document.getElementById('f-nombre').value         = product?.name           ?? '';
  document.getElementById('f-categoria').value      = product?.idCategory     ?? '';
  document.getElementById('f-unidad').value         = product?.measurementUnit ?? UNIDADES_MEDIDA[0];
  document.getElementById('f-precio').value         = product?.price          ?? '';
  document.getElementById('f-presentaciones').value = product?.quantities     ?? '';
  document.getElementById('f-activo').checked         = product?.active          ?? true;
  document.getElementById('f-sin-limite').checked     = product?.sinLimiteStock   ?? false;
  document.getElementById('f-solo-produccion').checked= product?.soloProduccion   ?? false;
  document.getElementById('f-peso-variable').checked   = product?.pesoVariable     ?? false;
  document.getElementById('f-entrega-diferida').checked = product?.entregaDiferida ?? false;
  document.getElementById('f-rotacion').value         = product?.rotacion         ?? '';

  // Proveedor
  _proveedorSeleccionado = product?.proveedorId ? { id: product.proveedorId, name: product.proveedorNombre } : null;
  document.getElementById('f-proveedor-buscar').value = product?.proveedorNombre ?? '';
  document.getElementById('f-proveedor-resultados').innerHTML = '';
  if (_proveedorSeleccionado) {
    document.getElementById('f-proveedor-nombre').textContent = product.proveedorNombre;
    document.getElementById('f-proveedor-seleccionado').style.display = 'block';
  } else {
    document.getElementById('f-proveedor-seleccionado').style.display = 'none';
  }

  // Stock: visible solo al crear
  const stockWrap  = document.getElementById('f-stock-wrap');
  const stockInput = document.getElementById('f-stock');
  if (isEdit) {
    stockWrap.style.display = 'none';
    stockInput.required     = false;
    stockInput.value        = '';
  } else {
    stockWrap.style.display = '';
    stockInput.required     = true;
    stockInput.value        = '';
  }

  document.getElementById('ap-btn-delete-modal').style.display = isEdit ? 'inline-flex' : 'none';

  modal.showModal();
}

document.getElementById('ap-btn-delete-modal').addEventListener('click', async () => {
  if (!editingDocId) return;
  const p = allProducts.find(x => x._docId === editingDocId);
  if (!confirm(`¿Eliminar el producto "${p?.name ?? ''}"?\n\nEsta acción no se puede deshacer.`)) return;
  try {
    const { error } = await supabase.from('productos').delete().eq('id', parseInt(editingDocId));
    if (error) throw error;
    modal.close();
    allProducts = allProducts.filter(x => x._docId !== editingDocId);
    invalidarProductos();
    renderTable();
    registrarMovimiento({
      tipo: 'ELIMINACION',
      productoId: editingDocId,
      productoNombre: p?.name || '',
      motivo: 'Eliminación de producto',
      usuario: usuarioActual
    }).catch(console.error);
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    alert('Error al eliminar el producto. Intenta de nuevo.');
  }
});

document.getElementById('ap-btn-nuevo').addEventListener('click', () => openModal());
document.getElementById('ap-btn-cancelar').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
modal.addEventListener('close', () => {
    document.getElementById('f-proveedor-buscar').value = '';
    document.getElementById('f-proveedor-resultados').innerHTML = '';
    document.getElementById('f-proveedor-seleccionado').style.display = 'none';
    _proveedorSeleccionado = null;
});

document.getElementById('f-proveedor-buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const res = document.getElementById('f-proveedor-resultados');
    if (!q) { res.innerHTML = ''; return; }
    res.innerHTML = _proveedoresList
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(p => `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span></div>`)
        .join('');
});

document.getElementById('f-proveedor-resultados').addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    _proveedorSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    document.getElementById('f-proveedor-buscar').value = item.dataset.name;
    document.getElementById('f-proveedor-resultados').innerHTML = '';
    document.getElementById('f-proveedor-nombre').textContent = item.dataset.name;
    document.getElementById('f-proveedor-seleccionado').style.display = 'block';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errMsg.textContent = '';

  const nombre         = document.getElementById('f-nombre').value.trim();
  const idCategory     = parseInt(document.getElementById('f-categoria').value);
  const unidad         = document.getElementById('f-unidad').value;
  const precio         = parseFloat(document.getElementById('f-precio').value);
  const presentaciones  = document.getElementById('f-presentaciones').value.trim();
  const activo          = document.getElementById('f-activo').checked;
  const sinLimiteStock  = document.getElementById('f-sin-limite').checked;
  const soloProduccion  = document.getElementById('f-solo-produccion').checked;
  const pesoVariable    = document.getElementById('f-peso-variable').checked;
  const entregaDiferida = document.getElementById('f-entrega-diferida').checked;
  const rotacion        = document.getElementById('f-rotacion').value;
  const isEdit         = !!editingDocId;

  const stockInput = document.getElementById('f-stock');
  const stock      = isEdit ? null : parseInt(stockInput.value);

  if (!nombre || !idCategory || !unidad || isNaN(precio) || (!isEdit && isNaN(stock))) {
    errMsg.textContent = 'Completa todos los campos obligatorios.';
    return;
  }

  const btnGuardar = document.getElementById('ap-btn-guardar');
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  const data = {
    name: nombre,
    idCategory,
    measurementUnit: unidad,
    price: precio,
    active: activo,
    quantities: presentaciones,
    sinLimiteStock,
    soloProduccion,
    pesoVariable,
    entregaDiferida,
    rotacion,
    ...(_proveedorSeleccionado ? { proveedorId: _proveedorSeleccionado.id, proveedorNombre: _proveedorSeleccionado.name } : {})
  };

  try {
    if (isEdit) {
      const antes = allProducts.find(p => p._docId === editingDocId);
      const supaData = {
        name: nombre, id_category: idCategory, measurement_unit: unidad,
        price: precio, active: activo, quantities: presentaciones,
        sin_limite_stock: sinLimiteStock, solo_produccion: soloProduccion,
        peso_variable: pesoVariable, entrega_diferida: entregaDiferida,
        rotacion: rotacion || null,
        proveedor_id:     _proveedorSeleccionado ? parseInt(_proveedorSeleccionado.id) : null,
        proveedor_nombre: _proveedorSeleccionado?.name || null,
        updated_at: new Date().toISOString(),
      }
      const { error: updErr } = await supabase.from('productos').update(supaData).eq('id', parseInt(editingDocId))
      if (updErr) throw updErr
      const idx = allProducts.findIndex(p => p._docId === editingDocId);
      if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...data };
      invalidarProductos();

      // Registrar un único documento con todos los campos que cambiaron
      const camposAuditables = ['name', 'price', 'measurementUnit', 'idCategory', 'quantities', 'active', 'sinLimiteStock', 'pesoVariable', 'entregaDiferida', 'rotacion', 'proveedorNombre'];
      const cambios = camposAuditables
        .filter(campo => String(antes?.[campo] ?? '') !== String(data[campo] ?? ''))
        .map(campo => ({
          campo,
          valorAnterior: String(antes?.[campo] ?? ''),
          valorNuevo:    String(data[campo]  ?? '')
        }));
      if (cambios.length > 0) {
        registrarMovimiento({
          tipo: 'MODIFICACION',
          productoId:     editingDocId,
          productoNombre: antes?.name || nombre,
          cambios,
          motivo:  'Edición de producto',
          usuario: usuarioActual
        }).catch(console.error);
      }
    } else {
      const supaData = {
        name: nombre, id_category: idCategory, measurement_unit: unidad,
        price: precio, stock, active: activo, quantities: presentaciones,
        sin_limite_stock: sinLimiteStock, solo_produccion: soloProduccion,
        peso_variable: pesoVariable, entrega_diferida: entregaDiferida,
        rotacion: rotacion || null,
        proveedor_id:     _proveedorSeleccionado ? parseInt(_proveedorSeleccionado.id) : null,
        proveedor_nombre: _proveedorSeleccionado?.name || null,
        updated_at: new Date().toISOString(),
      }
      const { data: newRow, error: insErr } = await supabase.from('productos').insert(supaData).select().single()
      if (insErr) throw insErr
      const newId = String(newRow.id)
      allProducts.push({ _docId: newId, id: newId, ...data, stock });
      allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      invalidarProductos();

      registrarMovimiento({
        tipo: 'CREACION',
        productoId: newId,
        productoNombre: nombre,
        cantidad: stock,
        motivo: 'Creación de producto',
        notas: `Stock inicial: ${stock} | Precio: $${precio.toLocaleString('es-CO')}`,
        usuario: usuarioActual
      }).catch(console.error);
    }
    modal.close();
    renderTable();
  } catch (err) {
    console.error('Error al guardar:', err);
    errMsg.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar';
  }
});

// ── Supabase Realtime: actualización en tiempo real ───────────────────────────
supabase.channel('admin-productos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, async () => {
        invalidarProductos();
        await loadProducts();
        renderTable();
    })
    .subscribe();

// ── Modal: Ingreso de Stock ────────────────────────────────────────────────────
let _stockProductoSeleccionado = null;
let _proveedorStockSeleccionado = null;

const modalStock      = document.getElementById('modal-stock');
const stockForm       = document.getElementById('form-stock');
const btnOpenStock    = document.getElementById('btn-add-stock');
const btnStockCancel  = document.getElementById('btn-stock-cancel');
const btnStockEnviar  = document.getElementById('btn-stock-enviar');
const stockBuscarInput  = document.getElementById('stock-buscar-input');
const stockResultados   = document.getElementById('stock-resultados');
const stockSeleccionado = document.getElementById('stock-seleccionado');
const supplierBuscarInput  = document.getElementById('supplier-buscar-input');
const supplierResultados   = document.getElementById('supplier-resultados');
const supplierSeleccionado = document.getElementById('supplier-seleccionado');

function closeModalStock() {
    modalStock.close();
    stockForm.reset();
    stockBuscarInput.value = '';
    stockResultados.innerHTML = '';
    stockSeleccionado.style.display = 'none';
    _stockProductoSeleccionado = null;
    supplierBuscarInput.value = '';
    supplierResultados.innerHTML = '';
    supplierSeleccionado.style.display = 'none';
    _proveedorStockSeleccionado = null;
}

btnOpenStock.addEventListener('click', () => {
    modalStock.showModal();
    setTimeout(() => stockBuscarInput.focus(), 100);
});
btnStockCancel.addEventListener('click', closeModalStock);
modalStock.addEventListener('click', (e) => { if (e.target === modalStock) closeModalStock(); });

stockBuscarInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { stockResultados.innerHTML = ''; return; }
    const resultados = allProducts
        .filter(p => p.active !== false && p.name.toLowerCase().includes(q))
        .slice(0, 8);
    stockResultados.innerHTML = resultados.map(p =>
        `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}" data-unit="${p.measurementUnit || ''}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`
    ).join('');
});

stockResultados.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    _stockProductoSeleccionado = { id: item.dataset.id, name: item.dataset.name, unit: item.dataset.unit };
    stockBuscarInput.value = item.dataset.name;
    stockResultados.innerHTML = '';
    document.getElementById('stock-nombre-prod').textContent = item.dataset.name;
    stockSeleccionado.style.display = 'block';
});

supplierBuscarInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { supplierResultados.innerHTML = ''; return; }
    supplierResultados.innerHTML = _proveedoresList
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(p => `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`)
        .join('');
});

supplierResultados.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    _proveedorStockSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    supplierBuscarInput.value = item.dataset.name;
    supplierResultados.innerHTML = '';
    document.getElementById('supplier-nombre').textContent = item.dataset.name;
    supplierSeleccionado.style.display = 'block';
});

// ── Modal confirmacion de stock ───────────────────────────────────────────────
const modalConfirmStock       = document.getElementById('modal-confirm-stock');
const btnConfirmStockOk       = document.getElementById('btn-confirm-stock-ok');
const btnConfirmStockCancelar = document.getElementById('btn-confirm-stock-cancelar');

btnConfirmStockCancelar.addEventListener('click', () => modalConfirmStock.close());
modalConfirmStock.addEventListener('click', (e) => { if (e.target === modalConfirmStock) modalConfirmStock.close(); });

stockForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const productId    = _stockProductoSeleccionado?.id || '';
    const productName  = _stockProductoSeleccionado?.name || '';
    const unidadMedida = _stockProductoSeleccionado?.unit || '';
    const supplierId   = _proveedorStockSeleccionado?.id || '';
    const supplierName = _proveedorStockSeleccionado?.name || '';
    const quantityToAdd = parseInt(document.getElementById('stock-quantity').value, 10);
    const observations  = document.getElementById('stock-observation').value.trim();

    if (!productId || !supplierId || isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert('Completa los campos correctamente.');
        return;
    }

    const unidad = unidadMedida || 'unidad';
    const filas = [
        ['Producto',  productName],
        ['Cantidad',  `${quantityToAdd} ${quantityToAdd === 1 ? unidad : unidad + 's'}`],
        ['Proveedor', supplierName],
        ...(observations ? [['Observacion', observations]] : []),
    ];
    document.getElementById('confirm-stock-tabla').innerHTML = filas.map(([label, valor]) => `
        <tr>
            <td style="padding:7px 10px;color:#666;white-space:nowrap;width:110px;">${label}</td>
            <td style="padding:7px 10px;font-weight:600;">${valor}</td>
        </tr>
    `).join('');

    modalConfirmStock.showModal();

    btnConfirmStockOk.onclick = async () => {
        modalConfirmStock.close();
        btnStockEnviar.disabled = true;
        btnStockEnviar.textContent = 'Procesando...';

        try {
            const { error: errStock } = await supabase.rpc('increment_stock', {
                p_id: parseInt(productId), p_delta: quantityToAdd
            });
            if (errStock) throw errStock;

            await Promise.all([
                registrarMovimiento({
                    tipo:            'ENTRADA',
                    productoId:      productId,
                    productoNombre:  productName,
                    proveedorId:     supplierId,
                    proveedorNombre: supplierName,
                    cantidad:        quantityToAdd,
                    unidadMedida,
                    motivo:          'Ingreso Manual Stock',
                    notas:           observations || '',
                    usuario:         usuarioActual,
                }),
                supabase.from('productos').update({
                    proveedor_id:     parseInt(supplierId),
                    proveedor_nombre: supplierName,
                }).eq('id', parseInt(productId)),
            ]);

            alert(`Ingreso exitoso\n\n${productName}\n${quantityToAdd} ${unidad}${quantityToAdd !== 1 ? 's' : ''}`);

            actualizarStockEnCache(productId, quantityToAdd);
            // Actualizar stock en allProducts sin recargar todo
            const p = allProducts.find(x => x._docId === productId);
            if (p) p.stock = (p.stock ?? 0) + quantityToAdd;
            renderTable();
            closeModalStock();
        } catch (error) {
            console.error('Error en la transaccion:', error);
            alert('Error: ' + error.message);
        } finally {
            btnStockEnviar.disabled = false;
            btnStockEnviar.textContent = 'Guardar';
        }
    };
});

// ── Modal: Ajuste de Inventario ───────────────────────────────────────────────
let _ajusteProductoSeleccionado = null;

const modalAjuste        = document.getElementById('modal-ajuste');
const btnAbrirAjuste     = document.getElementById('btn-ajuste-stock');
const formAjuste         = document.getElementById('form-ajuste');
const btnAjusteCancel    = document.getElementById('btn-ajuste-cancel');
const btnAjusteEnviar    = document.getElementById('btn-ajuste-enviar');
const ajusteBuscarInput  = document.getElementById('ajuste-buscar-input');
const ajusteResultados   = document.getElementById('ajuste-resultados');
const ajusteSeleccionadoDiv = document.getElementById('ajuste-seleccionado');
const ajusteStockActual  = document.getElementById('ajuste-stock-actual');
const ajusteStockReal    = document.getElementById('ajuste-stock-real');
const ajusteDifWrap      = document.getElementById('ajuste-diferencia-wrap');
const ajusteDifLabel     = document.getElementById('ajuste-diferencia-label');

function closeModalAjuste() {
    modalAjuste.close();
    formAjuste.reset();
    ajusteStockActual.value = '';
    ajusteDifWrap.style.display = 'none';
    ajusteBuscarInput.value = '';
    ajusteResultados.innerHTML = '';
    ajusteSeleccionadoDiv.style.display = 'none';
    _ajusteProductoSeleccionado = null;
}

btnAbrirAjuste.addEventListener('click', () => {
    modalAjuste.showModal();
    setTimeout(() => ajusteBuscarInput.focus(), 100);
});
btnAjusteCancel.addEventListener('click', closeModalAjuste);
modalAjuste.addEventListener('click', (e) => { if (e.target === modalAjuste) closeModalAjuste(); });

ajusteBuscarInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { ajusteResultados.innerHTML = ''; return; }
    ajusteResultados.innerHTML = allProducts
        .filter(p => p.active !== false && p.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(p => `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`)
        .join('');
});

ajusteResultados.addEventListener('click', async (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    _ajusteProductoSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    ajusteBuscarInput.value = item.dataset.name;
    ajusteResultados.innerHTML = '';
    document.getElementById('ajuste-nombre-prod').textContent = item.dataset.name;
    ajusteSeleccionadoDiv.style.display = 'block';
    ajusteStockActual.value = 'Cargando...';
    ajusteDifWrap.style.display = 'none';
    ajusteStockReal.value = '';
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('stock')
            .eq('id', parseInt(item.dataset.id))
            .single();
        ajusteStockActual.value = error ? '—' : (data.stock ?? 0);
    } catch {
        ajusteStockActual.value = '—';
    }
});

ajusteStockReal.addEventListener('input', () => {
    const actual = parseFloat(ajusteStockActual.value);
    const real   = parseFloat(ajusteStockReal.value);
    if (isNaN(actual) || isNaN(real) || ajusteStockReal.value === '') {
        ajusteDifWrap.style.display = 'none';
        return;
    }
    const dif = real - actual;
    ajusteDifWrap.style.display = '';
    if (dif === 0) {
        ajusteDifLabel.textContent = 'Sin diferencia (el stock no cambiara)';
        ajusteDifLabel.style.background = '#e9ecef';
        ajusteDifLabel.style.color = '#495057';
    } else if (dif > 0) {
        ajusteDifLabel.textContent = `\u25b2 Diferencia: +${dif} unidades (el stock aumentara)`;
        ajusteDifLabel.style.background = '#d4edda';
        ajusteDifLabel.style.color = '#155724';
    } else {
        ajusteDifLabel.textContent = `\u25bc Diferencia: ${dif} unidades (el stock disminuira)`;
        ajusteDifLabel.style.background = '#f8d7da';
        ajusteDifLabel.style.color = '#721c24';
    }
});

formAjuste.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId   = _ajusteProductoSeleccionado?.id || '';
    const productName = _ajusteProductoSeleccionado?.name || '';
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
        alert(`Ajuste realizado\n\n${productName}\n${stockAnterior} \u2192 ${stockNuevo} (${signo})`);

        invalidarProductos();
        await loadProducts();
        renderTable();
        closeModalAjuste();
    } catch (error) {
        console.error('Error en ajuste:', error);
        alert('Error al guardar el ajuste: ' + error.message);
    } finally {
        btnAjusteEnviar.disabled = false;
        btnAjusteEnviar.textContent = 'Guardar Ajuste';
    }
});
