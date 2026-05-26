import { plantaDB } from "../Api/firebaseConfig.js";
import { collection, query, orderBy, getDocs, where, Timestamp, limit, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { CargarHeader } from "../Shared/components.js";
import { mostrarSkeleton, ocultarSkeleton } from "../Shared/skeleton.js";

const db = plantaDB.db;
const COLECCION = collection(db, "CallCenter", "principal", "PedidosCallCenter");
const USAR_HETZNER = true
import { HETZNER_URL, WS_URL } from '../Api/config.js'

let pedidosCargados = [];
let sedeUsuario     = null;
let rolUsuario      = null;
let filtrosActuales = {};
let pedidoPendienteCancelar = null;
let ultimaSincronizacion    = null; // Timestamp de la última carga exitosa desde Firestore

const MODO_RESERVAS = new URLSearchParams(window.location.search).get('tipo') === 'reserva';
if (MODO_RESERVAS) document.body.classList.add('modo-reservas');

const ESTADOS_ACTIVOS = new Set(["recibido", "en preparación", "despachado"]);

// ── SESSION STORAGE CACHÉ ──────────────────────────────────────────────
const CACHE_TTL    = 5 * 60 * 1000;
const CACHE_VERSION = "v3";
const CACHE_PREFIX = `historial_cc_${CACHE_VERSION}_`

function _cacheKey(f) { return CACHE_PREFIX + JSON.stringify(f); }

const TS_FIELDS = ["fecha", "tsRecibido", "tsPreparacion", "tsDespachado"];

function guardarCache(filtros, pedidos) {
    const data = pedidos.map(p => {
        const r = { ...p };
        TS_FIELDS.forEach(f => { if (r[f]?.toDate) r[f] = r[f].toDate().toISOString(); });
        return r;
    });
    try { sessionStorage.setItem(_cacheKey(filtros), JSON.stringify({ ts: Date.now(), data })); }
    catch(e) { console.warn("sessionStorage no disponible:", e); }
}

function leerCache(filtros) {
    try {
        const raw = sessionStorage.getItem(_cacheKey(filtros));
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(_cacheKey(filtros)); return null; }
        return data.map(p => {
            const r = { ...p };
            TS_FIELDS.forEach(f => { if (r[f]) r[f] = { toDate: () => new Date(r[f]) }; });
            return r;
        });
    } catch(e) { return null; }
}

// ── FECHA LOCAL ────────────────────────────────────────────────────────
function hoyLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// ── PAGINACIÓN ─────────────────────────────────────────────────────────
const PAGINA_SIZE = 20;
let paginaActual = 1;

// ── ESTADO COLORES ─────────────────────────────────────────────────────
const ESTADO_BADGE = {
    "pendiente":      { bg: "#e53935", color: "#fff" },
    "recibido":       { bg: "#1565c0", color: "#fff" },
    "en preparación": { bg: "#7b1fa2", color: "#fff" },
    "despachado":     { bg: "#0288d1", color: "#fff" },
    "entregado":      { bg: "#284c22", color: "#fff" },
    "cancelado":      { bg: "#757575", color: "#fff" },
};

function badgeEstado(estado) {
    const e = ESTADO_BADGE[estado] || { bg: "#aaa", color: "#fff" };
    return `<span style="background:${e.bg};color:${e.color};padding:3px 8px;border-radius:4px;font-size:1.1rem;font-weight:bold;white-space:nowrap;">${estado}</span>`;
}

// ── FORMATO ────────────────────────────────────────────────────────────
function formatFecha(timestamp) {
    if (!timestamp) return "—"
    let d
    if (timestamp.toDate) {
        d = timestamp.toDate()
    } else if (timestamp._seconds) {
        d = new Date(timestamp._seconds * 1000)
    } else {
        d = new Date(timestamp)
    }
    return new Intl.DateTimeFormat("es-CO", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: true,
    }).format(d)
}

function formatHora(ts) {
    if (!ts) return ""
    let d
    if (ts.toDate) {
        d = ts.toDate()
    } else if (ts._seconds) {
        d = new Date(ts._seconds * 1000)
    } else {
        d = new Date(ts)
    }
    return new Intl.DateTimeFormat("es-CO", { 
        hour: "2-digit", minute: "2-digit", hour12: true 
    }).format(d)
}

