import { supabase } from '../Api/supabaseConfig.js';
import { getProductos } from '../Shared/productosService.js';
import { CargarHeader, CargarSidebar, capitalizarSede, mostrarBannerRecarga } from '../Shared/components.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { ejecutarOrdenProduccion, ejecutarOrdenProduccionMulti } from './inventoryService.js';
import { initColumnFilters } from '../Shared/tableFilters.js';
CargarSidebar();

let usuarioActual    = 'Admin';
let allProductos     = [];
let allOrdenes       = [];
let currentTipo      = null;
let _applyOrdFilters = () => {};

// ── Tipos de produccion rapida ─────────────────────────────────────────────────
// multi:true → modal muestra una fila por referencia en lugar de un solo campo de cantidad
const PROD_TIPOS = {
    napolitana: {
        label:            'Napolitana',
        productoSalidaId: '35',
        unidad:           'frascos',
        ingredientes: [
            { id: '100' },  // Aceite Riquisimo
            { id: '138' },  // Ajo Pelado
            { id: '105' },  // Pasta de Tomate Heinz
            { id: '102' },  // Mantequilla la Fina
            { id: '388', editableCosto: true },  // Vegetales Napolitana
        ],
    },
    piña: {
        label:            'Piña Calada',
        nombreAlmacenado: 'Piña',
        productoSalidaId: '82',
        unidad:           'frascos',
        ingredientes: [
            { id: '68'   },  // Panela
            { id: '92'   },  // Azúcar Morena
            { id: '1570', editableCosto: true },  // Piña Fresca
        ],
    },
    tartara: {
        label:            'Tártara',
        productoSalidaId: '144',
        unidad:           'frascos',
        ingredientes: [
            { id: '1572', editableCosto: true },            // Vegetales Tártara
            { id: '25',  soloProduccion: true },         // Vinagre Blanco (costo sin descontar stock)
            { id: '87',  soloProduccion: true },         // Sal Refisal (costo sin descontar stock)
        ],
    },
    pollo: {
        label:            'Pollo Desmechado',
        productoSalidaId: '46',
        unidad:           'bolsas',
        ingredientes:     [
            { id: '1571' },  // Recorte de Pechuga
        ],
        mermaConfig:      { pesoSalidaKg: 2.5 },
    },
    masa: {
        label:       'Masa',
        multi:       true,
        ingredientes: [
            { id: '149' },  // Harina de Trigo
            { id: '87'  },  // Sal Refisal
            { id: '101' },  // Aceite Salomón
            { id: '104' },  // Margarina Industrial
        ],
        referencias: [
            { label: 'Masa × 140gr', productoSalidaId: '160' },
            { label: 'Masa × 350gr', productoSalidaId: '2'   },
            { label: 'Masa × 450gr', productoSalidaId: '13'  },
            { label: 'Masa × 700gr', productoSalidaId: '24'  },
        ],
    },
};

// ── Auth guard ────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, sede }) => {
    usuarioActual = username;
    CargarHeader(capitalizarSede(sede));
    document.getElementById('ord-f-responsable').value = usuarioActual;
    document.getElementById('ord-f-fecha').value = toInputDate(new Date());
    [allProductos, allOrdenes] = await Promise.all([getProductos(), loadOrdenes()]);
    _applyOrdFilters = initColumnFilters('ord-tbody', {
        0: 'N° orden',
        1: 'Nombre',
        2: 'Producto',
        6: { type: 'date' },
    });
    renderTable();
    setupEventListeners();
    document.body.classList.add('loaded');
    setTimeout(() => {
        supabase.channel('ord-ordenes-ext')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes_produccion' }, mostrarBannerRecarga)
            .subscribe();
    }, 5000);
});

// ── Supabase ──────────────────────────────────────────────────────────────────
const _safeNum = v => { const n = +v; return (v != null && isFinite(n)) ? n : null; };

function normalizarOrden(row) {
    return {
        docId:             String(row.id),
        numero:            row.numero,
        nombre:            row.nombre,
        estado:            row.estado,
        responsable:       row.responsable,
        fecha:             row.fecha ? new Date(row.fecha) : null,
        materiales:        row.materiales || [],
        productoSalida:    row.producto_salida || null,
        costoTotal:        _safeNum(row.costo_total),
        costoUnitario:     _safeNum(row.costo_unitario),
        notas:             row.notas || '',
        creadoPor:         row.creado_por,
        fechaFinalizacion: row.fecha_finalizacion ? new Date(row.fecha_finalizacion) : null,
    };
}

async function loadOrdenes() {
    const { data, error } = await supabase
        .from('ordenes_produccion')
        .select('*')
        .order('id', { ascending: false });
    if (error) throw error;
    allOrdenes = (data || []).map(normalizarOrden);
    return allOrdenes;
}

