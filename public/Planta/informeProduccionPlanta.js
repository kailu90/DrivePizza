import { supabase } from '../Api/supabaseConfig.js';
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
let offsetDias = 0;

// ── Producción — productos a reportar (idProduct = String(id_product)) ────
const CATEGORIAS = [
    { label: 'Pollo Desmechado',      ids: new Set(['14']), factor: 5, unidad: 'libras'     },
    { label: 'Salami Zenú',           ids: new Set(['27']), factor: 2, unidad: 'barras'     },
    { label: 'Tártara',               ids: new Set(['77']), factor: 1, unidad: 'frascos'    },
];
const IDS_RELEVANTES = new Set(CATEGORIAS.flatMap(c => [...c.ids]));

// ── Siropes Artesanales ────────────────────────────────────────────────────
const SIROPES_CONFIG = [
    { label: 'Frutos Rojos',    id: '84', thLabel: 'Frutos<br><small>Rojos</small>'    },
    { label: 'Frutos Amarillos',id: '85', thLabel: 'Frutos<br><small>Amarillos</small>'},
    { label: 'Tamarindo',       id: '86', thLabel: 'Tama&shy;rindo'                    },
];
const SIROPES_IDS = new Set(SIROPES_CONFIG.map(s => s.id));

// ── Masas CC ───────────────────────────────────────────────────────────────
// Agrupado por idProduct para evitar inconsistencias de nombre entre pedidos
const MASAS_LABEL = { '9': 'MASA x 140gr', '10': 'MASA x 350gr', '11': 'MASA x 450gr', '12': 'MASA x 700gr' };
const MASAS_IDS   = new Set(Object.keys(MASAS_LABEL));
const SEDES_MASA = ['megamall', 'acropolis'];

// ── Carnes ─────────────────────────────────────────────────────────────────
// 148=Carne para moler · 149=Carne para desmechar · 150=Carne para hamburguesa · 151=Pechuga Pollo
const CARNES_CONFIG = [
    { label: 'Carne para moler (Murillo)',   id: '148', thLabel: 'Moler<br><small>(Murillo)</small>'   },
    { label: 'Carne para desmechar (Aleta)', id: '149', thLabel: 'Desmechar<br><small>(Aleta)</small>' },
    { label: 'Carne para hamburguesa',       id: '150', thLabel: 'Hambur&shy;guesa'                    },
    { label: 'Pechuga Pollo x 1000 Gr',     id: '151', thLabel: 'Pechuga<br><small>1000 Gr</small>'   },
];
const CARNES_IDS = new Set(CARNES_CONFIG.map(c => c.id));

// ── Helpers ────────────────────────────────────────────────────────────────
function getFecha(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLabel(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
}

function formatDia(isoStr) {
    const [y, m, d] = isoStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long'
    });
}