function formatHora12(hora24) {
    if (!hora24) return "—";
    const [h, m] = hora24.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatPrecio(n) {
    return new Intl.NumberFormat("es-CO", { minimumFractionDigits: 0 }).format(n || 0);
}

// ── CARGAR PEDIDOS ─────────────────────────────────────────────────────
async function cargarPedidos(filtros = {}, forzar = false) {
    const cambioFiltros = JSON.stringify(filtros) !== JSON.stringify(filtrosActuales);
    filtrosActuales = filtros;

    // 1. Caché sessionStorage (solo si no se fuerza y los filtros no cambiaron)
    if (!forzar && !cambioFiltros) {
        const cached = leerCache(filtros);
        if (cached) {
            pedidosCargados = cached;
            poblarSelectAsesores();
            renderTabla(pedidosCargados);
            renderResumen(pedidosCargados);
            mostrarEstadoCache(true);
            return;
        }
    }

    // 2. Delta sync: mismos filtros + ya hay una sincronización previa
    if (!cambioFiltros && ultimaSincronizacion) {
        await sincronizarDelta();
        return;
    }

    // 3. Carga completa (primer load o cambio de filtros)
    await cargaCompleta(filtros);
}

// Consulta solo los documentos modificados desde la última sincronización.
// Si no hubo cambios → 0 lecturas Firestore.
async function sincronizarDelta() {
    if (USAR_HETZNER) {
        await cargaCompleta(filtrosActuales)
        return
    }

    const tsCorte = ultimaSincronizacion
    ultimaSincronizacion = Timestamp.now()

    try {
        const snap = await getDocs(query(COLECCION, where("updatedAt", ">", tsCorte)))

        if (snap.empty) {
            mostrarEstadoCache(false)
            return
        }

        const hoy = new Date().toISOString().split("T")[0]
        const desde = new Date((filtrosActuales.desde || hoy) + "T00:00:00")
        const hasta = new Date((filtrosActuales.hasta || hoy) + "T23:59:59")

        snap.docs.forEach(d => {
            const nuevo = { id: d.id, ...d.data() }
            const fechaDoc = nuevo.fecha?.toDate ? nuevo.fecha.toDate() : new Date(nuevo.fecha)
            const enRango      = fechaDoc >= desde && fechaDoc <= hasta
            const coincideSede = !filtrosActuales.sede   || nuevo.sede   === filtrosActuales.sede
            const coincideEst  = !filtrosActuales.estado || nuevo.estado === filtrosActuales.estado
            const idx = pedidosCargados.findIndex(p => p.id === nuevo.id)

            if (enRango && coincideSede && coincideEst) {
                if (idx !== -1) pedidosCargados[idx] = nuevo
                else pedidosCargados.push(nuevo)
            } else if (idx !== -1) {
                pedidosCargados.splice(idx, 1)
            }
        })

        pedidosCargados.sort((a, b) => {
            const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha)
            const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha)
            return fb - fa
        })

        guardarCache(filtrosActuales, pedidosCargados)
        poblarSelectAsesores()
        filtrarColumnas()
        mostrarEstadoCache(false)
    } catch (err) {
        console.warn("Delta sync falló, recargando completo:", err)
        await cargaCompleta(filtrosActuales)
    }
}

async function cargaCompleta(filtros) {
    const tbody = document.getElementById("historial-tbody");
    mostrarEstadoCache(false);
    tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="9" style="text-align:center;padding:30px;">Cargando...</td></tr>`;

    try {
        let pedidos = []

        if (USAR_HETZNER) {
            const hoy = new Date().toISOString().split("T")[0]
            const desde = filtros.desde || hoy
            const hasta = filtros.hasta || hoy
            const sede = filtros.sede || ''
            const estado = filtros.estado || ''
            const response = await fetch(`${HETZNER_URL}/callcenter/pedidos/rango?desde=${desde}&hasta=${hasta}&sede=${sede}&estado=${estado}`)
            pedidos = await response.json()
        } else {
            // Fallback — lee directo de Firestore
            const hoy = new Date().toISOString().split("T")[0]
            const desde = filtros.desde || hoy
            const hasta = filtros.hasta || hoy

            let q = query(
                COLECCION,
                where("fecha", ">=", Timestamp.fromDate(new Date(desde + "T00:00:00"))),
                where("fecha", "<=", Timestamp.fromDate(new Date(hasta + "T23:59:59"))),
                orderBy("fecha", "desc"),
                limit(500)
            )
            if (filtros.sede)   q = query(q, where("sede",   "==", filtros.sede))
            if (filtros.estado) q = query(q, where("estado", "==", filtros.estado))

            const snap = await getDocs(q)
            pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.eliminado)
        }

        ultimaSincronizacion = Timestamp.now()
        pedidosCargados = pedidos
        guardarCache(filtros, pedidosCargados)
        poblarSelectAsesores()
        filtrarColumnas()

    } catch (error) {
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="9" style="text-align:center;color:red;">Error al cargar: ${error.message}</td></tr>`;
    }
}

function mostrarEstadoCache(desdeCache) {
    const btn = document.getElementById("btn-actualizar");
    if (!btn) return;
    btn.title = desdeCache ? "Datos desde caché. Click para actualizar." : "Datos actualizados desde Firebase.";
    btn.style.opacity = desdeCache ? "0.7" : "1";
}

// ── TIMER DE DEMORA ────────────────────────────────────────────────────
let timerDemoraInterval = null

function calcularMinutos(tsRecibido) {
    if (!tsRecibido) return 0
    const recibido = tsRecibido._seconds
        ? new Date(tsRecibido._seconds * 1000)
        : new Date(tsRecibido)
    return Math.floor((Date.now() - recibido.getTime()) / 60000)
}