async function getSiguienteNumero() {
    const { data, error } = await supabase.rpc('siguiente_numero_orden');
    if (error) throw error;
    return data;
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderTable() {
    const estado = document.getElementById('ord-filter-estado').value;

    const filtered = allOrdenes.filter(o => {
        if (estado && o.estado !== estado) return false;
        return true;
    });

    document.getElementById('ord-count').textContent = `${filtered.length} orden(es)`;
    const tbody = document.getElementById('ord-tbody');
    tbody.innerHTML = '';

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="ap-loading">No hay órdenes</td></tr>';
        return;
    }

    filtered.forEach(o => {
        const isMulti    = Array.isArray(o.productoSalida);
        const prodNombre = isMulti ? escHtml(o.nombre.replace('Producción ', '')) : escHtml(o.productoSalida?.productoNombre || '—');
        const prodCant   = isMulti ? '—' : (o.productoSalida?.cantidad ?? '—');

        const tr = document.createElement('tr');
        tr.className = 'inventory-management__row';
        tr.innerHTML = `
            <td class="ap-col-num inventory-management__cell">${o.numero}</td>
            <td class="inventory-management__cell">${escHtml(o.nombre)}</td>
            <td class="inventory-management__cell">${prodNombre}</td>
            <td class="ap-col-num inventory-management__cell">${prodCant}</td>
            <td class="ap-col-num inventory-management__cell">${o.costoUnitario != null ? '$' + Number(o.costoUnitario).toFixed(0) : '—'}</td>
            <td class="inventory-management__cell">${escHtml(o.responsable)}</td>
            <td class="inventory-management__cell">${formatFecha(o.fecha)}<span style="display:none">${o.fecha ? toInputDate(o.fecha) : ''}</span></td>
            <td class="ap-col-center inventory-management__cell">${badgeEstado(o.estado)}</td>
            <td class="ap-col-center inventory-management__cell" style="display:flex;gap:.4rem;justify-content:center;padding:.6rem">
                ${o.estado === 'en_proceso' ? `
                    <button class="ap-btn ap-btn--primary ord-btn-finalizar" title="Finalizar orden">Finalizar</button>
                    <button class="ap-btn ap-btn--danger ord-btn-cancelar" title="Cancelar orden">Cancelar</button>
                ` : ''}
            </td>
        `;
        tr.addEventListener('click', e => { if (!e.target.closest('button')) openDetalle(o); });
        tr.querySelector('.ord-btn-finalizar')?.addEventListener('click', () => confirmarFinalizar(o));
        tr.querySelector('.ord-btn-cancelar')?.addEventListener('click',  () => confirmarCancelar(o));
        tbody.appendChild(tr);
    });
    _applyOrdFilters();
}

function badgeEstado(estado) {
    const map = {
        en_proceso: ['ord-badge--proceso',    'En proceso'],
        finalizado: ['ord-badge--finalizado', 'Finalizado'],
        cancelado:  ['ord-badge--cancelado',  'Cancelado'],
    };
    const [cls, label] = map[estado] || ['', estado];
    return `<span class="ord-badge ${cls}">${label}</span>`;
}

// ── Modal produccion rapida ───────────────────────────────────────────────────
function openModalRapido(tipoKey) {
    const tipo = PROD_TIPOS[tipoKey];
    if (!tipo) return;
    currentTipo = tipo;

    document.getElementById('prd-title').textContent = `Produccion ${tipo.label}`;
    document.getElementById('prd-fecha').value = toInputDate(new Date());
    document.getElementById('prd-error').textContent = '';
    document.getElementById('prd-extra-tbody').innerHTML = '';
    document.getElementById('prd-extra-table').style.display = 'none';

    // Modo multi (masas): ocultar campo cantidad simple, mostrar tabla de referencias
    const isMulti = !!tipo.multi;
    document.getElementById('prd-cant-wrap').style.display   = isMulti ? 'none' : '';
    document.getElementById('prd-multi-section').style.display = isMulti ? ''     : 'none';

    if (isMulti) {
        document.getElementById('prd-cant').value = '';
        const multiTbody = document.getElementById('prd-multi-tbody');
        multiTbody.innerHTML = '';
        tipo.referencias.forEach(ref => {
            const prod = allProductos.find(p => String(p.id) === ref.productoSalidaId);
            const tr = document.createElement('tr');
            tr.className          = 'prd-multi-row';
            tr.dataset.prodId     = ref.productoSalidaId;
            tr.dataset.prodNombre = prod?.name ?? ref.label;
            tr.innerHTML = `
                <td>${escHtml(prod?.name ?? ref.label)}</td>
                <td><input class="ap-input prd-multi-cant" type="number" min="0" step="1" placeholder="0" style="max-width:100px;"></td>
            `;
            multiTbody.appendChild(tr);
        });
    } else {
        document.getElementById('prd-cant').value = '';
        document.getElementById('prd-cant-label').textContent = tipo.mermaConfig
            ? `Bolsas completas producidas *`
            : `Cantidad producida (${tipo.unidad}) *`;
    }

    // Gramos sobrantes y merma (solo para tipos con mermaConfig)
    const hasGramos = !!tipo.mermaConfig;
    document.getElementById('prd-gramos-wrap').style.display = hasGramos ? '' : 'none';
    document.getElementById('prd-gramos').value = '';
    document.getElementById('prd-merma').style.display = 'none';

    // Filas de ingredientes fijos
    const fixedTbody = document.getElementById('prd-fixed-tbody');
    fixedTbody.innerHTML = '';
    tipo.ingredientes.forEach(ing => {
        const prod = ing.id
            ? allProductos.find(p => String(p.id) === String(ing.id))
            : allProductos.find(p => p.name.toLowerCase().includes(ing.buscar.toLowerCase()));
        const tr   = document.createElement('tr');
        tr.className               = 'prd-fixed-row';
        tr.dataset.prodId          = prod?.id    ?? '';
        const ingFallback          = ing.id ? `(ID ${ing.id})` : (ing.buscar ?? '?');
        tr.dataset.prodNombre      = prod?.name  ?? ingFallback;
        tr.dataset.prodCosto       = prod?.price ?? 0;
        tr.dataset.soloProduccion  = ing.soloProduccion ? '1' : '';
        const costoCell = ing.editableCosto
            ? `<input class="ap-input prd-fixed-costo" type="number" min="0" step="1" value="${prod?.price ?? ''}" placeholder="$ costo" style="max-width:110px;">`
            : (prod?.price ? '$' + Number(prod.price).toLocaleString('es-CO') : '—');
        tr.innerHTML = `
            <td>${escHtml(prod?.name ?? ingFallback)}</td>
            <td><input class="ap-input prd-fixed-cant" type="number" min="0" step="any" placeholder="0" style="max-width:90px;"></td>
            <td class="ap-col-num">${costoCell}</td>
        `;
        tr.querySelector('.prd-fixed-cant').addEventListener('input', calcularCostosPrd);
        if (ing.editableCosto) {
            const costoInput = tr.querySelector('.prd-fixed-costo');
            costoInput.addEventListener('input', () => {
                tr.dataset.prodCosto = parseFloat(costoInput.value) || 0;
                calcularCostosPrd();
            });
        }
        fixedTbody.appendChild(tr);
    });
    document.getElementById('prd-fixed-section').style.display =
        tipo.ingredientes.length ? '' : 'none';

    calcularCostosPrd();
    document.getElementById('prod-modal-rapido').showModal();
}