function normalizarSede(sede) {
    return (sede || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Carga y render ─────────────────────────────────────────────────────────
async function cargarInforme() {
    const content = document.getElementById('iprod-content');
    content.innerHTML = '<p class="inf-empty">Cargando...</p>';

    const fecha = getFecha(offsetDias);
    document.getElementById('iprod-fecha-label').textContent = formatLabel(fecha);
    document.getElementById('iprod-next').disabled = offsetDias >= 0;

    const dia = formatDia(fecha);

    try {
        const { data: rawPedidos, error } = await supabase
            .from('pedidos_planta')
            .select('user_sede, products')
            .eq('delivery_date', fecha)
            .eq('eliminado', false);

        if (error) throw error;

        const pedidos = (rawPedidos || [])
            .map(p => ({ user: p.user_sede, products: p.products }));

        if (pedidos.length === 0) {
            content.innerHTML = '<p class="inf-empty">Sin pedidos para esta fecha.</p>';
            return;
        }

        // ── Tabla 1: Producción ────────────────────────────────────────────
        const totales = Object.fromEntries(CATEGORIAS.map(c => [c.label, 0]));
        pedidos.forEach(p => {
            (p.products || []).forEach(item => {
                const id = String(item.idProduct || '');
                if (!IDS_RELEVANTES.has(id)) return;
                const cat = CATEGORIAS.find(c => c.ids.has(id));
                if (cat) totales[cat.label] += Number(item.quantity) || 0;
            });
        });

        const filasProduccion = CATEGORIAS.map(({ label, factor, unidad }) => {
            const bolsas = totales[label];
            const convertido = bolsas * factor;
            const display = bolsas === 0
                ? '—'
                : unidad ? `${convertido} ${unidad}` : convertido;
            return `<tr>
                <td>${label}</td>
                <td class="inf-cantidad ${bolsas === 0 ? 'inf-cantidad--zero' : ''}">${display}</td>
            </tr>`;
        }).join('');

        // ── Tabla 2: Masas CC ──────────────────────────────────────────────
        const masas = {};
        pedidos
            .filter(p => SEDES_MASA.includes(normalizarSede(p.user)))
            .forEach(p => {
                const sede = normalizarSede(p.user);
                (p.products || []).forEach(item => {
                    const id = String(item.idProduct || '');
                    if (!MASAS_IDS.has(id)) return;
                    if (!masas[id]) masas[id] = { megamall: 0, acropolis: 0 };
                    const cant = Number(item.quantity) || 0;
                    if (sede === 'megamall')  masas[id].megamall  += cant;
                    if (sede === 'acropolis') masas[id].acropolis += cant;
                });
            });

        // Ordenar por ID numérico para mantener orden: 140gr, 350gr, 450gr, 700gr
        const tiposMasa = Object.keys(masas).sort((a, b) => Number(a) - Number(b));
        let totalMM = 0, totalAC = 0;

        let filasMasa;
        if (tiposMasa.length === 0) {
            filasMasa = `<tr><td colspan="4" style="text-align:center;color:#999;padding:1.5rem">Sin masas para esta fecha</td></tr>`;
        } else {
            filasMasa = tiposMasa.map(id => {
                const { megamall, acropolis } = masas[id];
                const total = megamall + acropolis;
                totalMM += megamall;
                totalAC += acropolis;
                return `<tr>
                    <td>${MASAS_LABEL[id] || id}</td>
                    <td class="inf-cantidad ${megamall === 0 ? 'inf-cantidad--zero' : ''}">${megamall || '—'}</td>
                    <td class="inf-cantidad ${acropolis === 0 ? 'inf-cantidad--zero' : ''}">${acropolis || '—'}</td>
                    <td class="inf-cantidad inf-col-total">${total}</td>
                </tr>`;
            }).join('');
            filasMasa += `<tr class="inf-total-row">
                <td>Total</td>
                <td class="inf-cantidad">${totalMM}</td>
                <td class="inf-cantidad">${totalAC}</td>
                <td class="inf-cantidad">${totalMM + totalAC}</td>
            </tr>`;
        }

        // ── Tabla 3: Carnes por sede ───────────────────────────────────────────
        const carnesPorSede = {};
        const sedesConCarne = new Set();
        CARNES_CONFIG.forEach(c => { carnesPorSede[c.id] = {}; });

        pedidos.forEach(p => {
            const sede = normalizarSede(p.user);
            (p.products || []).forEach(item => {
                const id = String(item.idProduct || '');
                if (!CARNES_IDS.has(id)) return;
                const cant = Number(item.quantity) || 0;
                if (cant === 0) return;
                sedesConCarne.add(sede);
                carnesPorSede[id][sede] = (carnesPorSede[id][sede] || 0) + cant;
            });
        });

        const sedesOrdenadas = [...sedesConCarne].sort();
        let filasCarnes, theadCarnes;
        const thProductos = CARNES_CONFIG.map(c => `<th class="col-center">${c.thLabel}</th>`).join('');
        theadCarnes = `<tr><th>Sede</th>${thProductos}</tr>`;

        if (sedesOrdenadas.length === 0) {
            filasCarnes = `<tr><td colspan="${CARNES_CONFIG.length + 1}" class="inf-empty" style="padding:1.5rem">Sin pedidos de carnes para esta fecha</td></tr>`;
        } else {
            const totalesCarne = Object.fromEntries(CARNES_CONFIG.map(c => [c.id, 0]));

            filasCarnes = sedesOrdenadas.map(sede => {
                const celdas = CARNES_CONFIG.map(({ id }) => {
                    const cant = carnesPorSede[id][sede] || 0;
                    totalesCarne[id] += cant;
                    return `<td class="inf-cantidad ${cant === 0 ? 'inf-cantidad--zero' : ''}">${cant || '—'}</td>`;
                }).join('');
                return `<tr><td>${sede.charAt(0).toUpperCase() + sede.slice(1)}</td>${celdas}</tr>`;
            }).join('');

            const celdasTotales = CARNES_CONFIG.map(({ id }) => `<td class="inf-cantidad inf-col-total">${totalesCarne[id] || '—'}</td>`).join('');
            filasCarnes += `<tr class="inf-total-row"><td>Total</td>${celdasTotales}</tr>`;
        }

            // ── Tabla 4: Siropes por sede ──────────────────────────────────────────────
const siroperPorSede = {};
const sedesConSirope = new Set();
SIROPES_CONFIG.forEach(s => { siroperPorSede[s.id] = {}; });

pedidos.forEach(p => {
    const sede = normalizarSede(p.user);
    (p.products || []).forEach(item => {
        const id = String(item.idProduct || '');
        if (!SIROPES_IDS.has(id)) return;
        const cant = Number(item.quantity) || 0;
        if (cant === 0) return;
        sedesConSirope.add(sede);
        siroperPorSede[id][sede] = (siroperPorSede[id][sede] || 0) + cant;
    });
});

const sedesOrdenadasSirope = [...sedesConSirope].sort();
let filasSiropes, theadSiropes;
const thSiropes = SIROPES_CONFIG.map(s => `<th class="col-center">${s.thLabel}</th>`).join('');
theadSiropes = `<tr><th>Sede</th>${thSiropes}</tr>`;

if (sedesOrdenadasSirope.length === 0) {
    filasSiropes = `<tr><td colspan="${SIROPES_CONFIG.length + 1}" class="inf-empty" style="padding:1.5rem">Sin pedidos de siropes para esta fecha</td></tr>`;
} else {
    const totalesSirope = Object.fromEntries(SIROPES_CONFIG.map(s => [s.id, 0]));

    filasSiropes = sedesOrdenadasSirope.map(sede => {
        const celdas = SIROPES_CONFIG.map(({ id }) => {
            const cant = siroperPorSede[id][sede] || 0;
            totalesSirope[id] += cant;
            return `<td class="inf-cantidad ${cant === 0 ? 'inf-cantidad--zero' : ''}">${cant || '—'}</td>`;
        }).join('');
        return `<tr><td>${sede.charAt(0).toUpperCase() + sede.slice(1)}</td>${celdas}</tr>`;
    }).join('');

    const celdasTotalesSirope = SIROPES_CONFIG.map(({ id }) => `<td class="inf-cantidad inf-col-total">${totalesSirope[id] || '—'}</td>`).join('');
    filasSiropes += `<tr class="inf-total-row"><td>Total</td>${celdasTotalesSirope}</tr>`;
}

        
        content.innerHTML = `
            <div class="inf-badge-pedidos">📦 ${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''} para esta fecha</div>
            <div class="inf-grid-2col">
                <div class="inf-card">
                    <div class="inf-card__header">Producción del ${dia}</div>
                    <table class="inf-table">
                        <thead><tr><th>Producto</th><th class="col-center">Total</th></tr></thead>
                        <tbody>${filasProduccion}</tbody>
                    </table>
                </div>
                <div class="inf-card">
                    <div class="inf-card__header">Masas CC del ${dia} (Megamall, Acrópolis)</div>
                    <table class="inf-table">
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th class="col-center">Megamall</th>
                                <th class="col-center">Acrópolis</th>
                                <th class="col-center">Total</th>
                            </tr>
                        </thead>
                        <tbody>${filasMasa}</tbody>
                    </table>
                </div>
              <div class="inf-card inf-card--scroll">
                    <div class="inf-card__header">Carnes del ${dia}</div>
                    <table class="inf-table">
                        <thead>${theadCarnes}</thead>
                        <tbody>${filasCarnes}</tbody>
                    </table>
                </div>
                <div class="inf-card inf-card--scroll">
                    <div class="inf-card__header">Siropes Artesanales del ${dia}</div>
                    <table class="inf-table">
                        <thead>${theadSiropes}</thead>
                        <tbody>${filasSiropes}</tbody>
                    </table>
                </div>
            </div>`;

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="inf-empty" style="color:red">Error al cargar el informe.</p>';
    }
}

// ── Init ───────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ sede }) => {
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
    await cargarInforme();

    document.getElementById('iprod-prev').addEventListener('click', () => { offsetDias--; cargarInforme(); });
    document.getElementById('iprod-next').addEventListener('click', () => { if (offsetDias < 0) { offsetDias++; cargarInforme(); } });
    document.getElementById('iprod-hoy').addEventListener('click',    () => { offsetDias = 0; cargarInforme(); });
    document.getElementById('iprod-refresh').addEventListener('click', cargarInforme);
    document.getElementById('iprod-print').addEventListener('click',   () => window.print());
});
