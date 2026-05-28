import { supabase } from '../Api/supabaseConfig.js';
import { RECARGO_SERVICIO } from './planta.config.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { getProductos } from '../Shared/productosService.js';
import { registrarMovimiento } from './inventoryService.js';

// Estado del módulo
let productsData = [];
let sedeAsignada = null;
let usernameUsuario = '';
let sedesData = [];
let rolUsuario = '';

verificarAccesoPlanta(async ({ username, sede, rol }) => {
  rolUsuario = rol;
  try {
    await Promise.all([
      initializeForm({ username, sede, rol }),
      fetchProductsFromFirestore()
    ]);
    document.body.classList.add('loaded');
  } catch (error) {
    console.error("Error cargando datos:", error);
    document.body.classList.add('loaded');
  }
}, ['planta', 'admin', 'planta-admin', 'pizzeria']);

const productForm = document.getElementById('form');
const dayDeliveryInput = document.getElementById('day_delivery');

// ── Helpers de fecha ──────────────────────────────────────────────────────────
function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}
function formatFecha(date) {
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
}

const hoy = new Date();
const manana = new Date();
manana.setDate(manana.getDate() + 1);

// ── Modal bienvenida: fechas ──────────────────────────────────────────────────
document.getElementById('mb-fecha-hoy').textContent    = formatFecha(hoy);
document.getElementById('mb-fecha-manana').textContent = formatFecha(manana);

document.getElementById('mb-hoy').addEventListener('click', () => {
  dayDeliveryInput.value = toInputDate(hoy);
  document.getElementById('modal-bienvenida').close();
  mostrarContexto('hoy ' + formatFecha(hoy));
});
document.getElementById('mb-manana').addEventListener('click', () => {
  dayDeliveryInput.value = toInputDate(manana);
  document.getElementById('modal-bienvenida').close();
  mostrarContexto('mañana ' + formatFecha(manana));
});

function mostrarContexto(fechaTexto) {
  document.getElementById('bc-sede').textContent  = sedeAsignada?.toLowerCase();
  document.getElementById('bc-fecha').textContent = fechaTexto;
  document.getElementById('barra-contexto').style.display = 'flex';
  document.getElementById('instruccion-productos').style.display = 'block';
}

// ── Sedes ─────────────────────────────────────────────────────────────────────
const CACHE_SEDES_KEY = 'planta_sedes_sup';
const CACHE_SEDES_TTL = 60 * 60 * 1000; // 60 min

async function fetchSedesFromSupabase() {
  try {
    const raw = sessionStorage.getItem(CACHE_SEDES_KEY);
    if (raw) {
      const { t, data } = JSON.parse(raw);
      if (Date.now() - t < CACHE_SEDES_TTL) {
        sedesData.push(...data);
        return;
      }
      sessionStorage.removeItem(CACHE_SEDES_KEY);
    }
    const { data: rows, error } = await supabase
      .from('sedes')
      .select('*')
      .order('name');
    if (error) throw error;
    sedesData.push(...rows);
    sessionStorage.setItem(CACHE_SEDES_KEY, JSON.stringify({ t: Date.now(), data: rows }));
  } catch (e) {
    console.error("Error al obtener las sedes:", e);
  }
}