function addExtraIngRow() {
    const tbody = document.getElementById('prd-extra-tbody');
    const table = document.getElementById('prd-extra-table');
    table.style.display = '';

    const tr = document.createElement('tr');
    tr.className = 'prd-extra-row';
    tr.innerHTML = `
        <td style="position:relative">
            <input class="ap-input prd-extra-buscar" type="text" placeholder="Buscar producto..." autocomplete="off">
            <input type="hidden" class="prd-extra-id">
            <input type="hidden" class="prd-extra-precio" value="0">
            <div class="ord-autocomplete prd-extra-drop"></div>
        </td>
        <td><input class="ap-input prd-extra-cant" type="number" min="0.001" step="0.001" placeholder="0" style="max-width:90px;"></td>
        <td class="ap-col-num prd-extra-costo-cell">—</td>
        <td class="ap-col-num prd-extra-sub">$0</td>
        <td><button type="button" class="ap-btn ap-btn--danger prd-extra-remove">✕</button></td>
    `;

    const buscar      = tr.querySelector('.prd-extra-buscar');
    const idInput     = tr.querySelector('.prd-extra-id');
    const precioInput = tr.querySelector('.prd-extra-precio');
    const cantInput   = tr.querySelector('.prd-extra-cant');
    const costoCell   = tr.querySelector('.prd-extra-costo-cell');
    const subCell     = tr.querySelector('.prd-extra-sub');
    const drop        = tr.querySelector('.prd-extra-drop');

    setupAutocompleteProd(buscar, drop, idInput, prod => {
        precioInput.value = prod.price ?? 0;
        costoCell.textContent = prod.price ? '$' + Number(prod.price).toLocaleString('es-CO') : '—';
        subCell.textContent = '$' + ((parseFloat(cantInput.value) || 0) * (prod.price ?? 0)).toLocaleString('es-CO');
        calcularCostosPrd();
    });

    cantInput.addEventListener('input', () => {
        const cant   = parseFloat(cantInput.value)   || 0;
        const precio = parseFloat(precioInput.value) || 0;
        subCell.textContent = '$' + (cant * precio).toLocaleString('es-CO');
        calcularCostosPrd();
    });

    tr.querySelector('.prd-extra-remove').addEventListener('click', () => {
        tr.remove();
        if (!tbody.children.length) table.style.display = 'none';
        calcularCostosPrd();
    });

    tbody.appendChild(tr);
}