function formatTimer(minutos) {
    const h = Math.floor(minutos / 60)
    const m = minutos % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function actualizarTimers() {
    console.log('actualizarTimers ejecutado, pedidos cargados:', pedidosCargados.length)
    document.querySelectorAll('tr[data-id]').forEach(fila => {
        const pedidoId = fila.dataset.id
        const pedido = pedidosCargados.find(p => p.id === pedidoId)
        if (!pedido || pedido.estado !== 'en preparación' || pedido.tipo === 'reserva') return

        const minutos = calcularMinutos(pedido.tsRecibido)
        console.log('pedido:', pedido.nPedido, 'minutos:', minutos)
        if (minutos < 30) return

        const fechaPedido = pedido.fecha?._seconds
            ? new Date(pedido.fecha._seconds * 1000)
            : new Date(pedido.fecha)
        const esHoy = fechaPedido.toDateString() === new Date().toDateString()
        console.log('esHoy:', esHoy, 'fecha:', fechaPedido)

        const celdaNPedido = fila.querySelector('td:nth-child(1)')
        console.log('celdaNPedido:', celdaNPedido)
        if (!celdaNPedido) return

        let puntoEl = fila.querySelector('.punto-demora, .punto-rojo-fijo')
        console.log('puntoEl existente:', puntoEl)
        if (!puntoEl) {
            puntoEl = document.createElement('span')
            celdaNPedido.appendChild(puntoEl)
            console.log('punto creado')
        }

        if (!esHoy) {
            puntoEl.className = 'punto-rojo-fijo'
            puntoEl.title = 'Pendiente de días anteriores'
            console.log('punto-rojo-fijo aplicado')
        } else {
            puntoEl.className = `punto-demora ${minutos >= 40 ? 'punto-rojo' : 'punto-naranja'}`
            puntoEl.title = `⏱ ${formatTimer(minutos)} esperando`
            console.log('punto-demora aplicado')
        }
    })
}

function iniciarTimerDemora() {
    if (timerDemoraInterval) clearInterval(timerDemoraInterval)
    timerDemoraInterval = setInterval(actualizarTimers, 10000) // cada 10 segundos
}



// ── RENDER TABLA ───────────────────────────────────────────────────────
function renderTabla(pedidos) {
    const tbody = document.getElementById("historial-tbody");

    if (pedidos.length === 0) {
        const desde = document.getElementById("filtro-desde").value;
        const hasta = document.getElementById("filtro-hasta").value;
        const rango = desde === hasta ? `el ${desde}` : `del ${desde} al ${hasta}`;
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="10" style="text-align:center;padding:30px;">No se encontraron pedidos para ${rango}.</td></tr>`;
        renderPaginacion(0);
        return;
    }

    const totalPaginas = Math.ceil(pedidos.length / PAGINA_SIZE);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    const inicio = (paginaActual - 1) * PAGINA_SIZE;
    const pagina = pedidos.slice(inicio, inicio + PAGINA_SIZE);

    tbody.innerHTML = pagina.map(p => {
        const esReserva  = p.tipo === "reserva"
        const activo     = ESTADOS_ACTIVOS.has(p.estado)
        const esRecoger  = p.domicilio?.tipo === "recoger"
        const dirDisplay = esReserva
            ? `<span style="background:#6c3d8f;color:#fff;padding:2px 7px;border-radius:4px;font-size:1.1rem;font-weight:bold;">RESERVA</span>`
            : esRecoger
                ? `<span style="font-weight:700;">RECOGER</span>`
                : p.direccion ? p.direccion.substring(0, 25) + (p.direccion.length > 25 ? "…" : "") : "—"
        const totalDisplay = esReserva
            ? `<span style="color:#6c3d8f;font-weight:bold;">👥 ${p.cantidadPersonas ?? "—"} pers.</span>`
            : `$${formatPrecio(p.total)}`
        const canalLabel = p.canal === "whatsapp" ? "📱 WhatsApp" : p.canal === "ivr" ? "📞 IVR" : p.canal ?? "—"

        // Timer de demora solo para pizzería y callcenter, pedidos en preparación
        const esPizzeria = true
        const enPreparacion = p.estado === 'en preparación'
        const minutos = enPreparacion ? calcularMinutos(p.tsRecibido) : 0

        const fechaPedido = p.fecha?._seconds
            ? new Date(p.fecha._seconds * 1000)
            : new Date(p.fecha)
        const esHoy = fechaPedido.toDateString() === new Date().toDateString()

        const puntoCelda = (() => {
            if (esReserva) return ''
            if (enPreparacion && !esHoy) {
                return `<span class="punto-rojo-fijo" title="Pendiente de días anteriores"></span>`
            }
            if (enPreparacion && esHoy && minutos >= 30) {
                return `<span class="punto-demora ${minutos >= 40 ? 'punto-rojo' : 'punto-naranja'}" title="${formatTimer(minutos)} esperando"></span>`
            }
            if (p.estado === 'despachado') {
                return `<span class="punto-despachado" title="Despachado ✓"></span>`
            }
            return ''
        })()

        return `
        <tr class="inventory-management__row${activo ? " fila-activa" : ""}${esReserva ? " fila-reserva" : ""}"
            data-id="${p.id}"
            title="${activo ? "Gestionar pedido" : "Ver detalle"}">
            <td class="inventory-management__cell">#${p.nPedido ?? "—"}${puntoCelda}</td>
            <td class="inventory-management__cell">${formatFecha(p.fecha)}</td>
            <td class="inventory-management__cell">${p.nombre ?? "—"}</td>
            <td class="inventory-management__cell" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;" title="${esReserva ? "Reserva" : esRecoger ? "Recoger en tienda" : (p.direccion ?? "")}">${dirDisplay}</td>
            <td class="inventory-management__cell" style="text-align:center;">${canalLabel}</td>
            <td class="inventory-management__cell" style="text-transform:capitalize;">${p.sede ?? "—"}</td>
            <td class="inventory-management__cell">${p.asesor ?? "—"}</td>
            <td class="inventory-management__cell">${badgeEstado(p.estado ?? "—")}</td>
            <td class="inventory-management__cell" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.obs ?? ""}">${p.obs ? p.obs.substring(0,30) + (p.obs.length > 30 ? "…" : "") : "—"}</td>
            <td class="inventory-management__cell" style="font-weight:bold;">${totalDisplay}</td>
        </tr>`
    }).join("")

    tbody.querySelectorAll("tr[data-id]").forEach(fila => {
        fila.addEventListener("click", () => {
            const pedido = pedidosCargados.find(p => p.id === fila.dataset.id);
            if (pedido) abrirDetalle(pedido);
        });
    });

   renderPaginacion(pedidos.length)
        iniciarTimerDemora()
}

function renderPaginacion(total) {
    const contenedor = document.getElementById("paginacion");
    const totalPaginas = Math.ceil(total / PAGINA_SIZE);
    if (totalPaginas <= 1) { contenedor.innerHTML = ""; return; }

    contenedor.innerHTML = `
        <button class="pag-btn" id="pag-prev" ${paginaActual === 1 ? "disabled" : ""}>← Anterior</button>
        <span class="pag-info">Página ${paginaActual} de ${totalPaginas} &nbsp;·&nbsp; ${total} pedidos</span>
        <button class="pag-btn" id="pag-next" ${paginaActual === totalPaginas ? "disabled" : ""}>Siguiente →</button>
    `;
    document.getElementById("pag-prev").addEventListener("click", () => { if (paginaActual > 1) { paginaActual--; filtrarColumnas(); } });
    document.getElementById("pag-next").addEventListener("click", () => { if (paginaActual < totalPaginas) { paginaActual++; filtrarColumnas(); } });
}

function renderResumen(pedidos) {
    const el = id => document.getElementById(id);
    if (!el("resumen-total")) return;
    el("resumen-total").textContent    = pedidos.filter(p => p.tipo !== "reserva").length;
    el("resumen-whatsapp").textContent = pedidos.filter(p => p.canal === "whatsapp" && p.tipo !== "reserva").length;
    el("resumen-ivr").textContent      = pedidos.filter(p => p.canal === "ivr" && p.tipo !== "reserva").length;
    el("resumen-reservas").textContent = pedidos.filter(p => p.tipo === "reserva").length;
}

// ── REFRESCO PERIÓDICO (cada 5 min, solo si la pestaña está visible) ───────
function iniciarListenerActivos() {
    const INTERVALO = 5 * 60 * 1000

    // WebSocket para tiempo real
    let ws = null

    let wsConectado = false

    function conectarWebSocket() {
        ws = new WebSocket(WS_URL)

        ws.onopen = () => {
            console.log('WebSocket conectado')
            if (wsConectado) cargarPedidos(filtrosActuales, true) // refrescar solo en reconexión
            wsConectado = true
        }

        ws.onmessage = (event) => {
            try {
                const mensaje = JSON.parse(event.data)
                if (mensaje.tipo === 'callcenter:actualizado') {
                    cargarPedidos(filtrosActuales, true)
                }
            } catch (e) {
                console.error('Error procesando mensaje WebSocket:', e)
            }
        }

        ws.onclose = () => {
            console.log('WebSocket desconectado, reconectando en 5s...')
            setTimeout(conectarWebSocket, 5000)
        }

        ws.onerror = (err) => {
            console.error('WebSocket error:', err)
        }
    }

    conectarWebSocket()

    // Refresco periódico como respaldo (cada 5 min)
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            cargarPedidos(filtrosActuales, true)
        }
    }, INTERVALO)

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            cargarPedidos(filtrosActuales, true)
        }
    })
}

// ── STEPPER ────────────────────────────────────────────────────────────
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/></svg>`;

const STEPS = [
    {
        key: "recibido", label: "Recibido", tsField: "tsRecibido",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
               </svg>`
    },
    {
        key: "en preparación", label: "Preparando", tsField: "tsPreparacion",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
               </svg>`
    },
    {
        key: "despachado", label: "Despachado", tsField: "tsDespachado",
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="5.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>
                <path d="M15 6h-4l-2 6H3l2-4h8"/><path d="M15 6l2 6h2l1-3h-5"/>
               </svg>`
    },
];

function estadoAIdx(estado) {
    return { recibido: 0, "en preparación": 1, despachado: 2 }[estado] ?? -1;
}

function renderStepper(p, esActivo) {
    if (p.estado === "cancelado") {
        return `<div class="modal-cancelado">
            <span>✕ Pedido cancelado</span>
            ${p.motivoCancelacion ? `<small>${p.motivoCancelacion}</small>` : ""}
        </div>`;
    }

    const stepsActivos = p.tipo === 'reserva' ? STEPS.slice(0, 1) : STEPS;
    const currentIdx = estadoAIdx(p.estado);
    let html = '<div class="stepper">';

    stepsActivos.forEach((step, i) => {
        let cls = "step-locked", icon = step.icon, onclick = "";
        if (i < currentIdx)        { cls = "step-done"; icon = ICON_CHECK; }
        else if (i === currentIdx)   cls = "step-active";
        else if (i === currentIdx + 1 && esActivo) {
            cls = "step-next";
            onclick = `onclick="cambiarEstado('${p.id}', '${step.key}')"`;
        }
        const hora = i <= currentIdx ? formatHora(p[step.tsField]) : "";
        html += `<div class="step ${cls}" ${onclick}>
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
            ${hora ? `<span class="step-time">${hora}</span>` : ""}
        </div>`;
        if (i < stepsActivos.length - 1)
            html += `<div class="step-connector ${i < currentIdx ? "active" : ""}"></div>`;
    });

    html += "</div>";
    return html;
}

// ── MARCAR IMPRESO / RECIBIDO ──────────────────────────────────────────
window.marcarRecibido = async function(pedidoId, impreso) {
    if (!impreso) {
        const ok = confirm('El sistema no registra que este pedido se haya impreso.\n¿Confirmas que la comanda se imprimió físicamente?');
        if (!ok) return;
    }
    const btn = document.querySelector('.btn-marcar-recibido');
    if (btn) { btn.disabled = true; btn.textContent = 'Marcando...'; }
    try {
        const res = await fetch(`${HETZNER_URL}/callcenter/pedidos/${pedidoId}/impreso`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? 'Error al marcar');
        }
        const data = await res.json();
        // Actualizar caché local
        const idx = pedidosCargados.findIndex(p => p.id === pedidoId);
        if (idx !== -1) pedidosCargados[idx] = { ...pedidosCargados[idx], ...data };
        // Actualizar modal
        document.getElementById('modal-stepper').innerHTML = renderStepper(data, false);
        document.getElementById('modal-cancel-area').innerHTML = '';
        document.getElementById('modal-impreso').innerHTML = '';
        // Actualizar badge en tabla
        const fila = document.querySelector(`tr[data-id="${pedidoId}"]`);
        if (fila) {
            fila.querySelectorAll('.inventory-management__cell').forEach(cell => {
                if (cell.querySelector('.status-badge')) cell.innerHTML = badgeEstado(data.estado ?? 'recibido');
            });
        }
    } catch (e) {
        alert('Error: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '✓ Marcar como recibido'; }
    }
};

// ── MODAL DETALLE ──────────────────────────────────────────────────────
function abrirDetalle(p) {
    const esReserva   = p.tipo === "reserva";
    const esActivo    = ESTADOS_ACTIVOS.has(p.estado) && rolUsuario === "pizzeria";
    const esDomicilio = p.domicilio?.tipo !== "recoger";

    document.getElementById("modal-npedido").textContent = esReserva
        ? `🗓 RESERVA #${p.nPedido ?? "—"}`
        : `#${p.nPedido ?? "—"}`;

    document.getElementById("modal-cliente").textContent = p.nombre ?? "—";

    document.getElementById("modal-meta").innerHTML = esReserva
        ? `📞 ${p.telefono ?? "—"} &nbsp;·&nbsp; 🏬 ${p.sede ?? "—"} &nbsp;·&nbsp; 👤 ${p.asesor ?? "—"}` +
          `<br><small>${formatFecha(p.fecha)}</small>`
        : `📞 ${p.telefono ?? "—"} &nbsp;·&nbsp; 🏬 ${p.sede ?? "—"} &nbsp;·&nbsp; 👤 ${p.asesor ?? "—"}` +
          `<br><small>${formatFecha(p.fecha)} &nbsp;·&nbsp; Pago: ${p.pago ?? "—"}</small>`;

    document.getElementById("modal-entrega").innerHTML = esReserva
        ? ""
        : esDomicilio
            ? `📍 ${p.direccion ?? ""}${p.domicilio?.barrio ? ` · ${p.domicilio.barrio}` : ""}`
            : `🏪 Recoge en tienda`;

    document.getElementById("modal-productos-title").textContent = esReserva ? "Información reserva" : "Productos";

    if (esReserva) {
        const fechaReservaFmt = p.fechaReserva
            ? p.fechaReserva.split('-').reverse().join('/')
            : "—";
        document.getElementById("modal-productos").innerHTML = `
            <li class="reserva-dato">
                <span class="reserva-dato__label">📅 Fecha reserva</span>
                <span class="reserva-dato__valor">${fechaReservaFmt}</span>
            </li>
            <li class="reserva-dato">
                <span class="reserva-dato__label">🕐 Hora reserva</span>
                <span class="reserva-dato__valor">${formatHora12(p.horaReserva)}</span>
            </li>
            <li class="reserva-dato">
                <span class="reserva-dato__label">👥 Cantidad personas</span>
                <span class="reserva-dato__valor">${p.cantidadPersonas ?? "—"}</span>
            </li>`;
        document.getElementById("modal-totals-box").style.display  = "none";
        document.getElementById("modal-total").textContent          = "";
        document.getElementById("modal-domicilio").textContent      = "";
        document.getElementById("modal-total-final").textContent    = "";
    } else {
        const productos = (Array.isArray(p.productos) ? p.productos : [])
            .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
        document.getElementById("modal-productos").innerHTML = productos.map(item => {
            const adiciones = Array.isArray(item.adiciones) && item.adiciones.length
                ? item.adiciones.map(a => `<li class="mpedido-adicion">↳ ${a.nombre}</li>`).join("") : "";
            const obsItem = item.obs ? `<li class="mpedido-adicion" style="color:#e67e22; font-style:italic;">📝 ${item.obs}</li>` : "";
            return `<li><strong>${item.qty || 1}×</strong> ${item.nombre}</li>${obsItem}${adiciones}`;
        }).join("") || `<li style="color:#aaa;">Sin productos</li>`;

        const valDom = esDomicilio ? (p.domicilio?.valor || 0) : 0;
        document.getElementById("modal-totals-box").style.display      = "block";
        document.getElementById("modal-total").textContent             = `$${formatPrecio(p.total)}`;
        document.getElementById("modal-domicilio-row").style.display   = valDom > 0 ? "flex" : "none";
        document.getElementById("modal-domicilio").textContent         = valDom > 0 ? `$${formatPrecio(valDom)}` : "";
        document.getElementById("modal-total-final").textContent       = `$${formatPrecio(p.total + valDom)}`;
    }

    document.getElementById("modal-obs").innerHTML = p.obs
        ? `<div class="mpedido-obs">💬 ${p.obs}</div>` : "";

    document.getElementById("modal-stepper").innerHTML = renderStepper(p, esActivo);

    // Indicador de impresión (solo para callcenter-admin/admin en estado pendiente)
    const impreso = !!p.impreso;
    const esAdmin = ['callcenter-admin', 'admin'].includes(rolUsuario);
    document.getElementById("modal-impreso").innerHTML = p.estado === "pendiente" && esAdmin
        ? impreso
            ? `<span class="badge-impreso badge-impreso--si">🖨 Comanda impresa</span>`
            : `<span class="badge-impreso badge-impreso--no">⏳ Sin imprimir</span>`
        : "";

    let cancelArea = "";
    if (esActivo && p.estado === "en preparación" && p.tipo !== 'reserva')
        cancelArea += `<button class="btn-cancelar-pedido" onclick="abrirModalCancelar('${p.id}', '${p.nPedido}')">✕ Cancelar pedido</button>`;
    if (p.estado === "pendiente" && esAdmin)
        cancelArea += `<button class="btn-marcar-recibido" onclick="marcarRecibido('${p.id}', ${impreso})">✓ Marcar como recibido</button>`;
    document.getElementById("modal-cancel-area").innerHTML = cancelArea;

    document.getElementById("modal-detalle").style.display = "flex";
}

function cerrarDetalle() {
    document.getElementById("modal-detalle").style.display = "none";
}

// ── CAMBIAR ESTADO ─────────────────────────────────────────────────────
const TS_MAP = {
    "en preparación": "tsPreparacion",
    "despachado":     "tsDespachado",
};

window.cambiarEstado = async (pedidoId, nuevoEstado) => {
    try {
        const res = await fetch(`${HETZNER_URL}/callcenter/pedidos/${pedidoId}/estado`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error ?? 'Error al actualizar estado');
        }
        cerrarDetalle();
        sincronizarDelta();
    } catch (e) {
        alert("Error al actualizar el estado. Intenta de nuevo.");
        console.error(e);
    }
};

// ── CANCELAR ──────────────────────────────────────────────────────────
window.abrirModalCancelar = (pedidoId, nPedido) => {
    pedidoPendienteCancelar = pedidoId;
    document.getElementById("cancelar-descripcion").textContent = `¿Cancelar el pedido #${nPedido}?`;
    document.getElementById("cancelar-motivo").value = "";
    document.getElementById("modal-cancelar").style.display = "flex";
    setTimeout(() => document.getElementById("cancelar-motivo").focus(), 100);
};

function cerrarModalCancelar() {
    pedidoPendienteCancelar = null;
    document.getElementById("modal-cancelar").style.display = "none";
}

document.getElementById("btn-cerrar-cancelar").addEventListener("click", cerrarModalCancelar);
document.getElementById("modal-cancelar").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-cancelar")) cerrarModalCancelar();
});
document.getElementById("btn-confirmar-cancelar").addEventListener("click", async () => {
    if (!pedidoPendienteCancelar) return;
    const motivo = document.getElementById("cancelar-motivo").value.trim();
    try {
        const res = await fetch(`${HETZNER_URL}/callcenter/pedidos/${pedidoPendienteCancelar}/cancelar`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivoCancelacion: motivo })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error ?? 'Error al cancelar');
        }
        cerrarModalCancelar();
        cerrarDetalle();
        sincronizarDelta();
    } catch (e) {
        alert("Error al cancelar. Intenta de nuevo.");
        console.error(e);
    }
});