// ── Inicializar formulario (sede + usuario) ───────────────────────────────────
async function initializeForm({ username, sede, rol }) {
  const userSelect = document.getElementById('location');
  const esPlanta = rol === 'planta' || rol === 'admin' || rol === 'planta-admin';

  sedeAsignada    = esPlanta ? null : sede;
  usernameUsuario = username;

  await fetchSedesFromSupabase();

  userSelect.innerHTML = '<option value="" disabled selected>Seleccionar</option>';
  sedesData.forEach(s => {
    const option = document.createElement('option');
    option.value = s.name;
    option.textContent = s.name;
    if (!esPlanta && sedeAsignada && s.name.toLowerCase() === sedeAsignada.toLowerCase()) {
      option.selected = true;
    }
    userSelect.appendChild(option);
  });
  if (!esPlanta) userSelect.disabled = true;

  document.getElementById('mb-username').textContent = usernameUsuario;

  if (esPlanta) {
    // Reemplazar el texto estático de sede por un selector dentro del modal
    const mbSede = document.getElementById('mb-sede');
    mbSede.previousElementSibling.textContent = 'Selecciona la sede para iniciar con tu pedido:';

    const selectModal = document.createElement('select');
    selectModal.id = 'mb-sede-select';
    selectModal.className = 'ap-select';
    selectModal.style.cssText = 'margin-top:8px; width:100%; max-width:260px;';
    selectModal.innerHTML = '<option value="" disabled selected>Seleccionar sede</option>';
    sedesData.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = s.name.toLowerCase();
      selectModal.appendChild(opt);
    });
    mbSede.replaceWith(selectModal);

    // Bloquear fechas hasta elegir sede
    document.getElementById('mb-hoy').disabled = true;
    document.getElementById('mb-manana').disabled = true;

    selectModal.addEventListener('change', () => {
      sedeAsignada = selectModal.value.toLowerCase();
      userSelect.value = selectModal.value;
      document.getElementById('mb-hoy').disabled = false;
      document.getElementById('mb-manana').disabled = false;
    });
  } else {
    document.getElementById('mb-sede').textContent = sedeAsignada || '';
  }

  document.getElementById('modal-bienvenida').showModal();
}

// ── Categorías ────────────────────────────────────────────────────────────────
async function fetchCategoriasMap() {
  const CACHE_KEY = 'products_categorias';
  const TTL = 60 * 60 * 1000;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const { t, data } = JSON.parse(raw);
      if (Date.now() - t <= TTL) return data;
      sessionStorage.removeItem(CACHE_KEY);
    }
  } catch {}

  const { data: rows, error } = await supabase
    .from('categorias')
    .select('id_category, name')
    .order('name');
  if (error) throw new Error(error.message);
  const map = {};
  rows.forEach(row => { if (row.id_category) map[row.id_category] = row.name; });
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: map })); } catch {}
  return map;
}

// ── Productos ─────────────────────────────────────────────────────────────────
async function fetchProductsFromFirestore() {
    const productsContainer = document.getElementById('products-list')
    try {
        const productos = await getProductos()
        const filtrados = productos.filter(p => {
            const activo = p.active == null ? true : Boolean(p.active)
            const tieneStock = p.sinLimiteStock === true || (p.stock ?? 0) > 0
            return activo && tieneStock
        })
        filtrados.forEach(p => productsData.push({ ...p, docId: p.id }))
        const categoriasMap = await fetchCategoriasMap()
        CreateProductsForm(productsData, categoriasMap)
        document.body.classList.add('loaded')
        console.log('[productosService] Productos cargados:', productos.length, '| visibles:', filtrados.length)
    } catch (error) {
        console.error('Error al obtener los productos:', error)
        productsContainer.innerHTML = '<li>Error al cargar los productos.</li>'
    }
}

function CreateProductsForm(data, categoriasMap) {
  const container = document.getElementById('products-list');
  container.querySelectorAll('.category-accordion').forEach(el => el.remove());

  const grupos = {};
  const sinCategoria = [];

  data.forEach(product => {
    const nombreCat = categoriasMap[product.idCategory];
    if (nombreCat) {
      if (!grupos[nombreCat]) grupos[nombreCat] = [];
      grupos[nombreCat].push(product);
    } else {
      sinCategoria.push(product);
    }
  });

  const categoriasOrdenadas = Object.keys(grupos).sort();

  [...categoriasOrdenadas, ...(sinCategoria.length ? ['Sin categoría'] : [])].forEach(cat => {
    const productos = cat === 'Sin categoría' ? sinCategoria : grupos[cat];
    if (!productos || productos.length === 0) return;

    const li = document.createElement('li');
    li.className = 'category-accordion';
    li.innerHTML = `
      <button type="button" class="accordion-header">
        <span class="cat-badge" style="display:none">0</span>
        <span class="accordion-title">${cat}</span>
        <span class="accordion-count">${productos.length} producto${productos.length !== 1 ? 's' : ''}</span>
        <span class="accordion-chevron">▼</span>
      </button>
      <ul class="accordion-body"></ul>
    `;

    const esCarnes = cat.toLowerCase().includes('carne');
    const body = li.querySelector('.accordion-body');
    productos
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
      .forEach(product => body.appendChild(createProductElement(product, esCarnes)));
    li.querySelector('.accordion-header').addEventListener('click', () => li.classList.toggle('is-open'));

    container.appendChild(li);
  });
}