function calcularCostosPrd() {
    let total = 0;

    document.querySelectorAll('.prd-fixed-row').forEach(row => {
        total += (parseFloat(row.querySelector('.prd-fixed-cant').value) || 0)
               * (parseFloat(row.dataset.prodCosto) || 0);
    });
    document.querySelectorAll('.prd-extra-row').forEach(row => {
        total += (parseFloat(row.querySelector('.prd-extra-cant').value)   || 0)
               * (parseFloat(row.querySelector('.prd-extra-precio').value) || 0);
    });

    // Para el costo por unidad: suma de todas las cantidades de salida
    let cantSalida = parseFloat(document.getElementById('prd-cant').value) || 0;
    document.querySelectorAll('.prd-multi-cant').forEach(inp => {
        cantSalida += parseFloat(inp.value) || 0;
    });
    const costoPorU = cantSalida > 0 ? total / cantSalida : 0;
    document.getElementById('prd-costo-total').textContent  = '$' + total.toLocaleString('es-CO');
    document.getElementById('prd-costo-unidad').textContent = '$' + costoPorU.toFixed(2);

    // Merma en tiempo real (solo para tipos con mermaConfig)
    const mermaEl = document.getElementById('prd-merma');
    if (currentTipo?.mermaConfig) {
        const { pesoSalidaKg } = currentTipo.mermaConfig;
        const inputKg  = [...document.querySelectorAll('.prd-fixed-row')]
            .reduce((s, row) => s + (parseFloat(row.querySelector('.prd-fixed-cant').value) || 0), 0);
        const bolsas   = parseFloat(document.getElementById('prd-cant').value)   || 0;
        const gramos   = parseFloat(document.getElementById('prd-gramos').value) || 0;
        const outputKg = bolsas * pesoSalidaKg + gramos / 1000;
        const mermaKg  = inputKg - outputKg;
        const mermaPct = inputKg > 0 ? mermaKg / inputKg * 100 : 0;
        document.getElementById('prd-merma-kg').textContent =
            mermaKg.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' kg';
        document.getElementById('prd-merma-pct').textContent =
            inputKg > 0 ? `(${mermaPct.toFixed(1)}%)` : '';
        mermaEl.style.display = inputKg > 0 || bolsas > 0 ? '' : 'none';
    } else {
        mermaEl.style.display = 'none';
    }
}

// ── Guardar produccion rapida ─────────────────────────────────────────────────
async function guardarProduccionRapida() {
    const errEl = document.getElementById('prd-error');
    errEl.textContent = '';

    const fecha  = document.getElementById('prd-fecha').value;
    if (!fecha) { errEl.textContent = 'La fecha es obligatoria.'; return; }

    // Materiales comunes (fijos + extras)
    const materiales = leerMaterialesPrd();

    const tipo        = currentTipo;
    const tipoNombre  = `Producción ${tipo.nombreAlmacenado ?? tipo.label}`;

    const btn = document.getElementById('prd-btn-guardar');
    btn.disabled = true;

    try {
        if (tipo.multi) {
            // Recoger cantidades por referencia
            const refs = [];
            document.querySelectorAll('.prd-multi-row').forEach(row => {
                const cant = parseFloat(row.querySelector('.prd-multi-cant').value) || 0;
                if (cant > 0) refs.push({ prodId: row.dataset.prodId, prodNombre: row.dataset.prodNombre, cantidad: cant });
            });
            if (!refs.length) {
                errEl.textContent = 'Ingresa al menos una cantidad mayor a 0.';
                btn.disabled = false;
                return;
            }
            // Array de productos salida
            const productosSalidaMasa = refs.map(ref => {
                const prod = allProductos.find(p => String(p.id) === ref.prodId);
                return { productoId: String(prod?.id ?? ref.prodId), productoNombre: prod?.name ?? ref.prodNombre, cantidad: ref.cantidad };
            });
            // Una sola orden con producto_salida como array
            const costoTotalMasa = materiales.reduce((s, m) => s + m.cantidad * m.costoUnitario, 0);
            const pedidoMasaId   = await crearPedidoPlantaProduccion({ nombre: tipoNombre, fecha, materiales, costoTotal: costoTotalMasa });
            const numeroMasa     = await getSiguienteNumero();
            const { data: masaRow, error: masaErr } = await supabase
                .from('ordenes_produccion')
                .insert({
                    numero:             numeroMasa,
                    nombre:             tipoNombre,
                    estado:             'finalizado',
                    responsable:        usuarioActual,
                    fecha:              new Date(fecha + 'T12:00:00').toISOString(),
                    materiales,
                    producto_salida:    productosSalidaMasa,
                    costo_total:        costoTotalMasa,
                    costo_unitario:     null,
                    creado_por:         usuarioActual,
                    creado_en:          new Date().toISOString(),
                    fecha_finalizacion: new Date().toISOString(),
                    pedido_planta_id:   pedidoMasaId,
                })
                .select('id').single();
            if (masaErr) throw masaErr;
            // Un solo movimiento con todas las referencias
            await ejecutarOrdenProduccionMulti({
                ordenId:         String(masaRow.id),
                ordenNumero:     numeroMasa,
                materiales,
                productosSalida: productosSalidaMasa,
                usuario:         usuarioActual,
            });
        } else {
            const cantSalida = parseFloat(document.getElementById('prd-cant').value) || 0;
            if (cantSalida <= 0) {
                errEl.textContent = 'La cantidad producida debe ser mayor a 0.';
                btn.disabled = false;
                return;
            }
            if (!materiales.length && tipo.ingredientes.length > 0) {
                errEl.textContent = 'Ingresa al menos un ingrediente con cantidad mayor a 0.';
                btn.disabled = false;
                return;
            }
            const prodSalida   = allProductos.find(p => String(p.id) === tipo.productoSalidaId);
            const gramosExtra  = tipo.mermaConfig
                ? (parseFloat(document.getElementById('prd-gramos').value) || 0)
                : 0;
            const notasOrden   = gramosExtra > 0 ? `Gramos sobrantes: ${gramosExtra}g` : null;
            await _crearOrdenFinalizada({
                nombre: tipoNombre,
                fecha,
                materiales,
                productoSalida: {
                    productoId:     String(prodSalida?.id ?? tipo.productoSalidaId),
                    productoNombre: prodSalida?.name ?? tipo.label,
                    cantidad:       cantSalida,
                },
                notas: notasOrden,
            });
        }

        document.getElementById('prod-modal-rapido').close();
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        errEl.textContent = 'Error: ' + (e.message || e);
    } finally {
        btn.disabled = false;
    }
}