// ── EXPORTAR CSV ───────────────────────────────────────────────────────
function exportarCSV() {
    if (pedidosCargados.length === 0) return alert("No hay pedidos para exportar.");
    const enc  = ["N°","Fecha","Cliente","Teléfono","Dirección","Sede","Asesor","Estado","Observación","Total"];
    const filas = pedidosCargados.map(p => [
        p.nPedido ?? "", formatFecha(p.fecha), p.nombre ?? "", p.telefono ?? "",
        p.direccion ?? "", p.sede ?? "", p.asesor ?? "", p.estado ?? "",
        (p.obs ?? "").replace(/,/g,";"), p.total ?? 0,
    ]);
    const csv  = [enc, ...filas].map(f => f.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `historial_pedidos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── EXPORTAR LIQUIDACIÓN (.xlsx) ───────────────────────────────────────
async function exportarLiquidacion() {
    const btn = document.getElementById("btn-liquidacion");
    btn.textContent = "⏳ Generando...";
    btn.disabled = true;

    try {
        const desde      = document.getElementById("filtro-desde").value;
        const hasta      = document.getElementById("filtro-hasta").value;
        const sedeFilter = document.getElementById("filtro-sede").value;

        const response = await fetch(`${HETZNER_URL}/callcenter/pedidos/rango?desde=${desde}&hasta=${hasta}&sede=${sedeFilter}&estado=`);
        const pedidos  = await response.json();

        const TARIFA_PERSONA   = 10000;
        const COMISION_PCT     = 0.05;

        const pedidosNormales = pedidos.filter(p => p.tipo !== "reserva");
        const reservas        = pedidos.filter(p => p.tipo === "reserva");

        // ── Agrupar pedidos normales por sede → canal ──────────────────
        const resumen = {};
        pedidosNormales.forEach(p => {
            const sede  = (p.sede || "Sin sede").toLowerCase();
            const canal = p.canal === "whatsapp" ? "WhatsApp" : p.canal === "ivr" ? "IVR" : (p.canal || "Sin canal");
            if (!resumen[sede]) resumen[sede] = {};
            if (!resumen[sede][canal]) resumen[sede][canal] = { cantidad: 0, totalPedidos: 0 };
            resumen[sede][canal].cantidad++;
            resumen[sede][canal].totalPedidos += (p.total || 0);
        });

        // ── Agrupar reservas por sede ──────────────────────────────────
        const resumenReservas = {};
        reservas.forEach(p => {
            const sede = (p.sede || "Sin sede").toLowerCase();
            if (!resumenReservas[sede]) resumenReservas[sede] = { cantidad: 0, personas: 0, base: 0 };
            resumenReservas[sede].cantidad++;
            resumenReservas[sede].personas += (p.cantidadPersonas || 0);
            resumenReservas[sede].base     += (p.cantidadPersonas || 0) * TARIFA_PERSONA;
        });

        // ── Hoja 1: Resumen por sede ───────────────────────────────────
        const filasResumen = [
            ["LIQUIDACIÓN CALLCENTER"],
            [`Periodo: ${desde} al ${hasta}`],
            [`Generado: ${new Date().toLocaleString("es-CO")}`],
            [`Total pedidos: ${pedidosNormales.length}   |   Total reservas: ${reservas.length}`],
            [],
            ["Sede", "Tipo", "Cantidad", "Total / Base cobro", "Comisión (5%)"],
        ];

        // Unir todas las sedes presentes en pedidos y reservas
        const todasSedes = [...new Set([
            ...Object.keys(resumen),
            ...Object.keys(resumenReservas)
        ])].sort();

        let grandCant = 0, grandBase = 0, grandCom = 0;

        todasSedes.forEach(sede => {
            let cantSede = 0, baseSede = 0;

            // Filas por canal (pedidos normales)
            if (resumen[sede]) {
                Object.keys(resumen[sede]).sort().forEach(canal => {
                    const { cantidad, totalPedidos } = resumen[sede][canal];
                    const com = totalPedidos * COMISION_PCT;
                    filasResumen.push([sede, canal, cantidad, totalPedidos, com]);
                    cantSede += cantidad;
                    baseSede += totalPedidos;
                });
            }

            // Fila reservas de esta sede
            if (resumenReservas[sede]) {
                const { cantidad, base } = resumenReservas[sede];
                const com = base * COMISION_PCT;
                filasResumen.push([sede, "Reservas", cantidad, base, com]);
                cantSede += cantidad;
                baseSede += base;
            }

            const comSede = baseSede * COMISION_PCT;
            filasResumen.push([sede, "TOTAL SEDE", cantSede, baseSede, comSede]);
            filasResumen.push([]);
            grandCant += cantSede;
            grandBase += baseSede;
            grandCom  += comSede;
        });

        filasResumen.push(["TOTAL GENERAL", "", grandCant, grandBase, grandCom]);

        const wsResumen = XLSX.utils.aoa_to_sheet(filasResumen);
        wsResumen["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 18 }];

        // ── Hoja 2: Detalle ────────────────────────────────────────────
        const filasDetalle = [[
            "N°", "Tipo", "Fecha", "Sede", "Canal", "Cliente", "Teléfono",
            "Hora reserva", "Personas", "Dirección", "Tipo entrega", "Barrio",
            "Valor domicilio", "Total / Base cobro", "Comisión (5%)", "Pago", "Estado"
        ]];

        pedidos.forEach(p => {
            const esReserva = p.tipo === "reserva";
            const esRecoger = p.domicilio?.tipo === "recoger";
            const base      = esReserva ? (p.cantidadPersonas || 0) * TARIFA_PERSONA : (p.total || 0);
            filasDetalle.push([
                p.nPedido          ?? "",
                esReserva ? "Reserva" : "Pedido",
                formatFecha(p.fecha),
                p.sede             ?? "",
                p.canal            ?? "",
                p.nombre           ?? "",
                p.telefono         ?? "",
                esReserva ? (p.horaReserva ?? "") : "",
                esReserva ? (p.cantidadPersonas ?? "") : "",
                esReserva ? "" : (p.direccion ?? ""),
                esReserva ? "" : (esRecoger ? "Recoger" : "Domicilio"),
                esReserva ? "" : (esRecoger ? "" : (p.domicilio?.barrio || "")),
                esReserva ? 0 : (p.domicilio?.valor || 0),
                base,
                base * COMISION_PCT,
                esReserva ? "" : (p.pago ?? ""),
                p.estado           ?? "",
            ]);
        });

        const wsDetalle = XLSX.utils.aoa_to_sheet(filasDetalle);
        wsDetalle["!cols"] = [
            { wch: 8  }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
            { wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 30 },
            { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
        ];

        // ── Generar archivo ────────────────────────────────────────────
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen por Sede");
        XLSX.utils.book_append_sheet(wb, wsDetalle, "Detalle Pedidos");
        XLSX.writeFile(wb, `liquidacion_${desde}_${hasta}.xlsx`);

    } catch (error) {
        alert("Error al generar liquidación: " + error.message);
        console.error(error);
    } finally {
        btn.textContent = "📊 Liquidación";
        btn.disabled    = false;
    }
}

// ── POBLAR SELECT ASESORES ─────────────────────────────────────────────
function poblarSelectAsesores() {
    const select = document.getElementById("cf-asesor");
    const valorActual = select.value;
    const asesores = [...new Set(pedidosCargados.map(p => p.asesor).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todos</option>' +
        asesores.map(a => `<option value="${a}">${a}</option>`).join('');
    if (asesores.includes(valorActual)) select.value = valorActual;
}

// ── FILTRO EN CLIENTE ──────────────────────────────────────────────────
function filtrarColumnas(reiniciarPagina = false) {
    if (reiniciarPagina) paginaActual = 1;
    const npedido   = document.getElementById("cf-npedido").value.toLowerCase();
    const fecha     = document.getElementById("cf-fecha").value.toLowerCase();
    const cliente   = document.getElementById("cf-cliente").value.toLowerCase();
    const direccion = document.getElementById("cf-direccion").value.toLowerCase();
    const canal     = document.getElementById("cf-canal").value.toLowerCase();
    const sede      = document.getElementById("cf-sede").value.toLowerCase();
    const asesor    = document.getElementById("cf-asesor").value.toLowerCase();
    const estado    = document.getElementById("cf-estado").value.toLowerCase();

    const base = MODO_RESERVAS
        ? pedidosCargados.filter(p => p.tipo === "reserva")
        : pedidosCargados;

    const filtrados = base.filter(p =>
        (!npedido   || String(p.nPedido ?? "").includes(npedido)) &&
        (!fecha     || formatFecha(p.fecha).toLowerCase().includes(fecha)) &&
        (!cliente   || (p.nombre   ?? "").toLowerCase().includes(cliente)) &&
        (!direccion || (p.direccion ?? "").toLowerCase().includes(direccion)) &&
        (!canal     || (p.canal    ?? "").toLowerCase() === canal) &&
        (!sede      || (p.sede     ?? "").toLowerCase().includes(sede)) &&
        (!asesor    || (p.asesor   ?? "").toLowerCase().includes(asesor)) &&
        (!estado    || (p.estado   ?? "").toLowerCase() === estado)
    );
    renderTabla(filtrados);
    renderResumen(filtrados);
}

// ── PANEL LATERAL ──────────────────────────────────────────────────────
function abrirPanel() {
    document.getElementById("filtros-panel").classList.add("open");
    document.getElementById("filtros-overlay").classList.add("open");
}
function cerrarPanel() {
    document.getElementById("filtros-panel").classList.remove("open");
    document.getElementById("filtros-overlay").classList.remove("open");
}

// ── EVENTOS ────────────────────────────────────────────────────────────
["cf-npedido","cf-fecha","cf-cliente","cf-direccion","cf-canal","cf-sede","cf-asesor","cf-estado"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => filtrarColumnas(true));
});
document.getElementById("btn-abrir-panel").addEventListener("click", abrirPanel);
document.getElementById("btn-cerrar-panel").addEventListener("click", cerrarPanel);
document.getElementById("filtros-overlay").addEventListener("click", cerrarPanel);
document.getElementById("btn-filtrar").addEventListener("click", () => {
    cargarPedidos({
        desde:  document.getElementById("filtro-desde").value,
        hasta:  document.getElementById("filtro-hasta").value,
        sede:   document.getElementById("filtro-sede").value,
        estado: document.getElementById("filtro-estado").value,
    });
    cerrarPanel();
});
document.getElementById("btn-limpiar").addEventListener("click", () => {
    const hoy = hoyLocal();
    document.getElementById("filtro-desde").value  = hoy;
    document.getElementById("filtro-hasta").value  = hoy;
    document.getElementById("filtro-sede").value   = sedeUsuario || "";
    document.getElementById("filtro-estado").value = "";
    cargarPedidos({ desde: hoy, hasta: hoy, ...(sedeUsuario && { sede: sedeUsuario }) });
    cerrarPanel();
});
document.getElementById("btn-exportar").addEventListener("click", exportarCSV);
document.getElementById("btn-liquidacion").addEventListener("click", exportarLiquidacion);
document.getElementById("btn-actualizar").addEventListener("click", () => {
    cargarPedidos({
        desde:  document.getElementById("filtro-desde").value,
        hasta:  document.getElementById("filtro-hasta").value,
        sede:   document.getElementById("filtro-sede").value,
        estado: document.getElementById("filtro-estado").value,
    }, true);
});
document.getElementById("cerrar-detalle").addEventListener("click", cerrarDetalle);
document.getElementById("modal-detalle").addEventListener("click", e => {
    if (e.target === document.getElementById("modal-detalle")) cerrarDetalle();
});

// ── SKELETON + AUTH ────────────────────────────────────────────────────
mostrarSkeleton("historial");

async function obtenerUsuarioCC(user) {
    if (window.parent !== window && window.parent._usuarioCCPromise) {
        return await window.parent._usuarioCCPromise;
    }
    // Fallback: acceso directo sin shell
    const userDoc = await getDoc(doc(plantaDB.db, "Usuarios", user.uid));
    if (!userDoc.exists()) throw new Error("Usuario no encontrado");
    const d = userDoc.data();
    return { uid: user.uid, email: user.email, username: d.username || "", sede: d.sede || "", rol: d.rol || "" };
}

onAuthStateChanged(plantaDB.auth, async (user) => {
    if (!user) { window.top.location.href = "../index.html"; return; }
    try {
        const usuario = await obtenerUsuarioCC(user);
        if (!usuario.rol) { window.top.location.href = "../index.html"; return; }

        const { sede, rol } = usuario;
        rolUsuario = rol;
        const homeUrl = rol === "pizzeria" ? "../Pizzerias/pizzerias.html" : "./callcenter.html";
        const mostrarSala = rol === 'callcenter' || rol === 'callcenter-admin' || rol === 'admin';
        CargarHeader(sede, homeUrl, mostrarSala);

        if (rol === 'callcenter-admin' || rol === 'admin') {
            document.getElementById("btn-exportar").style.display = "";
            document.getElementById("btn-liquidacion").style.display = "";
        }

        if (rol === "pizzeria") {
            sedeUsuario = sede;
            const selectSede = document.getElementById("filtro-sede");
            selectSede.value    = sede;
            selectSede.disabled = true;           
        }
        
        // Ajustes visuales si estamos en modo reservas
        if (MODO_RESERVAS) {
            document.title = "Reservas - CallCenter";
            const topbar = document.querySelector(".historial__topbar");
            if (topbar) {
                const titulo = document.createElement("h2");
                titulo.textContent = "🗓 Reservas";
                titulo.style.cssText = "margin:0 0 0 8px; font-size:1.6rem; color:var(--color-primario);";
                topbar.insertAdjacentElement("afterbegin", titulo);
            }
            // Ocultar cards de resumen que no aplican en modo reservas
            document.getElementById("resumen-total")?.closest(".resumen-card")?.style.setProperty("display", "none");
            document.getElementById("resumen-whatsapp")?.closest(".resumen-card")?.style.setProperty("display", "none");
            document.getElementById("resumen-ivr")?.closest(".resumen-card")?.style.setProperty("display", "none");
        }

        // Iniciar WebSocket para todos los roles
        iniciarListenerActivos();

        const hoy = hoyLocal();
        let desde = hoy;
        let hasta = hoy;
        if (MODO_RESERVAS) {
            const d = new Date();
            desde = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        }
        document.getElementById("filtro-desde").value = desde;
        document.getElementById("filtro-hasta").value = hasta;
        if (sedeUsuario) document.getElementById("filtro-sede").value = sedeUsuario;

        document.body.classList.add('loaded'); // mostrar skeleton mientras carga
        await cargarPedidos({ desde, hasta, ...(sedeUsuario && { sede: sedeUsuario }) });

        ocultarSkeleton("contenido-principal");
    } catch (error) {
        console.error("Error en auth historial:", error);
        document.body.classList.add('loaded');
    }
});