function createProductElement(product, esCarnes = false) {
  const li = document.createElement('li');
  li.className = 'product';

  const label = document.createElement('label');
  label.textContent = product.name;
  li.appendChild(label);

  const stock = parseInt(product.stock);
  const sinLimite = !!product.sinLimiteStock || esCarnes;

  if (product.quantities) {
    const values = typeof product.quantities === 'string'
      ? product.quantities.split(',').map(v => parseInt(v.trim())).filter(v => sinLimite || stock >= v)
      : [];
    li.appendChild(values.length > 0 ? createStepper(product, { values }) : createOutOfStockElement());
  } else if (sinLimite) {
    li.appendChild(createStepper(product));
  } else {
    li.appendChild(stock > 0 ? createStepper(product, { max: stock }) : createOutOfStockElement());
  }
  return li;
}

function createOutOfStockElement() {
  const span = document.createElement('span');
  span.className = 'out-of-stock';
  span.textContent = 'No disponible';
  return span;
}

// ── Stepper genérico ─────────────────────────────────────────────────────────
function createStepper(product, { max = Infinity, values = null } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'stepper';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'stepper__btn';
  btnMinus.textContent = '−';
  btnMinus.disabled = true;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'prod-qty-input';
  input.name = product.name;
  input.id = product.id_product;
  input.value = '0';
  input.min = '0';

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'stepper__btn';
  btnPlus.textContent = '+';

  function fireChange() {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (values && values.length > 0) {
    // Presentaciones: cicla entre [0, v1, v2, ...]
    input.readOnly = true;
    const allValues = [0, ...values];
    let idx = 0;

    btnPlus.disabled = allValues.length <= 1;

    btnMinus.addEventListener('click', () => {
      if (idx > 0) {
        idx--;
        input.value = allValues[idx];
        btnMinus.disabled = idx === 0;
        btnPlus.disabled = false;
        fireChange();
      }
    });

    btnPlus.addEventListener('click', () => {
      if (idx < allValues.length - 1) {
        idx++;
        input.value = allValues[idx];
        btnMinus.disabled = false;
        btnPlus.disabled = idx === allValues.length - 1;
        fireChange();
      }
    });

  } else {
    // Regular / sin límite: incrementa de 1 en 1
    if (max === 0) btnPlus.disabled = true;

    btnMinus.addEventListener('click', () => {
      const cur = parseInt(input.value) || 0;
      if (cur > 0) {
        input.value = cur - 1;
        btnMinus.disabled = cur - 1 === 0;
        btnPlus.disabled = false;
        fireChange();
      }
    });

    btnPlus.addEventListener('click', () => {
      const cur = parseInt(input.value) || 0;
      if (cur < max) {
        input.value = cur + 1;
        btnMinus.disabled = false;
        btnPlus.disabled = cur + 1 >= max;
        fireChange();
      }
    });

    input.addEventListener('input', () => {
      const val = Math.max(0, Math.min(parseInt(input.value) || 0, max === Infinity ? 9999 : max));
      input.value = val;
      btnMinus.disabled = val === 0;
      btnPlus.disabled = val >= max;
      fireChange();
    });
  }

  wrapper.appendChild(btnMinus);
  wrapper.appendChild(input);
  wrapper.appendChild(btnPlus);
  return wrapper;
}

// ── Botón dinámico + highlight de fila + badge por categoría ─────────────────
const btnContinuar = document.getElementById('btn_orders');
const barraContinuar = document.getElementById('barra-continuar');

function esProdQty(el) {
  return (el.tagName === 'SELECT' && el.name !== 'user') ||
         (el.tagName === 'INPUT' && el.type === 'number');
}

productForm.addEventListener('change', (e) => {
  const el = e.target;

  if (esProdQty(el)) {
    const fila = el.closest('li.product');
    const acordeon = el.closest('li.category-accordion');
    const seleccionado = el.value && el.value !== '0' && el.value !== '';

    // Highlight en la fila
    if (fila) fila.classList.toggle('is-selected', seleccionado);

    // Actualizar badge de la categoría
    if (acordeon) {
      const total = [...acordeon.querySelectorAll('.accordion-body select, .accordion-body input.prod-qty-input')]
        .filter(s => s.value && s.value !== '0' && s.value !== '').length;
      const badge = acordeon.querySelector('.cat-badge');
      if (badge) {
        badge.textContent = total;
        badge.style.display = total > 0 ? 'inline-flex' : 'none';
      }
    }
  }

  // Actualizar botón contador
  let count = 0;
  Array.from(productForm.elements).forEach(el => {
    if (esProdQty(el) && el.value && el.value !== '0' && el.value !== '') count++;
  });
  if (count === 0) {
    barraContinuar.style.display = 'none';
  } else {
    barraContinuar.style.display = 'flex';
    btnContinuar.textContent = count + (count === 1 ? ' producto seleccionado' : ' productos seleccionados') + ' · Continuar →';
  }
});

// ── Botón Continuar → Modal de confirmación ───────────────────────────────────
productForm.addEventListener('submit', function (event) {
  event.preventDefault();

  const selectedProducts = [];
  Array.from(productForm.elements).forEach(el => {
    if (!el.name || !el.value || el.value === '0' || el.value === '') return;
    if (el.name === 'user' || el.name === 'deliveryDate') return;

    const product = productsData.find(p => p.name && p.name.trim() === el.name.trim());
    if (product) {
      selectedProducts.push({
        idProduct: product.docId || '',
        name: el.name,
        quantity: parseInt(el.value),
        unitPrice: parseFloat(product.price) || 0,
        totalPrice: (parseFloat(product.price) || 0) * parseInt(el.value),
        measurementUnit: product.measurementUnit || ''
      });
    }
  });

  if (selectedProducts.length === 0) {
    alert('Selecciona al menos un producto antes de continuar.');
    return;
  }

  // Llenar lista del modal
  const lista = document.getElementById('mc-lista');
  lista.innerHTML = '';
  selectedProducts.forEach(p => {
    const li = document.createElement('li');
    li.className = 'mconfirm__item';
    li.innerHTML = '<span>' + p.name + '</span><strong>' + p.quantity + ' ' + p.measurementUnit + '</strong>';
    lista.appendChild(li);
  });

  const estaHoy = dayDeliveryInput.value === toInputDate(hoy);
  const diaRelativo = estaHoy ? 'hoy' : 'mañana';
  const fechaCompleta = formatFecha(estaHoy ? hoy : manana);
  document.getElementById('mc-info').innerHTML =
    'Confirma tu pedido para la sede <strong class="mc-resalte">' + sedeAsignada?.toLowerCase() + '</strong>' +
    ' para el día de ' + diaRelativo + ' <strong class="mc-resalte">' + fechaCompleta + '</strong>';

  // Guardar selección temporalmente
  productForm._selectedProducts = selectedProducts;

  // Resetear estado del modal
  document.getElementById('mc-form').style.display = '';
  document.getElementById('mc-success').style.display = 'none';
  document.getElementById('mc-obs').value = '';
  const btnEnviar = document.getElementById('mc-enviar');
  btnEnviar.disabled = false;
  btnEnviar.textContent = 'Enviar pedido';

  document.getElementById('modal-confirm').showModal();

  // Mostrar indicador de scroll si la lista tiene más contenido del visible
  const listaScroll = document.getElementById('mc-lista');
  const indicator = document.getElementById('scroll-indicator');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      indicator.style.opacity = listaScroll.scrollHeight > listaScroll.clientHeight ? '1' : '0';
    });
  });

  listaScroll.addEventListener('scroll', () => {
    const alFondo = listaScroll.scrollTop + listaScroll.clientHeight >= listaScroll.scrollHeight - 4;
    indicator.style.opacity = alFondo ? '0' : '1';
  }, { passive: true });
});