function leerMaterialesPrd() {
    const mat = [];
    document.querySelectorAll('.prd-fixed-row').forEach(row => {
        const cant  = parseFloat(row.querySelector('.prd-fixed-cant').value) || 0;
        const costo = parseFloat(row.dataset.prodCosto) || 0;
        const id    = row.dataset.prodId;
        const prod  = allProductos.find(p => String(p.id) === String(id));
        if (cant > 0) mat.push({ productoId: id, productoNombre: row.dataset.prodNombre, cantidad: cant, costoUnitario: costo, soloProduccion: row.dataset.soloProduccion === '1' });
    });
    document.querySelectorAll('.prd-extra-row').forEach(row => {
        const id    = row.querySelector('.prd-extra-id').value;
        const nombre = row.querySelector('.prd-extra-buscar').value.trim();
        const cant  = parseFloat(row.querySelector('.prd-extra-cant').value)   || 0;
        const costo = parseFloat(row.querySelector('.prd-extra-precio').value) || 0;
        const prod  = allProductos.find(p => String(p.id) === String(id));
        if (id && cant > 0) mat.push({ productoId: id, productoNombre: nombre, cantidad: cant, costoUnitario: costo, soloProduccion: prod?.soloProduccion ?? false });
    });
    return mat;
}

async function _crearOrdenFinalizada({ nombre, fecha, materiales, productoSalida, deducirIngredientes = true, omitirCostoUnitario = false, pedidoExternoId = null, skipInventario = false, notas = null }) {
    const costoTotal    = materiales.reduce((s, m) => s + m.cantidad * m.costoUnitario, 0);
    const costoUnitario = omitirCostoUnitario ? null
        : (productoSalida.cantidad > 0 ? costoTotal / productoSalida.cantidad : 0);

    const numero = await getSiguienteNumero();
    const { data: newRow, error: insertError } = await supabase
        .from('ordenes_produccion')
        .insert({
            numero,
            nombre,
            estado:             'finalizado',
            responsable:        usuarioActual,
            fecha:              new Date(fecha + 'T12:00:00').toISOString(),
            materiales,
            producto_salida:    productoSalida,
            costo_total:        omitirCostoUnitario ? null : costoTotal,
            costo_unitario:     costoUnitario,
            notas,
            creado_por:         usuarioActual,
            creado_en:          new Date().toISOString(),
            fecha_finalizacion: new Date().toISOString(),
        })
        .select('id')
        .single();
    if (insertError) throw insertError;

    if (!skipInventario) {
        await ejecutarOrdenProduccion({
            ordenId:             String(newRow.id),
            ordenNumero:         numero,
            materiales,
            productoSalida,
            usuario:             usuarioActual,
            deducirIngredientes,
        });
    }

    const pedidoId = pedidoExternoId ?? await crearPedidoPlantaProduccion({ nombre, fecha, materiales, costoTotal });
    await supabase.from('ordenes_produccion')
        .update({ pedido_planta_id: pedidoId })
        .eq('id', newRow.id);

    return { ordenId: String(newRow.id), ordenNumero: numero };
}

// ── Modal nueva orden (personalizada) ─────────────────────────────────────────
function openNuevaOrden() {
    document.getElementById('ord-form').reset();
    document.getElementById('ord-f-responsable').value = usuarioActual;
    document.getElementById('ord-f-fecha').value = toInputDate(new Date());
    document.getElementById('ord-mat-tbody').innerHTML = '';
    document.getElementById('ord-modal-error').textContent = '';
    addMaterialRow();
    calcularCostos();
    document.getElementById('ord-modal').showModal();
}