// Cerrar modal al hacer clic fuera
const modalConfirm = document.getElementById('modal-confirm');
modalConfirm.addEventListener('click', (e) => {
  if (e.target === modalConfirm) modalConfirm.close();
});

// ── Enviar pedido ─────────────────────────────────────────────────────────────
document.getElementById('mc-enviar').addEventListener('click', async () => {
  const btnEnviar = document.getElementById('mc-enviar');
  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Enviando...';

  try {
    const selectedProducts = productForm._selectedProducts
        .slice().sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    const obs = document.getElementById('mc-obs').value.trim();
    const netCost = selectedProducts.reduce((sum, p) => sum + p.totalPrice, 0);
    const total = netCost + (netCost * RECARGO_SERVICIO);

    const sedeDoc = sedesData.find(s => s.name && s.name.toLowerCase() === sedeAsignada.toLowerCase());

    const pedidoData = {
      user: sedeAsignada,
      deliveryDate: dayDeliveryInput.value,
      products: selectedProducts,
      netCost,
      total,
      recargo: netCost * RECARGO_SERVICIO,
      orderNotes: obs,
      idUser: sedeDoc ? (sedeDoc.id_user || null) : null,
      status: 'pendiente',
      orderDate: new Date().toISOString()
    };

    const { nuevoId, docId } = await saveOrderWithConsecutiveId(pedidoData);

    await registrarMovimiento({
      tipo: 'CREACION',
      entidad: 'Pedido',
      productoNombre: `Pedido #${nuevoId}`,
      productos: selectedProducts.map(p => ({
        productoId: p.idProduct,
        productoNombre: p.name,
        cantidad: p.quantity
      })),
      referenciaId: docId,
      pedidoNumero: nuevoId,
      motivo: `Creación de pedido – sede ${sedeAsignada}`,
      usuario: usernameUsuario
    });

    // Mostrar éxito dentro del modal
    document.getElementById('mc-form').style.display = 'none';
    document.getElementById('mc-npedido').textContent = nuevoId;
    document.getElementById('mc-success').style.display = 'flex';

    setTimeout(() => {
      document.getElementById('modal-confirm').close();
      window.location.href = (rolUsuario === 'planta' || rolUsuario === 'admin' || rolUsuario === 'planta-admin')
      ? './dashboard.html'
      : '../Pizzerias/pizzerias.html';
    }, 2500);

  } catch (error) {
    console.error("Error al enviar pedido:", error);
    alert('Error al enviar el pedido. Intenta de nuevo.');
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar pedido';
  }
});

// ── Crear pedido en Supabase con ID consecutivo atómico ───────────────────────
async function saveOrderWithConsecutiveId(pedidoData) {
  // Obtiene el siguiente id_pedido vía secuencia PostgreSQL (atómico)
  const { data: nuevoId, error: seqError } = await supabase.rpc('siguiente_id_pedido');
  if (seqError) throw seqError;

  const { data: newRow, error: insertError } = await supabase
    .from('pedidos_planta')
    .insert({
      id_pedido:     nuevoId,
      user_sede:     pedidoData.user,
      delivery_date: pedidoData.deliveryDate,
      products:      pedidoData.products,
      net_cost:      pedidoData.netCost,
      total:         pedidoData.total,
      recargo:       pedidoData.recargo,
      order_notes:   pedidoData.orderNotes || null,
      id_user:       pedidoData.idUser,
      status:        pedidoData.status,
      order_date:    pedidoData.orderDate,
      eliminado:     false,
      updated_at:    new Date().toISOString()
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  return { nuevoId, docId: String(newRow.id) };
}