// ── Filas dinamicas de materiales (modal completo) ────────────────────────────
function addMaterialRow() {
    const tbody = document.getElementById('ord-mat-tbody');
    const tr = document.createElement('tr');
    tr.className = 'ord-mat-row';
    tr.innerHTML = `
        <td style="position:relative">
            <input class="ap-input ord-mat-buscar" type="text" placeholder="Buscar producto..." autocomplete="off">
            <input type="hidden" class="ord-mat-id">
            <div class="ord-autocomplete ord-mat-drop"></div>
        </td>
        <td><input class="ap-input ord-mat-cant"  type="number" min="0.001" step="0.001" placeholder="0"></td>
        <td><input class="ap-input ord-mat-costo" type="number" min="0"     step="1"     placeholder="0"></td>
        <td class="ord-mat-subtotal ap-col-num">$0</td>
        <td><button type="button" class="ap-btn ap-btn--danger ord-mat-remove">✕</button></td>
    `;

    const buscar     = tr.querySelector('.ord-mat-buscar');
    const idInput    = tr.querySelector('.ord-mat-id');
    const drop       = tr.querySelector('.ord-mat-drop');
    const cantInput  = tr.querySelector('.ord-mat-cant');
    const costoInput = tr.querySelector('.ord-mat-costo');
    const subtotal   = tr.querySelector('.ord-mat-subtotal');

    setupAutocompleteProd(buscar, drop, idInput, prod => {
        if (prod.price != null) {
            costoInput.value = prod.price;
            subtotal.textContent = '$' + ((parseFloat(cantInput.value) || 0) * prod.price).toLocaleString('es-CO');
            calcularCostos();
        }
    });

    [cantInput, costoInput].forEach(el => el.addEventListener('input', () => {
        const cant  = parseFloat(cantInput.value)  || 0;
        const costo = parseFloat(costoInput.value) || 0;
        subtotal.textContent = '$' + (cant * costo).toLocaleString('es-CO');
        calcularCostos();
    }));

    tr.querySelector('.ord-mat-remove').addEventListener('click', () => { tr.remove(); calcularCostos(); });
    tbody.appendChild(tr);
}

// ── Autocomplete generico ─────────────────────────────────────────────────────
function setupAutocompleteProd(input, drop, idHidden, onSelect = null) {
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        drop.innerHTML = '';
        if (!q) { drop.style.display = 'none'; return; }
        const matches = allProductos.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
        if (!matches.length) { drop.style.display = 'none'; return; }
        drop.style.display = 'block';
        matches.forEach(p => {
            const item = document.createElement('div');
            item.className   = 'ord-autocomplete-item';
            item.textContent = `${p.name}  (stock: ${p.stock ?? 0} ${p.unidad || ''})`;
            item.addEventListener('mousedown', () => {
                input.value    = p.name;
                idHidden.value = p.id;
                drop.style.display = 'none';
                if (onSelect) onSelect(p);
            });
            drop.appendChild(item);
        });
    });
    input.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 150));
}

// ── Calculo en tiempo real (modal completo) ───────────────────────────────────
function calcularCostos() {
    let costoTotal = 0;
    document.querySelectorAll('.ord-mat-row').forEach(row => {
        costoTotal += (parseFloat(row.querySelector('.ord-mat-cant').value)  || 0)
                    * (parseFloat(row.querySelector('.ord-mat-costo').value) || 0);
    });
    const cantSalida = parseFloat(document.getElementById('ord-f-salida-cant').value) || 0;
    const costoU     = cantSalida > 0 ? costoTotal / cantSalida : 0;
    document.getElementById('ord-costo-total').textContent  = '$' + costoTotal.toLocaleString('es-CO');
    document.getElementById('ord-costo-unidad').textContent = '$' + costoU.toFixed(2);
}

// ── Lectura y validacion del formulario (modal completo) ──────────────────────
function leerFormulario() {
    const nombre      = document.getElementById('ord-f-nombre').value.trim();
    const responsable = document.getElementById('ord-f-responsable').value.trim();
    const fechaStr    = document.getElementById('ord-f-fecha').value;
    const notas       = document.getElementById('ord-f-notas').value.trim();
    const salidaId    = document.getElementById('ord-f-salida-id').value;
    const salidaNombre= document.getElementById('ord-f-salida-buscar').value.trim();
    const salidaCant  = parseFloat(document.getElementById('ord-f-salida-cant').value) || 0;

    const materiales = [];
    document.querySelectorAll('.ord-mat-row').forEach(row => {
        const id    = row.querySelector('.ord-mat-id').value;
        const nom   = row.querySelector('.ord-mat-buscar').value.trim();
        const cant  = parseFloat(row.querySelector('.ord-mat-cant').value)  || 0;
        const costo = parseFloat(row.querySelector('.ord-mat-costo').value) || 0;
        const prod  = allProductos.find(p => p.id === id);
        if (id && nom && cant > 0) materiales.push({ productoId: id, productoNombre: nom, cantidad: cant, costoUnitario: costo, soloProduccion: prod?.soloProduccion ?? false });
    });

    return { nombre, responsable, fechaStr, notas, salidaId, salidaNombre, salidaCant, materiales };
}

function validar(data) {
    if (!data.nombre)             return 'El nombre de la orden es obligatorio.';
    if (!data.responsable)        return 'El responsable es obligatorio.';
    if (!data.fechaStr)           return 'La fecha es obligatoria.';
    if (!data.materiales.length)  return 'Agrega al menos una materia prima con cantidad mayor a 0.';
    if (!data.salidaId)           return 'Selecciona el producto generado.';
    if (data.salidaCant <= 0)     return 'La cantidad del producto generado debe ser mayor a 0.';
    return null;
}

// ── Crear pedido_planta automatico ────────────────────────────────────────────
async function crearPedidoPlantaProduccion({ nombre, fecha, materiales, costoTotal }) {
    const { data: nuevoId, error: seqErr } = await supabase.rpc('siguiente_id_pedido');
    if (seqErr) throw seqErr;

    const products = materiales.map(m => ({
        idProduct: String(m.productoId),
        name:      m.productoNombre,
        quantity:  m.cantidad,
    }));

    const { error } = await supabase.from('pedidos_planta').insert({
        id_pedido:     nuevoId,
        user_sede:     'Planta Producción',
        delivery_date: fecha,
        products,
        net_cost:      costoTotal,
        total:         costoTotal,
        recargo:       0,
        order_notes:   nombre,
        status:        'entregado',
        order_date:    new Date().toISOString(),
        eliminado:     false,
        updated_at:    new Date().toISOString(),
    });
    if (error) throw error;
    return nuevoId;
}

// ── Guardar orden (modal completo) ────────────────────────────────────────────
async function guardarOrden(finalizar) {
    const errEl = document.getElementById('ord-modal-error');
    errEl.textContent = '';
    const data = leerFormulario();
    const err  = validar(data);
    if (err) { errEl.textContent = err; return; }

    const costoTotal    = data.materiales.reduce((s, m) => s + m.cantidad * m.costoUnitario, 0);
    const costoUnitario = data.salidaCant > 0 ? costoTotal / data.salidaCant : 0;

    setBtnsDisabled(true);
    try {
        const numero = await getSiguienteNumero();
        const productoSalida = { productoId: data.salidaId, productoNombre: data.salidaNombre, cantidad: data.salidaCant };
        const insertData = {
            numero,
            nombre:          data.nombre,
            estado:          finalizar ? 'finalizado' : 'en_proceso',
            responsable:     data.responsable,
            fecha:           new Date(data.fechaStr + 'T12:00:00').toISOString(),
            materiales:      data.materiales,
            producto_salida: productoSalida,
            costo_total:     costoTotal,
            costo_unitario:  costoUnitario,
            notas:           data.notas || null,
            creado_por:      usuarioActual,
            creado_en:       new Date().toISOString(),
        };
        if (finalizar) insertData.fecha_finalizacion = new Date().toISOString();

        const { data: newRow, error: insertError } = await supabase
            .from('ordenes_produccion').insert(insertData).select('id').single();
        if (insertError) throw insertError;

        if (finalizar) {
            await ejecutarOrdenProduccion({
                ordenId: String(newRow.id), ordenNumero: numero,
                materiales: data.materiales, productoSalida, usuario: usuarioActual,
            });
            const pedidoId = await crearPedidoPlantaProduccion({
                nombre: data.nombre, fecha: data.fechaStr, materiales: data.materiales, costoTotal,
            });
            await supabase.from('ordenes_produccion').update({ pedido_planta_id: pedidoId }).eq('id', newRow.id);
        }

        document.getElementById('ord-modal').close();
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        errEl.textContent = 'Error: ' + (e.message || e);
    } finally {
        setBtnsDisabled(false);
    }
}

function setBtnsDisabled(val) {
    document.getElementById('ord-btn-guardar-proceso').disabled   = val;
    document.getElementById('ord-btn-guardar-finalizar').disabled = val;
}

// ── Finalizar orden existente (en_proceso → finalizado) ───────────────────────
async function confirmarFinalizar(orden) {
    if (!confirm(`¿Finalizar la orden "${orden.nombre}"?\n\nEsto descontará los materiales del inventario y sumará el producto generado.`)) return;
    try {
        await ejecutarOrdenProduccion({
            ordenId: orden.docId, ordenNumero: orden.numero,
            materiales: orden.materiales, productoSalida: orden.productoSalida, usuario: usuarioActual,
        });
        const costoTotal = (orden.materiales || []).reduce((s, m) => s + m.cantidad * (m.costoUnitario || 0), 0);
        const pedidoId   = await crearPedidoPlantaProduccion({
            nombre:     orden.nombre,
            fecha:      orden.fecha ? toInputDate(orden.fecha) : toInputDate(new Date()),
            materiales: orden.materiales,
            costoTotal,
        });
        const { error: updError } = await supabase
            .from('ordenes_produccion')
            .update({ estado: 'finalizado', fecha_finalizacion: new Date().toISOString(), pedido_planta_id: pedidoId })
            .eq('id', orden.docId);
        if (updError) throw updError;
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        alert('Error al finalizar: ' + (e.message || e));
    }
}

// ── Cancelar orden ────────────────────────────────────────────────────────────
async function confirmarCancelar(orden) {
    if (!confirm(`¿Cancelar la orden "${orden.nombre}"?\n\nNo se modificará el inventario.`)) return;
    try {
        const { error: updError } = await supabase
            .from('ordenes_produccion')
            .update({ estado: 'cancelado', cancelado_por: usuarioActual, cancelado_en: new Date().toISOString() })
            .eq('id', orden.docId);
        if (updError) throw updError;
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        alert('Error al cancelar: ' + (e.message || e));
    }
}

// ── Modal detalle ─────────────────────────────────────────────────────────────
function openDetalle(orden) {
    document.getElementById('ord-det-title').textContent = `Orden #${orden.numero} — ${orden.nombre}`;
    const fechaFin = orden.fechaFinalizacion;

    const filasMateria = (orden.materiales || []).map(m => `
        <tr>
            <td>${escHtml(m.productoNombre)}</td>
            <td class="ap-col-num">${m.cantidad}</td>
            <td class="ap-col-num">$${(m.costoUnitario || 0).toLocaleString('es-CO')}</td>
            <td class="ap-col-num">$${(m.cantidad * (m.costoUnitario || 0)).toLocaleString('es-CO')}</td>
        </tr>
    `).join('');

    document.getElementById('ord-det-body').innerHTML = `
        <div class="ord-det-grid">
            <div class="ord-det-item"><span class="ord-det-label">Estado</span>${badgeEstado(orden.estado)}</div>
            <div class="ord-det-item"><span class="ord-det-label">Responsable</span>${escHtml(orden.responsable)}</div>
            <div class="ord-det-item"><span class="ord-det-label">Fecha</span>${formatFecha(orden.fecha)}</div>
            ${fechaFin ? `<div class="ord-det-item"><span class="ord-det-label">Finalizado</span>${formatFecha(fechaFin)}</div>` : ''}
        </div>

        <div class="ord-section" style="margin-top:1.6rem">
            <span class="ord-section__title">Materias primas</span>
            <table class="ord-mat-table" style="margin-top:.8rem">
                <thead><tr>
                    <th style="width:44%">Producto</th>
                    <th style="width:16%">Cantidad</th>
                    <th style="width:20%">Costo unit.</th>
                    <th style="width:20%">Subtotal</th>
                </tr></thead>
                <tbody>${filasMateria}</tbody>
            </table>
        </div>

        <div class="ord-section" style="margin-top:1.2rem">
            <span class="ord-section__title">Producto generado</span>
            <div class="ord-det-grid" style="margin-top:.8rem">
                ${Array.isArray(orden.productoSalida)
                    ? orden.productoSalida.map(p => `
                        <div class="ord-det-item"><span class="ord-det-label">${escHtml(p.productoNombre)}</span>${p.cantidad}</div>
                    `).join('')
                    : `
                        <div class="ord-det-item"><span class="ord-det-label">Producto</span>${escHtml(orden.productoSalida?.productoNombre || '—')}</div>
                        <div class="ord-det-item"><span class="ord-det-label">Cantidad</span>${orden.productoSalida?.cantidad ?? '—'}</div>
                    `
                }
            </div>
        </div>

        <div class="ord-costos" style="margin-top:1.4rem">
            <span>Costo total: <strong>$${(orden.costoTotal || 0).toLocaleString('es-CO')}</strong></span>
            <span>Costo por unidad: <strong>$${(orden.costoUnitario || 0).toFixed(2)}</strong></span>
        </div>

        ${orden.notas ? `<p style="margin-top:1.2rem;font-size:1.3rem"><strong>Notas:</strong> ${escHtml(orden.notas)}</p>` : ''}
    `;
    document.getElementById('ord-modal-detalle').showModal();
}

// ── Event listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    // Tarjetas de produccion rapida
    document.getElementById('ord-tipos-cards').addEventListener('click', e => {
        const card = e.target.closest('.ord-tipo-card');
        if (card) openModalRapido(card.dataset.tipo);
    });
    document.getElementById('prd-btn-cancelar').addEventListener('click', () =>
        document.getElementById('prod-modal-rapido').close());
    document.getElementById('prd-btn-guardar').addEventListener('click', guardarProduccionRapida);
    document.getElementById('prd-btn-agregar-extra').addEventListener('click', addExtraIngRow);
    document.getElementById('prd-cant').addEventListener('input', calcularCostosPrd);
    document.getElementById('prd-gramos').addEventListener('input', calcularCostosPrd);

    // Modal orden personalizada
    document.getElementById('ord-btn-nuevo').addEventListener('click', openNuevaOrden);
    document.getElementById('ord-btn-cancelar-modal').addEventListener('click', () =>
        document.getElementById('ord-modal').close());
    document.getElementById('ord-det-cerrar').addEventListener('click', () =>
        document.getElementById('ord-modal-detalle').close());
    document.getElementById('ord-btn-agregar-mat').addEventListener('click', addMaterialRow);
    document.getElementById('ord-form').addEventListener('submit', e => { e.preventDefault(); guardarOrden(false); });
    document.getElementById('ord-btn-guardar-finalizar').addEventListener('click', () => guardarOrden(true));
    document.getElementById('ord-f-salida-cant').addEventListener('input', calcularCostos);
    setupAutocompleteProd(
        document.getElementById('ord-f-salida-buscar'),
        document.getElementById('ord-f-salida-drop'),
        document.getElementById('ord-f-salida-id')
    );

    // Cerrar dialogs al hacer click en el backdrop (mismo patron que dashboard.js)
    ['prod-modal-rapido', 'ord-modal', 'ord-modal-detalle'].forEach(id => {
        document.getElementById(id).addEventListener('click', e => {
            if (e.target === e.currentTarget) e.currentTarget.close();
        });
    });

    // Filtros de tabla
    const estadoEl = document.getElementById('ord-filter-estado');
    estadoEl.addEventListener('change', renderTable);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toInputDate(d) { return d.toISOString().slice(0, 10); }
function formatFecha(d) {
    if (!d || isNaN(d)) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escHtml(str = '') {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
