/**
 * waPanel.js — WhatsApp Omnicanal Panel
 * Se inicializa con initWaPanel('wa-body', { rol }) desde callcenter-shell.html
 * Renderiza lista de conversaciones + chat inline dentro del panel lateral.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js';
import { supabase } from '../Api/supabaseConfig.js';
import { getSedes } from '../Shared/sedesService.js';

// ── State en memoria (se pierde al recargar — Phase 1) ────────────────────
const SESSION_COLORS = [
    '#25D366', // verde WA
    '#0088cc', // azul
    '#06b6d4', // cyan
    '#6366f1', // indigo
    '#8b5cf6', // violeta
    '#ec4899', // rosa
    '#ef4444', // rojo
    '#f97316', // naranja
    '#facc15', // amarillo
    '#84cc16', // lima
    '#14b8a6', // teal
    '#64748b', // gris azulado
    '#9ca3af', // gris claro
    '#6b7280', // gris medio
    '#1f2937', // gris oscuro / casi negro
    '#ffffff', // blanco
];

const _notifAudio = new Audio('../Audio/notificacion-wa.mp3');
_notifAudio.volume = 0.6;

const _state = {
    sesiones:      [],    // [{ numero, sede, status, tieneQr, color, respuesta_inicial }]
    conv:          {},    // { [numero]: { [phoneContact]: { msgs, unread, lastMsg, lastTs } } }
    activeNum:     null,  // sesión WA activa (pill seleccionada) — null = todas
    activeContact: null,  // conversación abierta
    filterText:    '',
    customNames:   {},    // { [numero]: nombre personalizado } — localStorage
    asignaciones:  {},    // { 'numero:contacto': { asesor, estado } }
    filtroEstado:    null,  // null | 'en_espera' | 'asignado' | 'resuelto'
    filtroAsesor:    new Set(), // Set vacío = todos | Set<key> multiselección
    filtroCiudad:    new Set(), // Set vacío = todas | Set<key> multiselección
    filtroSesiones:    new Set(), // Set<numero> vacío = todas las sesiones
    conteos:           { en_espera: 0, asignado: 0, resuelto: 0 }, // desde Supabase, compartido
    respuestasRapidas: [], // [{ id, titulo, texto }]
    resueltas: { items: [], offset: 0, loading: false, done: false, busqueda: '' }, // paginación infinita
};

// ── Helpers de estado ───────────────────────────────────────────────────────
function _getAsig(num, phone)   { return _state.asignaciones[`${num}:${phone}`]; }
function _getEstado(num, phone) { const a = _getAsig(num, phone); return a ? (a.estado || 'asignado') : 'en_espera'; }
function _esMio(num, phone)     { return _getAsig(num, phone)?.asesor === _asesorActual; }

let _editingNum    = null;  // numero cuya card está en modo edición
let _pendingColors = {};   // { [numero]: colorHex } — selección temporal antes de guardar

// ── Media / voz ─────────────────────────────────────────────────────────────
let _pendingFile      = null;   // File a enviar como adjunto
let _rrPendingFile    = null;   // File seleccionado en el form de RR
let _pendingMediaFetch = null;  // Promise del fetch del adjunto de RR (para esperar antes de enviar)
let _mediaRecorder = null;  // MediaRecorder activo (voz)
let _recChunks     = [];
let _recInterval   = null;
let _recSeconds    = 0;

const LS_KEY_META = 'wap_meta_v1';

function _loadMeta() {
    try {
        const raw = localStorage.getItem(LS_KEY_META);
        if (!raw) return;
        const { customNames } = JSON.parse(raw);
        if (customNames) Object.assign(_state.customNames, customNames);
    } catch { /* ignorar */ }
}

function _saveMeta() {
    try {
        localStorage.setItem(LS_KEY_META, JSON.stringify({ customNames: _state.customNames }));
    } catch { /* ignorar */ }
}

function _sessionLabel(numero) {
    if (_state.customNames[numero]) return _state.customNames[numero];
    const s = _state.sesiones.find(x => x.numero === numero);
    return _capitalizarSede(s?.sede) || _fmtPhone(numero);
}

function _getColor(numero) {
    // Primero: color guardado en BD (viene en _state.sesiones)
    const fromBD = _state.sesiones.find(s => s.numero === numero)?.color;
    if (fromBD) return fromBD;
    // Fallback: hash determinista (misma sesión → mismo color para todos)
    const hash = [...String(numero)].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return SESSION_COLORS[hash % SESSION_COLORS.length];
}

// Devuelve '#ffffff' o '#1f2937' según la luminancia percibida del color de fondo
function _textColorForBg(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

let _rolUsuario   = '';
let _asesorActual = '';

// Mapa sede → ciudad — se construye dinámicamente desde Supabase en initWaPanel
let SEDES_CIUDAD = {};
const CIUDAD_BADGE = { bucaramanga: 'BGA', cartago: 'CAR' };
const CIUDAD_LABEL = { bucaramanga: 'Bucaramanga', cartago: 'Cartago' };

function _ciudadDeSesion(numero) {
    const s    = _state.sesiones.find(s => s.numero === numero);
    const sede = (s?.sede || '').toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return SEDES_CIUDAD[sede] || 'bucaramanga';
}
let _ws              = null;
let _wsEverConnected = false; // true después de la primera conexión exitosa
let _wsRetry         = 0;
let _asesorDdEl      = null;  // dropdown asesor singleton en <body> (escapa overflow:hidden del panel)
let _qrNumero        = null;  // numero cuyo QR modal esta abierto
let _waitingQrFor    = null;  // numero que este cliente esta esperando escanear (solo quien lo genero)
let _qrStepTimers    = [];    // timers de animación de pasos del modal QR
let _tmpMsgId        = 0;     // contador para identificar mensajes optimistas
let _asesoresCache   = [];    // lista de asesores pre-cargada al iniciar
const _pendingStatuses = new Map(); // msgId → {numero,status} para ACKs que llegan antes del echo

const LS_KEY      = 'wap_conv_v2';
const LS_KEY_SES  = 'wap_ses_v1';    // caché de sesiones para render instantáneo
const MAX_MSGS    = 200;   // maximos mensajes guardados por conversacion

// ── API pública ────────────────────────────────────────────────────────────
export function destroyWaPanel() {
    // Cerrar WS sin reconectar y silenciar audio
    if (_ws) { _ws.onclose = null; _ws.onerror = null; _ws.close(); _ws = null; }
    _notifAudio.pause();
    if (_asesorDdEl) { _asesorDdEl.remove(); _asesorDdEl = null; }
}

export function resetWaView() {
    _state.activeContact = null;
    _showListView();
}

export function initWaPanel(bodyId, { rol = '', asesor = '' } = {}) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    _rolUsuario   = rol;
    _asesorActual = asesor;
    _injectStyles();
    _loadMeta();          // restaurar nombres personalizados desde localStorage
    _loadConv();          // caché de msgs para mostrar rápido mientras llega Supabase
    // Restaurar sesiones del caché — permite render instantáneo sin esperar red
    try {
        const rawSes = localStorage.getItem(LS_KEY_SES);
        if (rawSes) {
            _state.sesiones = JSON.parse(rawSes);
            _state.sesiones.forEach(s => _getColor(s.numero)); // restaurar colores
        }
    } catch { /* ignorar */ }
    // Cargar mapa sede→ciudad desde Supabase (fire-and-forget; defecto 'bucaramanga')
    getSedes().then(sedes => {
        SEDES_CIUDAD = Object.fromEntries(
            sedes.map(s => [
                s.name.toLowerCase().replace(/\s/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                (s.ciudad || 'bucaramanga').toLowerCase()
            ])
        );
    });
    _renderShell(body);
    _renderList();        // render inmediato con caché de localStorage
    _loadSessions();
    _loadAsignaciones();
    _loadConversaciones(); // fuente de verdad — reconstruye conv desde Supabase
    _loadRespuestasRapidas();
    _loadAsesores();
    _connectWs();
    setInterval(_loadConversaciones, 60_000); // re-sync cada 60s
    setInterval(_loadAsesores, 5 * 60_000);   // refrescar lista asesores cada 5 min
}

// ── Styles ─────────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('wap-css')) return;
    const s = document.createElement('style');
    s.id = 'wap-css';
    s.textContent = `
/* ── Root ────────────────────────────────────────── */
.wap-root {
    height: 100%;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    font-size: 1.3rem;
    background: var(--color-secundario);
}

/* ── Nav sidebar ─────────────────────────────────── */
.wap-nav {
    width: 48px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    background: var(--color-secundario);
    border-right: 1px solid rgba(40,76,34,.15);
    gap: 4px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
}
.wap-nav::-webkit-scrollbar { display: none; }

.wap-nav-logo {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;
    flex-shrink: 0;
    color: #284c22;
}

.wap-nav-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: none;
    border: none;
    color: rgba(40,76,34,.4);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background .15s, color .15s;
    position: relative;
}
.wap-nav-icon:hover {
    background: rgba(40,76,34,.1);
    color: #284c22;
}
.wap-nav-icon--active {
    background: rgba(40,76,34,.12);
    color: #284c22;
}
.wap-nav-icon--active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: #75892a;
}

/* ── Content area ────────────────────────────────── */
.wap-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
}

/* ── Views ───────────────────────────────────────── */
.wap-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}
.wap-view--hidden { display: none !important; }

/* ── Vista Sesiones ──────────────────────────────── */
.wap-ses-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    font-weight: 700;
    font-size: 1.3rem;
    color: var(--color-terciario);
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
}
.wap-ses-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wap-ses-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--color-secundario);
    border-radius: 10px;
    border-left: 4px solid #ccc;
    border: 1px solid rgba(0,0,0,.08);
    border-left-width: 4px;
}
.wap-ses-card-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.18);
}
.wap-ses-card-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.wap-ses-card-name {
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--color-terciario);
}
.wap-ses-card-num {
    font-size: 1.1rem;
    color: #9ca3af;
}
.wap-ses-badge {
    font-size: 1rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    width: fit-content;
}
.wap-ses-badge--green  { background: #dcfce7; color: #16a34a; }
.wap-ses-badge--yellow { background: #fef9c3; color: #b45309; }
.wap-ses-badge--blue   { background: #dbeafe; color: #1d4ed8; }
.wap-ses-badge--red    { background: #fee2e2; color: #dc2626; }
.wap-ses-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
}
.wap-ses-btn-edit {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: none;
    border: 1.5px solid #d1d5db;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color .15s, color .15s, background .15s;
    flex-shrink: 0;
}
.wap-ses-btn-edit:hover {
    border-color: #284c22;
    color: #284c22;
    background: rgba(40,76,34,.06);
}
.wap-ses-btn-des {
    background: none;
    border: 1.5px solid #ef4444;
    color: #ef4444;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 1.05rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s, color .15s;
}
.wap-ses-btn-des:hover { background: #ef4444; color: #fff; }
.wap-ses-btn-del {
    background: none;
    border: none;
    color: #ef4444;
    border-radius: 6px;
    padding: 4px 6px;
    font-size: 1.2rem;
    cursor: pointer;
    flex-shrink: 0;
    line-height: 1;
    opacity: 0.6;
    transition: opacity .15s, background .15s;
}
.wap-ses-btn-del:hover { opacity: 1; background: #fee2e2; }
.wap-ses-btn-con {
    background: none;
    border: 1.5px solid #25D366;
    color: #25D366;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s, color .15s;
}
.wap-ses-btn-con:hover    { background: #25D366; color: #fff; }
.wap-ses-btn-con:disabled { opacity: .5; cursor: not-allowed; }

/* ── Edit form ───────────────────────────────────── */
.wap-ses-card--editing { flex-direction: column; align-items: stretch; background: var(--color-secundario); }
.wap-ses-edit-form { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.wap-ses-edit-label {
    font-size: 1.05rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: .04em;
}
.wap-ses-edit-input {
    padding: 7px 10px;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    font-size: 1.3rem;
    width: 100%;
    box-sizing: border-box;
    transition: border-color .15s;
}
.wap-ses-edit-input:focus { outline: none; border-color: #284c22; }
.wap-ses-edit-textarea {
    padding: 7px 10px;
    border: 1.5px solid #d1d5db;
    border-radius: 8px;
    font-size: 1.2rem;
    width: 100%;
    resize: vertical;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color .15s;
}
.wap-ses-edit-textarea:focus { outline: none; border-color: #284c22; }
.wap-color-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.wap-color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2.5px solid transparent;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
    cursor: pointer;
    transition: transform .12s, border-color .12s;
    outline: none;
}
.wap-color-swatch:hover { transform: scale(1.15); }
.wap-color-swatch--active {
    border-color: #2d2d2d;
    transform: scale(1.15);
}
.wap-color-swatch--used {
    opacity: 0.25;
    cursor: not-allowed;
    transform: none !important;
}
.wap-ses-edit-btns {
    display: flex;
    gap: 6px;
    margin-top: 2px;
}
.wap-ses-btn-cancel {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    border: 1.5px solid #d1d5db;
    background: #fff;
    color: #374151;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background .15s;
}
.wap-ses-btn-cancel:hover { background: #f3f4f6; }
.wap-ses-btn-save {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    border: none;
    background: #284c22;
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    transition: background .15s;
}
.wap-ses-btn-save:hover { background: #75892a; }

/* ── Panel header (WhatsApp + selector de conexión) ─ */
.wap-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
    background: var(--color-secundario);
    position: relative;
}
/* ── Asesor dropdown (header) ────────────────────── */
.wap-asesor-pills {
    position: relative;
    flex: 1;
    padding: 0;
    min-width: 0;
}
.wap-asesor-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,.12);
    background: transparent;
    color: #374151;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    width: 100%;
    transition: all .15s;
}
.wap-asesor-btn:hover { background: rgba(0,0,0,.05); }
.wap-asesor-btn--active {
    border: 2px solid var(--color-quinto);
    color: var(--color-quinto);
}
.wap-asesor-btn-arrow {
    font-size: .8rem;
    opacity: .6;
    transition: transform .2s;
    flex-shrink: 0;
}
.wap-asesor-btn--open .wap-asesor-btn-arrow { transform: rotate(180deg); }
.wap-asesor-dropdown {
    position: fixed;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,.13);
    z-index: 99999;
    min-width: 160px;
    padding: 4px 0;
    display: none;
}
.wap-asesor-dropdown.open { display: block; }
.wap-asesor-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 16px;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #374151;
    font-weight: 500;
    transition: background .1s;
}
.wap-asesor-opt:hover { background: #f3f4f6; }
.wap-asesor-opt--active { color: var(--color-quinto); font-weight: 700; }
/* ── Wrapper filtros header ──────────────────────── */
.wap-header-filtros {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 6px;
    min-width: 0;
}
/* ── Ciudad dropdown (header) ───────────────────── */
.wap-ciudad-pills {
    position: relative;
    padding: 0;
    flex: 1;
}
.wap-ciudad-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,.12);
    background: transparent;
    color: #374151;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    width: 100%;
    transition: all .15s;
}
.wap-ciudad-btn:hover { background: rgba(0,0,0,.05); }
.wap-ciudad-btn--active {
    border: 2px solid #c97a00;
    color: #c97a00;
}
.wap-ciudad-btn-arrow {
    font-size: .8rem;
    opacity: .6;
    transition: transform .2s;
    flex-shrink: 0;
}
.wap-ciudad-btn--open .wap-ciudad-btn-arrow { transform: rotate(180deg); }
.wap-ciudad-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,.13);
    z-index: 9999;
    min-width: 140px;
    padding: 4px 0;
    display: none;
}
.wap-ciudad-dropdown.open { display: block; }
.wap-ciudad-opt {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 16px;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #374151;
    font-weight: 500;
    transition: background .1s;
}
.wap-ciudad-opt:hover { background: #f3f4f6; }
.wap-ciudad-opt--active { color: #c97a00; font-weight: 700; }
/* Badge BGA/CAR en tarjeta de conversación */
.wap-ciudad-badge {
    display: inline-flex;
    align-items: center;
    font-size: .66rem;
    font-weight: 700;
    letter-spacing: .05em;
    padding: 2px 7px;
    border-radius: 20px;
    flex-shrink: 0;
    background: rgba(0,0,0,.07);
    color: #6b7280;
}
.wap-ciudad-badge--bga { background: var(--color-bga-light); color: var(--color-bga); }
.wap-ciudad-badge--ctg { background: var(--color-ctg-light); color: var(--color-ctg); }
.wap-sessions-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,.12);
    background: transparent;
    color: #374151;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all .15s;
}
.wap-sessions-icon:hover { background: rgba(0,0,0,.05); }

/* ── Sessions colapsable (dropdown flotante) ─────── */
.wap-sessions-wrap {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,.13);
    z-index: 9999;
    min-width: 220px;
    padding: 4px 0;
}
.wap-sessions-active-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.wap-sessions {
    display: flex;
    flex-direction: column;
}
.wap-sessions-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 16px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 500;
    color: #374151;
    text-align: left;
    transition: background .1s;
}
.wap-sessions-item:hover { background: #f3f4f6; }
.wap-sessions-item--active {
    color: var(--color-quinto);
    font-weight: 700;
}
.wap-sessions-status {
    width: 9px; height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
}
.wap-sessions-status--green  { background: #22c55e; }
.wap-sessions-status--yellow { background: #f59e0b; }
.wap-sessions-status--red    { background: #ef4444; }
.wap-sessions-color-bar {
    width: 3px;
    height: 18px;
    border-radius: 2px;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,.18);
}
.wap-sessions-name { flex: 1; }
.wap-sessions-cb {
    width: 16px; height: 16px;
    border: 2px solid #d1d5db;
    border-radius: 3px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background .12s, border-color .12s;
}
.wap-sessions-cb--checked {
    background: var(--color-primario);
    border-color: var(--color-primario);
}
.wap-sessions-cb--checked::after {
    content: '';
    width: 9px; height: 5px;
    border-left: 2px solid #fff;
    border-bottom: 2px solid #fff;
    transform: rotate(-45deg) translate(1px, -1px);
    display: block;
}
.wap-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1.5px solid var(--color-cuaternario);
    background: transparent;
    color: var(--color-terciario);
    font-size: 1.2rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background .15s, color .15s;
}
.wap-pill--active {
    /* color viene inline desde _getColor() */
    font-weight: 700;
}
.wap-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
.wap-dot--green  { background: #25D366; }
.wap-dot--yellow { background: #f59e0b; }
.wap-dot--red    { background: #ef4444; }

/* ── Session pill wrapper + disconnect btn ───────── */
.wap-pill-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
}
.wap-pill-descon {
    background: none;
    border: none;
    color: #9ca3af;
    font-size: 1rem;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    border-radius: 50%;
    transition: color .15s, background .15s;
}
.wap-pill-descon:hover {
    color: #ef4444;
    background: rgba(239,68,68,.1);
}

/* ── Connect button (admin) ───────────────────────── */
.wap-btn-connect {
    margin: 6px 10px 4px;
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: var(--color-primario);
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s;
}
.wap-btn-connect:hover { background: var(--color-cuaternario); }

/* ── Connect form (admin) ─────────────────────────── */
.wap-connect-form {
    padding: 10px;
    background: #fff;
    border-bottom: 1px solid rgba(0,0,0,.08);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
}
.wap-connect-form input,
.wap-connect-form select {
    padding: 7px 10px;
    border: 1.5px solid #ddd;
    border-radius: 8px;
    font-size: 1.3rem;
    width: 100%;
    box-sizing: border-box;
}
.wap-connect-form-btns {
    display: flex;
    gap: 6px;
}
.wap-connect-form-btns button {
    flex: 1;
    padding: 7px 0;
    border-radius: 8px;
    border: none;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
}
.wap-btn-ok  { background: var(--color-primario); color: #fff; }
.wap-btn-cancel { background: #e5e7eb; color: #374151; }

/* ── Search ──────────────────────────────────────── */
.wap-search {
    padding: 8px 10px 6px;
    flex-shrink: 0;
}
.wap-search input {
    width: 100%;
    padding: 7px 12px;
    border: 1.5px solid #ddd;
    border-radius: 20px;
    font-size: 1.3rem;
    background: #fff;
    box-sizing: border-box;
}
.wap-search input:focus {
    outline: none;
    border-color: var(--color-cuaternario);
}

/* ── Conversation list ───────────────────────────── */
.wap-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}
.wap-empty {
    color: #aaa;
    font-size: 1.25rem;
    text-align: center;
    padding: 24px 16px;
    margin: 0;
}
.wap-conv-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px 10px 0;
    cursor: pointer;
    border-bottom: 1px solid rgba(0,0,0,.05);
    transition: background .12s;
}
.wap-conv-item:hover { background: rgba(0,0,0,.04); }
.wap-conv-stripe {
    position: relative;
    width: 6px;
    align-self: stretch;
    flex-shrink: 0;
    border-radius: 0 2px 2px 0;
    margin-top: -10px;
    margin-bottom: -10px;
    cursor: default;
    transition: width .15s;
}
.wap-conv-stripe:hover { width: 9px; }
.wap-conv-stripe::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0,0,0,.72);
    color: #fff;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity .1s;
    z-index: 9999;
}
.wap-conv-stripe:hover::after { opacity: 1; }
.wap-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--color-cuaternario);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    font-weight: 700;
    flex-shrink: 0;
    position: relative;
}
/* Mini-avatar del asesor asignado, superpuesto sobre el avatar del contacto */
.wap-asesor-dot {
    position: absolute;
    bottom: -3px;
    right: -3px;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    border: 2px solid #fff;
    font-size: .65rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}
/* Prefijo asesor en preview de último mensaje */
.wap-conv-asesor-pre {
    color: #374151;
    font-weight: 600;
}
.wap-conv-info {
    flex: 1;
    min-width: 0;
}
.wap-conv-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 4px;
}
.wap-conv-name {
    font-weight: 600;
    font-size: 1.3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-terciario);
    flex: 1;
    min-width: 0;
}
.wap-conv-ts {
    font-size: 1.05rem;
    color: #9ca3af;
    flex-shrink: 0;
}
.wap-conv-phone {
    font-size: 1.1rem;
    color: #9ca3af;
}
.wap-conv-last {
    font-size: 1.2rem;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}
.wap-badge {
    background: #25D366;
    color: #fff;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 1.05rem;
    font-weight: 700;
    flex-shrink: 0;
}

/* ── Filtros wrap ────────────────────────────────── */
.wap-filtros-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px 6px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(0,0,0,.06);
    overflow-x: auto;
}
.wap-filtros-wrap::-webkit-scrollbar { display: none; }

/* ── Filtros de estado ───────────────────────────── */
.wap-filtros {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}
.wap-filtro {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 11px;
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,.1);
    background: transparent;
    color: #374151;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s, color .15s, border-color .15s;
    white-space: nowrap;
    flex-shrink: 0;
}
.wap-filtro:hover {
    background: rgba(0,0,0,.04);
    border-color: rgba(0,0,0,.18);
}
.wap-filtro--active {
    background: transparent;
    border: 2px solid var(--color-quinto);
    color: var(--color-quinto);
    font-weight: 700;
}
.wap-filtro--active:hover {
    background: rgba(0,0,0,.04);
}
.wap-filtro-count {
    font-size: 1.05rem;
    font-weight: 700;
    opacity: .8;
}
.wap-filtro--active .wap-filtro-count { opacity: 1; }

/* ── Tags de estado en conversación ─────────────── */
.wap-estado-tag {
    display: inline-block;
    font-size: 1rem;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 10px;
}
.wap-estado--espera  { background: #fef9c3; color: #b45309; }
.wap-estado--mio     { background: #dbeafe; color: #1d4ed8; }
.wap-estado--resuelto{ background: #dcfce7; color: #16a34a; }

/* ── Resueltas — lista enriquecida ───────────────── */
.wap-r-date-sep {
    text-align: center;
    font-size: 1rem;
    font-weight: 700;
    color: #9ca3af;
    letter-spacing: .1em;
    padding: 10px 0 4px;
}
.wap-r-mid {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    flex-wrap: wrap;
}
.wap-r-asesor {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 1.05rem;
    color: #9ca3af;
    font-weight: 400;
    white-space: nowrap;
    margin-top: 2px;
}
.wap-r-sede-badge {
    display: inline-block;
    font-size: .95rem;
    font-weight: 700;
    padding: 1px 8px;
    border-radius: 10px;
    white-space: nowrap;
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
    margin-top: 2px;
}
.wap-r-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 3px;
}
.wap-r-razon {
    font-size: 1.1rem;
    color: #9ca3af;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
}
.wap-r-badge-resuelto {
    display: inline-block;
    background: #dcfce7;
    color: #15803d;
    border: 1px solid #bbf7d0;
    font-size: .9rem;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: 10px;
    flex-shrink: 0;
}

/* ── Asignaciones ────────────────────────────────── */
.wap-conv-item--libre {
    background: #fffbeb;
}
.wap-tomar-btn {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 70px;
    background: var(--color-primario);
    border: none;
    cursor: pointer;
    border-radius: 0 4px 4px 0;
    transition: background .15s;
    flex-shrink: 0;
    color: var(--color-secundario);
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: .08em;
}
.wap-tomar-btn:hover {
    background: var(--color-cuaternario);
}
.wap-mio-tag {
    display: inline-block;
    background: rgba(40,76,34,.12);
    color: #284c22;
    font-size: 1rem;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
    margin-top: 3px;
}
.wap-resolver-btn, .wap-liberar-btn {
    background: none;
    border: 1.5px solid #22c55e;
    border-radius: 16px 0 0 16px;
    padding: 4px 12px;
    font-size: 1.05rem;
    font-weight: 600;
    color: #16a34a;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background .15s;
    white-space: nowrap;
}
.wap-resolver-btn:hover,
.wap-liberar-btn:hover { background: #dcfce7; }

/* ── Split button acciones chat ──────────────────── */
.wap-chat-actions-wrap {
    position: relative;
    flex-shrink: 0;
}
.wap-chat-actions-split {
    display: flex;
    align-items: stretch;
}
.wap-actions-toggle {
    background: none;
    border: 1.5px solid #22c55e;
    border-left: none;
    border-radius: 0 16px 16px 0;
    padding: 4px 9px;
    color: #16a34a;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1;
    transition: background .15s;
    display: flex;
    align-items: center;
}
.wap-actions-toggle:hover { background: #dcfce7; }
.wap-actions-menu {
    display: none;
    position: absolute;
    top: calc(100% + 5px);
    right: 0;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 6px 18px rgba(0,0,0,.13);
    min-width: 170px;
    z-index: 200;
    overflow: hidden;
}
.wap-actions-menu.open { display: block; }
.wap-action-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 10px 15px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.93rem;
    color: #374151;
    transition: background .12s;
    white-space: nowrap;
}
.wap-action-item:hover { background: #f3f4f6; }
/* Sub-lista asesores */
.wap-asesores-list {
    border-top: 1px solid #f3f4f6;
    max-height: 200px;
    overflow-y: auto;
}
.wap-asesor-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 15px 8px 30px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: #374151;
    text-align: left;
    transition: background .12s;
}
.wap-asesor-item:hover { background: #eff6ff; color: #1d4ed8; }
.wap-asesor-item--loading { color: #9ca3af; cursor: default; }
.wap-asesor-item--loading:hover { background: none; color: #9ca3af; }

/* ── Chat view ───────────────────────────────────── */
.wap-chat {
    display: none;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    position: relative;
}
/* Header clickable (avatar + info) */
.wap-chat-avatar { cursor: pointer; }
.wap-chat-info   { cursor: pointer; }
.wap-chat-avatar:hover,
.wap-chat-info:hover { opacity: .82; }

/* ── Panel datos del cliente ─────────────────────── */
/* ── Panel datos del cliente ─────────────────────────── */
#wap-client-panel {
    position: absolute;
    inset: 0;
    background: var(--color-secundario);
    z-index: 20;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform .22s cubic-bezier(.4,0,.2,1);
    pointer-events: none;
    overflow: hidden;
}
#wap-client-panel.wap-cp--open {
    transform: translateX(0);
    pointer-events: auto;
}
.wap-cp-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
    background: var(--color-secundario);
}
.wap-cp-back {
    background: none;
    border: none;
    font-size: 1.6rem;
    cursor: pointer;
    color: var(--color-primario);
    padding: 0;
    line-height: 1;
}
.wap-cp-title {
    font-weight: 700;
    font-size: 1.3rem;
    color: var(--color-terciario);
}
.wap-cp-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 16px;
}
/* Hero */
.wap-cp-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: 22px 16px 14px;
}
.wap-cp-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.2rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-bottom: 6px;
}
.wap-cp-name {
    font-size: 1.55rem;
    font-weight: 700;
    color: var(--color-terciario);
    text-align: center;
    line-height: 1.3;
    cursor: text;
    border-bottom: 1.5px dashed transparent;
    transition: border-color .15s;
    padding-bottom: 1px;
}
.wap-cp-name:hover { border-bottom-color: #9ca3af; }
.wap-cp-name-input {
    font-size: 1.55rem;
    font-weight: 700;
    color: var(--color-terciario);
    text-align: center;
    background: none;
    border: none;
    border-bottom: 2px solid var(--color-primario);
    outline: none;
    width: 100%;
    padding: 0 4px 1px;
    font-family: inherit;
}
.wap-cp-phone-hero {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #6b7280;
    font-size: 1.2rem;
}
.wap-cp-copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 2px;
    transition: color .15s;
    display: flex;
    align-items: center;
}
.wap-cp-copy-btn:hover { color: var(--color-primario); }
.wap-cp-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    margin-top: 4px;
}
.wap-cp-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 1.05rem;
    font-weight: 600;
}
.wap-cp-badge--frecuente   { background: #fef3c7; color: #b45309; }
.wap-cp-badge--identificado{ background: #dcfce7; color: #15803d; }
.wap-cp-canal {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 1.1rem;
    color: #9ca3af;
    margin-top: 2px;
}
/* Banner LID */
.wap-cp-lid-section {
    margin: 0 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 12px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wap-cp-lid-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #92400e;
}
.wap-cp-lid-desc {
    font-size: 1.05rem;
    color: #a16207;
    line-height: 1.4;
}
.wap-cp-lid-row {
    display: flex;
    gap: 8px;
}
.wap-cp-lid-input {
    flex: 1;
    border: 1.5px solid #fcd34d;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 1.2rem;
    outline: none;
    background: #fff;
}
.wap-cp-lid-input:focus { border-color: #f59e0b; }
.wap-cp-lid-ok {
    background: #f59e0b;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
.wap-cp-lid-ok:hover { background: #d97706; }
/* Sections */
.wap-cp-section { padding: 0 14px; }
.wap-cp-section-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 9px;
}
.wap-cp-section-title {
    font-size: 1rem;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: .06em;
}
.wap-cp-ver-todos {
    font-size: 1.05rem;
    color: var(--color-primario);
    text-decoration: none;
    font-weight: 600;
}
/* Stats */
.wap-cp-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}
.wap-cp-stat {
    background: #fff;
    border-radius: 10px;
    padding: 10px 12px;
}
.wap-cp-stat--full { grid-column: 1 / -1; }
.wap-cp-stat-label {
    font-size: 1rem;
    color: #9ca3af;
    margin-bottom: 3px;
}
.wap-cp-stat-value {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--color-terciario);
}
/* Dirección */
.wap-cp-address {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: #fff;
    border-radius: 10px;
    padding: 12px;
}
.wap-cp-address-info { flex: 1; min-width: 0; }
.wap-cp-address-text {
    font-size: 1.2rem;
    color: var(--color-terciario);
    font-weight: 500;
}
.wap-cp-address-sub {
    font-size: 1.05rem;
    color: #9ca3af;
    margin-top: 2px;
}
.wap-cp-edit-btn {
    background: none;
    border: 1.5px solid rgba(0,0,0,.15);
    border-radius: 8px;
    padding: 4px 12px;
    font-size: 1.1rem;
    cursor: pointer;
    color: var(--color-terciario);
    white-space: nowrap;
    flex-shrink: 0;
    transition: border-color .15s, color .15s;
}
.wap-cp-edit-btn:hover { border-color: var(--color-primario); color: var(--color-primario); }
/* Pedidos */
.wap-cp-order {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 12px;
    background: #fff;
    border-radius: 10px;
    margin-bottom: 6px;
}
.wap-cp-order:last-child { margin-bottom: 0; }
.wap-cp-order-left { display: flex; align-items: center; gap: 8px; }
.wap-cp-order-date { font-size: 1.1rem; color: var(--color-terciario); font-weight: 500; }
.wap-cp-order-sede { font-size: 1rem; color: #9ca3af; }
.wap-cp-order-total { font-size: 1.2rem; font-weight: 700; color: var(--color-terciario); }
.wap-cp-orders-empty { font-size: 1.1rem; color: #9ca3af; padding: 6px 0; }
/* Tags / notas */
.wap-cp-tags-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    align-items: center;
}
.wap-cp-tag {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 4px 11px;
    font-size: 1.1rem;
    color: var(--color-terciario);
}
.wap-cp-tag-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    font-size: 1.1rem;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    transition: color .12s;
}
.wap-cp-tag-remove:hover { color: #ef4444; }
.wap-cp-add-note {
    background: none;
    border: 1.5px dashed #d1d5db;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 1.1rem;
    color: #9ca3af;
    cursor: pointer;
    transition: border-color .15s, color .15s;
}
.wap-cp-add-note:hover { border-color: var(--color-primario); color: var(--color-primario); }
/* Actions footer */
.wap-cp-actions {
    display: flex;
    gap: 7px;
    padding: 11px 14px;
    border-top: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
    background: var(--color-secundario);
}
.wap-cp-btn-sec {
    flex: 1;
    background: #fff;
    border: 1.5px solid rgba(0,0,0,.12);
    border-radius: 10px;
    padding: 9px 4px;
    font-size: 1.05rem;
    cursor: pointer;
    color: var(--color-terciario);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
    transition: border-color .15s, color .15s;
}
.wap-cp-btn-sec:hover { border-color: var(--color-primario); color: var(--color-primario); }
.wap-cp-btn-primary {
    flex: 1.3;
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 9px 4px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: background .15s;
}
.wap-cp-btn-primary:hover { background: var(--color-cuaternario); }
.wap-chat-header {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 12px;
    background: #fff;
    color: var(--color-terciario);
    flex-shrink: 0;
    border-left: 4px solid transparent;
    border-bottom: 1px solid rgba(0,0,0,.09);
}
.wap-back {
    background: none;
    border: none;
    color: var(--color-primario);
    font-size: 1.7rem;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
}
.wap-chat-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--color-cuaternario);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    font-weight: 700;
    flex-shrink: 0;
    text-transform: uppercase;
}
.wap-chat-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
}
.wap-chat-name-row {
    display: flex;
    align-items: center;
    gap: 5px;
}
.wap-chat-name {
    font-weight: 700;
    font-size: 1.35rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-terciario);
}
.wap-edit-name-btn {
    background: none;
    border: none;
    color: rgba(40,76,34,.45);
    font-size: 1.3rem;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    transition: color .15s;
}
.wap-edit-name-btn:hover { color: var(--color-primario); }
.wap-vincular-lid-btn {
    background: none;
    border: none;
    color: #f59e0b;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    transition: color .15s;
}
.wap-vincular-lid-btn:hover { color: #d97706; }
.wap-name-input {
    background: rgba(40,76,34,.08);
    border: 1px solid rgba(40,76,34,.3);
    border-radius: 6px;
    color: var(--color-terciario);
    font-size: 1.4rem;
    font-weight: 700;
    padding: 2px 8px;
    width: 160px;
}
.wap-name-input::placeholder { color: rgba(40,76,34,.4); }
.wap-name-input:focus { outline: none; background: rgba(40,76,34,.12); }
.wap-chat-via {
    font-size: 1rem;
    color: #6b7280;
    margin-top: 1px;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-chat-conexion {
    font-size: 0.9rem;
    color: #9ca3af;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
}
.wap-chat-via-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
.wap-chat-via--atencion .wap-chat-via-dot { background: #22c55e; }
.wap-chat-via--resuelto .wap-chat-via-dot { background: #9ca3af; }
.wap-chat-via--espera   .wap-chat-via-dot { background: #f59e0b; }
.wap-fecha-sep {
    display: flex;
    justify-content: center;
    position: sticky;
    top: 6px;
    z-index: 10;
    pointer-events: none;
    margin: 6px 0 2px;
}
.wap-fecha-sep span {
    background: rgba(0,0,0,0.32);
    color: #fff;
    border-radius: 8px;
    font-size: 1.1rem;
    padding: 3px 10px;
    backdrop-filter: blur(3px);
    white-space: nowrap;
}
.wap-msgs {
    flex: 1;
    overflow-y: auto;
    padding: 10px 10px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    background: #ece5dd;
}
.wap-msg {
    max-width: 85%;
    padding: 6px 10px;
    border-radius: 10px;
    font-size: 1.3rem;
    line-height: 1.4;
    word-break: break-word;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.wap-msg--in {
    background: #fff;
    align-self: flex-start;
    border-radius: 0 10px 10px 10px;
    position: relative;
}
.wap-msg--out {
    background: #d9fdd3;
    align-self: flex-end;
    border-radius: 10px 10px 0 10px;
    position: relative;
}
.wap-msg-menu-btn {
    display: none;
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(0,0,0,.15);
    color: #333;
    border: none;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    transition: background .12s;
    z-index: 2;
}
.wap-msg-menu-btn:hover { background: rgba(0,0,0,.28); }
.wap-msg--out:hover .wap-msg-menu-btn,
.wap-msg--in:hover  .wap-msg-menu-btn  { display: flex; }
.wap-msg-reply-direct {
    display: none;
    position: absolute;
    top: 4px;
    right: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0,0,0,.12);
    color: #374151;
    border: none;
    font-size: 1.1rem;
    cursor: pointer;
    align-items: center;
    justify-content: center;
    transition: background .12s;
}
.wap-msg-reply-direct:hover { background: rgba(0,0,0,.22); }
.wap-msg--in:hover .wap-msg-reply-direct { display: flex; }
.wap-msg-dropdown {
    position: absolute;
    top: 26px;
    right: 4px;
    background: #fff;
    border: 1px solid rgba(0,0,0,.12);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,.15);
    z-index: 30;
    min-width: 130px;
    overflow: hidden;
    display: none;
}
.wap-msg-dropdown.open { display: block; }
.wap-msg-dropdown-item {
    display: block;
    width: 100%;
    padding: 8px 14px;
    background: none;
    border: none;
    text-align: left;
    font-size: 1.2rem;
    cursor: pointer;
    color: #374151;
    transition: background .1s;
}
.wap-msg-dropdown-item:hover { background: rgba(0,0,0,.06); }
.wap-msg-dropdown-item--danger { color: #ef4444; }
.wap-msg-dropdown-item--danger:hover { background: #fef2f2; }
/* Modal reenvío */
.wap-fwd-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.45);
    z-index: 9000;
    align-items: center;
    justify-content: center;
}
.wap-fwd-overlay.open { display: flex; }
.wap-fwd-modal {
    background: #fff;
    border-radius: 14px;
    width: 320px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,.25);
    overflow: hidden;
}
.wap-fwd-header {
    padding: 14px 16px 10px;
    font-weight: 600;
    font-size: 1.4rem;
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.wap-fwd-close {
    background: none;
    border: none;
    font-size: 1.6rem;
    cursor: pointer;
    color: #6b7280;
    line-height: 1;
    padding: 0 2px;
}
.wap-fwd-search {
    margin: 10px 12px 6px;
    padding: 7px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    font-size: 1.2rem;
    outline: none;
}
.wap-fwd-list {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0 8px;
}
.wap-fwd-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    cursor: pointer;
    transition: background .12s;
}
.wap-fwd-item:hover { background: #f3f4f6; }
.wap-fwd-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 1.2rem;
    flex-shrink: 0;
}
.wap-fwd-name {
    font-size: 1.25rem;
    color: #111827;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-fwd-sub {
    font-size: 1.05rem;
    color: #9ca3af;
}
/* Edición inline */
.wap-msg-edit-form {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 2px;
}
.wap-msg-edit-form textarea {
    border: 1px solid rgba(40,76,34,.4);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 1.2rem;
    font-family: inherit;
    resize: none;
    outline: none;
    background: #fff;
    min-width: 160px;
}
.wap-msg-edit-form textarea:focus { border-color: var(--color-primario); }
.wap-msg-edit-btns { display: flex; gap: 5px; justify-content: flex-end; }
.wap-msg-edit-save {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 1.1rem;
    cursor: pointer;
}
.wap-msg-edit-save:hover { background: var(--color-cuaternario); }
.wap-msg-edit-cancel {
    background: none;
    border: 1px solid rgba(0,0,0,.2);
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 1.1rem;
    cursor: pointer;
    color: #555;
}
.wap-msg-edit-cancel:hover { background: rgba(0,0,0,.06); }
.wap-msg--celular {
    background: #ede9fe;
    border-left: 3px solid #7c3aed;
}
.wap-msg--sistema {
    align-self: center;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 3px 12px;
    color: #9ca3af;
    font-size: 1rem;
    font-style: italic;
    text-align: center;
    max-width: 85%;
    box-shadow: none;
}
.wap-espera-bar {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: #fffbeb;
    border-top: 2px solid #fde68a;
    font-size: 1.05rem;
    color: #92400e;
    flex-shrink: 0;
}
.wap-espera-bar.visible { display: flex; }
.wap-espera-btns { display: flex; gap: 6px; flex-shrink: 0; }
.wap-tomar-chat-btn {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
}
.wap-tomar-chat-btn:hover { background: var(--color-cuaternario); }
.wap-resolver-espera-btn {
    background: none;
    border: 1.5px solid #22c55e;
    border-radius: 8px;
    padding: 5px 14px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    color: #16a34a;
    white-space: nowrap;
}
.wap-resolver-espera-btn:hover { background: #dcfce7; }
.wap-resuelto-bar {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: #f8fafc;
    border-top: 2px solid #e2e8f0;
    font-size: 1.05rem;
    color: #64748b;
    flex-shrink: 0;
}
.wap-resuelto-bar.visible { display: flex; }
.wap-abrir-btn {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 4px 14px;
    font-size: 1.1rem;
    cursor: pointer;
    font-weight: 600;
}
.wap-abrir-btn:hover { background: #15803d; }
.wap-msg-celular-label {
    font-size: 1rem;
    font-weight: 600;
    color: #7c3aed;
    margin-bottom: 1px;
}
.wap-msg-asesor {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-primario);
    margin-bottom: 1px;
}
.wap-msg-text { color: var(--color-terciario); white-space: pre-wrap; word-break: break-word; }
.wap-msg-img { display: block; max-width: 260px; max-height: 300px; border-radius: 8px; cursor: zoom-in; object-fit: cover; }
.wap-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.88); display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
.wap-lightbox img { max-width: 92vw; max-height: 92vh; border-radius: 8px; object-fit: contain; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
.wap-lightbox-close { position: absolute; top: 16px; right: 20px; background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; line-height: 1; opacity: .8; }
.wap-lightbox-close:hover { opacity: 1; }
.wap-msg-sticker { display: block; width: 120px; height: 120px; object-fit: contain; }
.wap-msg-audio { display: block; width: 240px; height: 36px; outline: none; }
.wap-msg-video { display: block; max-width: 280px; max-height: 220px; border-radius: 8px; background: #000; }
.wap-msg-doc { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(0,0,0,.06); border-radius: 8px; color: var(--color-terciario); text-decoration: none; font-size: 13px; word-break: break-all; }
.wap-msg-doc:hover { background: rgba(0,0,0,.12); }
.wap-msg:has(.wap-reactions) { margin-bottom: 16px; }
.wap-reactions { position: absolute; bottom: -14px; right: 6px; display: flex; gap: 3px; z-index: 1; }
.wap-msg--in .wap-reactions { right: auto; left: 6px; }
.wap-reaction-badge { display: inline-flex; align-items: center; padding: 2px 6px; background: #fff; border-radius: 12px; font-size: 14px; cursor: default; box-shadow: 0 1px 3px rgba(0,0,0,.20); border: 1px solid rgba(0,0,0,.06); line-height: 1.4; }
.wap-msg-ts {
    font-size: 1rem;
    color: #9ca3af;
    align-self: flex-end;
}
.wap-msg-edited {
    font-size: 1rem;
    color: #9ca3af;
    font-style: italic;
    align-self: flex-end;
}
.wap-input-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px;
    background: transparent;
    flex-shrink: 0;
}
/* Contenedor blanco que envuelve attach + textarea */
.wap-input-wrapper {
    flex: 1;
    display: flex;
    align-items: flex-end;
    background: #fff;
    border-radius: 24px;
    min-height: 38px;
    overflow: hidden;
}
.wap-input-row textarea {
    flex: 1;
    padding: 8px 12px 8px 12px;
    border: none;
    border-radius: 0;
    font-size: 1.3rem;
    font-family: inherit;
    background: transparent;
    resize: none;
    overflow-y: auto;
    min-height: 38px;
    max-height: 120px;
    line-height: 1.4;
    scrollbar-width: thin;
}
.wap-input-row textarea:focus { outline: none; }
/* Botones circulares externos (voice y send) */
.wap-input-row button {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 38px;
    height: 38px;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background .15s;
}
.wap-input-row button:hover { background: var(--color-cuaternario); }

/* ── Adjuntar — dentro del input, sin círculo ────── */
.wap-input-row .wap-attach-btn {
    background: transparent;
    color: #9ca3af;
    border-radius: 0;
    width: 38px;
    height: 38px;
    font-size: 1.5rem;
    flex-shrink: 0;
}
.wap-input-row .wap-attach-btn:hover { background: rgba(0,0,0,.04); color: #374151; }

/* ── Cancelar grabación (externo, gris) ──────────── */
.wap-input-row .wap-rec-cancel-btn {
    background: #e5e7eb;
    color: #374151;
    font-size: 1.4rem;
}
.wap-input-row .wap-rec-cancel-btn:hover { background: #d1d5db; }

/* ── Voz — dentro del input, fondo transparente ───── */
.wap-input-row .wap-voice-btn {
    background: transparent;
    color: #9ca3af;
    border-radius: 0;
    font-size: 1.5rem;
}
.wap-input-row .wap-voice-btn:hover { background: rgba(0,0,0,.04); color: #374151; }

/* ── Enviar — verde WA, fuera del wrapper ─────────── */
#wap-send { background: #25D366; font-size: 1.4rem; }
#wap-send:hover { background: #1da851; }

/* ── Grabando ─────────────────────────────────────── */
.wap-input-row .wap-voice-btn--rec {
    background: #ef4444 !important;
    color: #fff !important;
    animation: wap-rec-pulse 1s ease-in-out infinite;
}
@keyframes wap-rec-pulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.12); }
}

/* ── Barra de carga adjunto RR ───────────────────── */
.wap-media-loading {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #f3f4f6;
    border-top: 1px solid #e5e7eb;
    font-size: 1.15rem;
    color: #9ca3af;
    flex-shrink: 0;
}
.wap-media-loading-name {
    flex: 0 1 auto;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.wap-media-loading-bar {
    flex: 1;
    height: 3px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
}
.wap-media-loading-fill {
    height: 100%;
    background: var(--color-primario);
    border-radius: 2px;
    width: 0%;
    transition: width .1s linear;
}
.wap-media-loading-pct {
    flex: 0 0 auto;
    font-size: 1.1rem;
    font-weight: 600;
    min-width: 34px;
    text-align: right;
    color: #6b7280;
}

/* ── Preview de archivo adjunto ──────────────────── */
.wap-media-preview {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #e0f2fe;
    border-top: 1px solid #bae6fd;
    font-size: 1.2rem;
    color: #0369a1;
    flex-shrink: 0;
}
.wap-media-preview-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
}
.wap-media-preview-cancel {
    background: none !important;
    border: none !important;
    cursor: pointer;
    color: #64748b;
    font-size: 1.4rem;
    padding: 2px 4px;
    border-radius: 4px;
    width: auto !important;
    height: auto !important;
}
.wap-media-preview-cancel:hover { background: #bae6fd !important; }

/* ── Banner sesión desconectada (en chat) ────────── */
.wap-offline-bar {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    background: #fef2f2;
    border-top: 1px solid #fecaca;
    color: #dc2626;
    font-size: 1.15rem;
    font-weight: 500;
    flex-shrink: 0;
    text-align: center;
}
.wap-offline-bar.visible { display: flex; }

/* ── Indicador offline en card de conversación ───── */
.wap-conv-item--offline {
    opacity: 0.65;
}
.wap-offline-tag {
    font-size: 1rem;
    font-weight: 600;
    color: #dc2626;
    background: #fee2e2;
    padding: 1px 6px;
    border-radius: 4px;
}

/* ── Toast ───────────────────────────────────────── */
.wap-toast {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(0);
    background: #25D366;
    color: #fff;
    padding: 10px 22px;
    border-radius: 24px;
    font-size: 1.4rem;
    font-weight: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    z-index: 9600;
    animation: wap-toast-in .3s ease;
    white-space: nowrap;
}
@keyframes wap-toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(12px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── Flash icon (nuevo mensaje) ──────────────────── */
@keyframes wap-flash {
    0%, 100% { color: var(--color-secundario); }
    50%       { color: #25D366; }
}
.wap-flash { animation: wap-flash .5s ease 3; }

/* ── QR Modal ────────────────────────────────────── */
.wap-qr-modal {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.65);
    z-index: 9500;
    display: none;
    align-items: center;
    justify-content: center;
}
.wap-qr-modal.active { display: flex; }
.wap-qr-box {
    background: #fff;
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
    max-width: 300px;
    width: 90%;
    box-shadow: 0 20px 60px rgba(0,0,0,.3);
}
.wap-qr-box h3 {
    font-size: 1.6rem;
    color: var(--color-primario);
    margin-bottom: 6px;
}
.wap-qr-num {
    font-size: 1.2rem;
    color: #6b7280;
    margin-bottom: 16px;
}
.wap-qr-img {
    margin: 0 auto 14px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.wap-qr-img img {
    width: 220px;
    height: 220px;
    border-radius: 8px;
}
.wap-qr-hint {
    font-size: 1.15rem;
    color: #6b7280;
    margin-bottom: 16px;
    line-height: 1.4;
}
.wap-qr-close {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 28px;
    font-size: 1.3rem;
    font-weight: 700;
    cursor: pointer;
}
/* ── QR Loader (mientras genera QR) ─────────── */
.wap-qr-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 0 8px;
    gap: 18px;
    min-height: 190px;
}
.wap-qr-spinner {
    width: 52px;
    height: 52px;
    border: 4px solid rgba(37,211,102,.2);
    border-top-color: #25D366;
    border-radius: 50%;
    animation: wap-spin 0.85s linear infinite;
}
@keyframes wap-spin { to { transform: rotate(360deg); } }
.wap-qr-step {
    font-size: 1.2rem;
    color: #4b5563;
    text-align: center;
    margin: 0;
    min-height: 1.6em;
    transition: opacity 0.3s;
}
.wap-qr-step.fade { opacity: 0; }
.wap-qr-scanned {
    width: 52px; height: 52px;
    border-radius: 50%;
    background: #25D366;
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 2.2rem; font-weight: 700;
    animation: wap-scanned-pop 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes wap-scanned-pop {
    from { transform: scale(0); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
}

/* ── Indicador WS ────────────────────────────────── */
.wap-ws-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    margin: auto auto 10px;
    flex-shrink: 0;
    transition: background .3s;
}
.wap-ws-dot--ok           { background: #22c55e; }
.wap-ws-dot--reconectando { background: #f59e0b; animation: wap-ws-pulse 1.2s infinite; }
.wap-ws-dot--desconectado { background: #ef4444; }
@keyframes wap-ws-pulse { 0%,100%{opacity:1} 50%{opacity:.25} }

/* ── Ticks de estado (enviado/entregado/leído) ───── */
.wap-msg-ticks {
    display: inline-flex;
    align-items: center;
    margin-left: 3px;
    vertical-align: middle;
    flex-shrink: 0;
}

/* ── Mensajes pendientes / fallidos ─────────────── */
.wap-msg--pending { opacity: 0.55; }
.wap-msg--failed  { background: #fee2e2 !important; }
.wap-msg-status   { font-size: 0.9rem; margin-left: 4px; }
.wap-msg-retry {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 6px;
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
}
.wap-msg-retry:hover { background: #dc2626; }

/* ── Barra de respuesta (reply preview) ─────────── */
.wap-reply-bar {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #e8f5e9;
    border-top: 2px solid var(--color-primario);
    flex-shrink: 0;
}
.wap-reply-bar.visible { display: flex; }
.wap-reply-preview {
    flex: 1;
    min-width: 0;
    border-left: 3px solid var(--color-primario);
    padding-left: 8px;
}
.wap-reply-author {
    display: block;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-primario);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-reply-text {
    display: block;
    font-size: 1.1rem;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-reply-cancel {
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    font-size: 1.4rem;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
}
.wap-reply-cancel:hover { color: #374151; background: rgba(0,0,0,.06); }

/* ── Bloque citado dentro de burbuja ─────────────── */
.wap-msg-quoted {
    border-left: 3px solid rgba(0,0,0,.25);
    padding: 3px 8px;
    margin-bottom: 3px;
    border-radius: 0 4px 4px 0;
    background: rgba(0,0,0,.06);
}
.wap-msg--out .wap-msg-quoted { border-color: var(--color-primario); background: rgba(40,76,34,.08); }
.wap-msg-quoted-author { display: block; font-size: 1rem; font-weight: 600; color: var(--color-primario); }
.wap-msg-quoted-text {
    display: block;
    font-size: 1.1rem;
    color: #555;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
}

/* ── Input row (position para slash picker) ──────── */
.wap-input-row { position: relative; }

/* ── Slash picker ────────────────────────────────── */
.wap-slash-picker {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid rgba(40,76,34,.2);
    border-radius: 8px 8px 0 0;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 -4px 12px rgba(0,0,0,.1);
    z-index: 20;
    display: none;
}
.wap-slash-picker.visible { display: block; }
.wap-slash-item {
    display: flex;
    flex-direction: column;
    padding: 8px 14px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0,0,0,.05);
    transition: background .1s;
}
.wap-slash-item:last-child { border-bottom: none; }
.wap-slash-item:hover,
.wap-slash-item.wap-slash-selected { background: rgba(40,76,34,.08); }
.wap-slash-item-titulo { font-weight: 600; color: #284c22; font-size: 1.2rem; }
.wap-slash-item-titulo::before { content: '/'; opacity: .45; }
.wap-slash-item-texto {
    color: #888;
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ── Vista Respuestas Rápidas ────────────────────── */
.wap-rr-search-wrap {
    padding: 8px 12px;
    background: var(--color-secundario);
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
}
.wap-rr-search-wrap input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
    border: 1px solid rgba(40,76,34,.25);
    border-radius: 20px;
    font-size: 1.15rem;
    outline: none;
    background: #fff;
    color: #1a1a1a;
    transition: border-color .15s;
}
.wap-rr-search-wrap input:focus { border-color: var(--color-primario); }
.wap-rr-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px;
    font-weight: 700;
    font-size: 1.3rem;
    color: var(--color-terciario);
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
    background: var(--color-secundario);
}
.wap-rr-form {
    padding: 10px 12px;
    background: #fff;
    border-bottom: 1px solid rgba(40,76,34,.1);
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.wap-rr-form input,
.wap-rr-form textarea {
    width: 100%;
    border: 1px solid rgba(40,76,34,.3);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 1.2rem;
    font-family: inherit;
    resize: vertical;
    outline: none;
    box-sizing: border-box;
}
.wap-rr-form input:focus,
.wap-rr-form textarea:focus { border-color: var(--color-primario); }
.wap-rr-vars-hint {
    font-size: 1.05rem;
    color: #888;
    margin: 0;
}
.wap-rr-vars-hint code {
    background: rgba(40,76,34,.08);
    color: #284c22;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 1rem;
    margin-right: 4px;
    cursor: pointer;
    user-select: none;
    transition: background .12s;
}
.wap-rr-vars-hint code:hover { background: rgba(40,76,34,.18); }
.wap-rr-form-btns { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }
/* ── Media adjunta en RR ─────────────────────────── */
.wap-rr-media-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    font-size: 1.15rem;
}
.wap-rr-media-row span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #166534; }
.wap-rr-media-del { background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1.2rem; padding: 0 2px; flex-shrink: 0; }
.wap-rr-attach-btn { align-self: flex-start; background: none; border: 1px dashed #9ca3af; border-radius: 6px; padding: 5px 10px; font-size: 1.15rem; color: #6b7280; cursor: pointer; transition: border-color .15s, color .15s; }
.wap-rr-attach-btn:hover { border-color: var(--color-primario); color: var(--color-primario); }
.wap-rr-media-badge { font-size: 1rem; margin-left: 4px; }
.wap-rr-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}
.wap-rr-empty {
    text-align: center;
    color: #aaa;
    font-size: 1.2rem;
    padding: 24px 12px;
}
.wap-rr-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 12px;
    border-bottom: 1px solid rgba(0,0,0,.05);
    transition: background .12s;
}
.wap-rr-item:hover { background: rgba(40,76,34,.04); }
.wap-rr-item-body { flex: 1; min-width: 0; }
.wap-rr-item-titulo {
    font-weight: 600;
    color: #284c22;
    font-size: 1.2rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-rr-item-titulo::before { content: '/'; opacity: .45; margin-right: 1px; }
.wap-rr-item-texto {
    color: #888;
    font-size: 1.1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.wap-rr-item-btns { display: flex; gap: 4px; flex-shrink: 0; }
.wap-rr-icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 2px 4px;
    border-radius: 4px;
    font-size: 1.1rem;
    transition: background .12s, color .12s;
}
.wap-rr-icon-btn:hover { background: rgba(0,0,0,.07); color: #374151; }
.wap-rr-icon-btn--del:hover { color: #ef4444; }
.wap-btn-secondary {
    background: none;
    border: 1px solid rgba(0,0,0,.2);
    border-radius: 6px;
    padding: 5px 14px;
    font-size: 1.1rem;
    cursor: pointer;
    color: #555;
    transition: background .12s;
}
.wap-btn-secondary:hover { background: rgba(0,0,0,.06); }

/* ── Nueva conversación ──────────────────────────── */
.wap-new-btn {
    width: 36px; height: 36px;
    border-radius: 10px;
    background: none;
    border: none;
    color: rgba(40,76,34,.4);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background .15s, color .15s;
}
.wap-new-btn:hover { background: rgba(40,76,34,.1); color: #284c22; }

.wap-nc-backdrop {
    display: none;
    position: absolute; inset: 0;
    background: rgba(0,0,0,.55);
    z-index: 100;
    align-items: center; justify-content: center;
}
.wap-nc-backdrop.open { display: flex; }

.wap-nc-modal {
    background: var(--color-secundario);
    border-radius: 14px;
    width: 88%; max-width: 340px;
    overflow: hidden;
    display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,.4);
    max-height: 80%;
}
.wap-nc-modal-header {
    background: var(--color-primario);
    padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0;
}
.wap-nc-title {
    font-size: 1.3rem; font-weight: 700;
    color: var(--color-secundario);
    margin: 0;
}
.wap-nc-modal-body {
    padding: 14px 16px 14px;
    display: flex; flex-direction: column; gap: 12px;
    overflow: hidden;
}
.wap-nc-label {
    font-size: 1.05rem; color: var(--color-primario);
    font-weight: 600; margin-bottom: 4px;
}
.wap-nc-sessions {
    display: flex; flex-wrap: wrap; gap: 6px;
}
.wap-nc-ses-pill { text-transform: capitalize; }
.wap-nc-ses-pill:disabled { opacity: .4; cursor: not-allowed; }
.wap-nc-new-num {
    padding: 7px 10px; border-radius: 8px; cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    border: 1.5px dashed rgba(40,76,34,.3);
    background: transparent; width: 100%; box-sizing: border-box;
    transition: background .12s, border-color .12s;
}
.wap-nc-new-num:hover { background: var(--color-bga-light); border-color: var(--color-primario); }
.wap-nc-new-num-text { font-size: 1.05rem; color: var(--color-primario); font-weight: 600; }

.wap-nc-search {
    width: 100%; padding: 7px 10px;
    border: 1.5px solid rgba(40,76,34,.25);
    border-radius: 8px;
    font-size: 1.1rem; outline: none;
    background: rgba(255,255,255,.7);
    color: var(--color-terciario);
    box-sizing: border-box;
    transition: border-color .15s;
}
.wap-nc-search:focus { border-color: var(--color-primario); }

.wap-nc-results {
    overflow-y: auto; max-height: 180px;
    display: flex; flex-direction: column; gap: 2px;
}
.wap-nc-result {
    padding: 7px 10px; border-radius: 8px; cursor: pointer;
    display: flex; flex-direction: column; gap: 1px;
    transition: background .12s;
}
.wap-nc-result:hover { background: var(--color-bga-light); }
.wap-nc-result-name { font-size: 1.1rem; font-weight: 600; color: var(--color-primario); }
.wap-nc-result-phone { font-size: 1rem; color: var(--color-cuaternario); }
.wap-nc-empty { font-size: 1rem; color: var(--color-terciario); text-align: center; padding: 12px 0; }
.wap-nc-close {
    background: none; border: none;
    font-size: 1.1rem; color: rgba(244,236,223,.7);
    cursor: pointer; padding: 2px 6px; border-radius: 6px;
    transition: background .12s, color .12s;
}
.wap-nc-close:hover { background: rgba(255,255,255,.15); color: var(--color-secundario); }
`;

    document.head.appendChild(s);
}

// ── HTML Shell ─────────────────────────────────────────────────────────────
function _renderShell(body) {
    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);

    body.innerHTML = `
        <div class="wap-root" id="wap-root">

            <!-- ── Barra de navegación lateral ── -->
            <nav class="wap-nav" id="wap-nav">
                <div class="wap-ws-dot wap-ws-dot--reconectando" id="wap-ws-dot" title="Tiempo real: conectando..."></div>

                <button class="wap-new-btn" id="wap-new-conv-btn" title="Iniciar conversación">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="10" y1="11" x2="14" y2="11"/>
                    </svg>
                </button>

                <button class="wap-nav-icon wap-nav-icon--active" data-view="conv" title="Conversaciones">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                </button>

                <button class="wap-nav-icon" data-view="rr" title="Respuestas rápidas">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                    </svg>
                </button>

                ${isAdmin ? `<button class="wap-nav-icon" data-view="ses" title="Conexiones">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/>
                        <path d="M17 6H7a4 4 0 000 8h1v4a2 2 0 004 0v-4h2v4a2 2 0 004 0v-4h1a4 4 0 000-8z"/>
                    </svg>
                </button>` : ''}

            </nav>

            <!-- ── Modal: Nueva conversación ── -->
            <div class="wap-nc-backdrop" id="wap-nc-backdrop">
                <div class="wap-nc-modal">
                    <div class="wap-nc-modal-header">
                        <p class="wap-nc-title">Nueva conversación</p>
                        <button class="wap-nc-close" id="wap-nc-close">✕</button>
                    </div>
                    <div class="wap-nc-modal-body">
                        <div>
                            <p class="wap-nc-label" id="wap-nc-label-ses">Enviar desde</p>
                            <div class="wap-nc-sessions" id="wap-nc-sessions"></div>
                        </div>
                        <div>
                            <p class="wap-nc-label">Buscar cliente</p>
                            <input class="wap-nc-search" id="wap-nc-search" placeholder="Nombre o número..." autocomplete="off">
                        </div>
                        <div class="wap-nc-results" id="wap-nc-results">
                            <p class="wap-nc-empty">Escribe para buscar...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── Área de contenido ── -->
            <div class="wap-content" id="wap-content">

                <!-- Vista: Conversaciones -->
                <div class="wap-view" id="wap-view-conv">
                    <div class="wap-panel-header">
                        <button class="wap-sessions-icon" id="wap-sessions-toggle" style="display:none;">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="9" y1="2" x2="9" y2="6"/><line x1="15" y1="2" x2="15" y2="6"/>
                                <path d="M17 6H7a4 4 0 000 8h1v4a2 2 0 004 0v-4h2v4a2 2 0 004 0v-4h1a4 4 0 000-8z"/>
                            </svg>
                            Conexión
                        </button>
                        <div class="wap-sessions-wrap" id="wap-sessions-wrap" style="display:none;">
                            <div class="wap-sessions" id="wap-sessions"></div>
                        </div>
                        <div class="wap-header-filtros">
                            <div class="wap-ciudad-pills" id="wap-ciudad-pills"></div>
                            <div class="wap-asesor-pills" id="wap-asesor-pills"></div>
                        </div>
                    </div>
                    <div class="wap-search" id="wap-search-wrap">
                        <input type="text" id="wap-search" placeholder="Buscar conversacion...">
                    </div>
                    <div class="wap-filtros-wrap">
                        <div class="wap-filtros" id="wap-filtros"></div>
                    </div>
                    <div class="wap-list" id="wap-list">
                        <p class="wap-empty">Esperando mensajes...</p>
                    </div>
                    <div class="wap-chat" id="wap-chat">
                        <div class="wap-chat-header">
                            <button class="wap-back" id="wap-back">&#8592;</button>
                            <div class="wap-chat-avatar" id="wap-chat-avatar" title="Ver datos del cliente"></div>
                            <div class="wap-chat-info" id="wap-chat-info" title="Ver datos del cliente">
                                <div class="wap-chat-name-row">
                                    <span class="wap-chat-name" id="wap-chat-name"></span>
                                    <button class="wap-vincular-lid-btn" id="wap-vincular-lid-btn" style="display:none;"></button>
                                </div>
                                <span class="wap-chat-via" id="wap-chat-via"></span>
                                <span class="wap-chat-conexion" id="wap-chat-conexion"></span>
                            </div>
                            <div class="wap-chat-actions-wrap" id="wap-chat-actions-wrap" style="display:none;">
                                <div class="wap-chat-actions-split">
                                    <button class="wap-liberar-btn" id="wap-liberar-btn" title="Resolver conversación">&#10003; Resolver</button>
                                    <button class="wap-actions-toggle" id="wap-actions-toggle" title="Más opciones">&#9660;</button>
                                </div>
                                <div class="wap-actions-menu" id="wap-actions-menu">
                                    <button class="wap-action-item" id="wap-action-transferir">&#8599; Transferir a...</button>
                                    <div class="wap-asesores-list" id="wap-asesores-list" style="display:none;"></div>
                                </div>
                            </div>
                        </div>
                        <div class="wap-msgs" id="wap-msgs"></div>
                        <div class="wap-offline-bar" id="wap-offline-bar">
                            ⚠️ Sesión desconectada — reconecta para responder
                        </div>
                        <div class="wap-espera-bar" id="wap-espera-bar">
                            <span id="wap-espera-label">💬 En espera — toma el chat para responder</span>
                            <div class="wap-espera-btns">
                                <button class="wap-tomar-chat-btn" id="wap-tomar-chat-btn">Tomar</button>
                                <button class="wap-resolver-espera-btn" id="wap-resolver-espera-btn">&#10003; Resolver</button>
                            </div>
                        </div>
                        <div class="wap-resuelto-bar" id="wap-resuelto-bar">
                            <span>✅ Chat resuelto — solo lectura</span>
                            <button class="wap-abrir-btn" id="wap-abrir-btn">Abrir conversación</button>
                        </div>
                        <div class="wap-reply-bar" id="wap-reply-bar">
                            <div class="wap-reply-preview">
                                <span class="wap-reply-author" id="wap-reply-author"></span>
                                <span class="wap-reply-text"   id="wap-reply-text"></span>
                            </div>
                            <button class="wap-reply-cancel" id="wap-reply-cancel">&#x2715;</button>
                        </div>
                        <div class="wap-media-preview" id="wap-media-preview">
                            <span class="wap-media-preview-name" id="wap-media-preview-name"></span>
                            <button class="wap-media-preview-cancel" id="wap-media-preview-cancel" title="Quitar archivo">&#x2715;</button>
                        </div>
                        <div class="wap-media-loading" id="wap-media-loading">
                            <span class="wap-media-loading-name" id="wap-media-loading-name"></span>
                            <div class="wap-media-loading-bar"><div class="wap-media-loading-fill" id="wap-media-loading-fill"></div></div>
                            <span class="wap-media-loading-pct" id="wap-media-loading-pct">0%</span>
                        </div>
                        <input type="file" id="wap-file-input" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" style="display:none">
                        <div class="wap-input-row">
                            <div class="wap-slash-picker" id="wap-slash-picker"></div>
                            <button class="wap-rec-cancel-btn" id="wap-rec-cancel-btn" title="Cancelar grabaci&#xF3;n" style="display:none">&#x2715;</button>
                            <div class="wap-input-wrapper">
                                <textarea id="wap-input" placeholder="Escribe un mensaje..." rows="1"></textarea>
                                <button class="wap-attach-btn" id="wap-attach-btn" title="Adjuntar archivo">&#128206;</button>
                                <button class="wap-voice-btn" id="wap-voice-btn" title="Grabar audio">&#127908;</button>
                            </div>
                            <button id="wap-send" style="display:none">&#10148;</button>
                        </div>
                    </div>

                    <!-- Panel datos del cliente (slide-in sobre el chat) -->
                    <div id="wap-client-panel">
                        <div class="wap-cp-header">
                            <button class="wap-cp-back" id="wap-cp-close">&#8592;</button>
                            <span class="wap-cp-title">Datos del cliente</span>
                        </div>

                        <div class="wap-cp-scroll">

                            <!-- Hero: avatar + nombre + teléfono + badges + canal -->
                            <div class="wap-cp-hero">
                                <div class="wap-cp-avatar" id="wap-cp-avatar"></div>
                                <div class="wap-cp-name" id="wap-cp-name-display"></div>
                                <div class="wap-cp-phone-hero">
                                    <span id="wap-cp-phone"></span>
                                    <button class="wap-cp-copy-btn" id="wap-cp-copy" title="Copiar n&#250;mero">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    </button>
                                </div>
                                <div class="wap-cp-badges" id="wap-cp-badges"></div>
                                <div class="wap-cp-canal" id="wap-cp-canal"></div>
                            </div>

                            <!-- Banner LID: número pendiente de confirmar -->
                            <div class="wap-cp-lid-section" id="wap-cp-lid-section" style="display:none;">
                                <div class="wap-cp-lid-title">&#9888; N&#250;mero pendiente de confirmar</div>
                                <div class="wap-cp-lid-desc">Confirma que este es el n&#250;mero correcto del cliente.</div>
                                <div class="wap-cp-lid-row">
                                    <input class="wap-cp-lid-input" id="wap-cp-lid-input" type="tel" placeholder="Ej: 3001234567" />
                                    <button class="wap-cp-lid-ok" id="wap-cp-lid-ok">Confirmar</button>
                                </div>
                            </div>

                            <!-- Resumen -->
                            <div class="wap-cp-section">
                                <div class="wap-cp-section-hdr">
                                    <span class="wap-cp-section-title">Resumen</span>
                                </div>
                                <div class="wap-cp-stats">
                                    <div class="wap-cp-stat">
                                        <div class="wap-cp-stat-label">Total pedidos</div>
                                        <div class="wap-cp-stat-value" id="wap-cp-stat-pedidos">&#8212;</div>
                                    </div>
                                    <div class="wap-cp-stat">
                                        <div class="wap-cp-stat-label">Total gastado</div>
                                        <div class="wap-cp-stat-value" id="wap-cp-stat-total">&#8212;</div>
                                    </div>
                                    <div class="wap-cp-stat">
                                        <div class="wap-cp-stat-label">Ticket promedio</div>
                                        <div class="wap-cp-stat-value" id="wap-cp-stat-ticket">&#8212;</div>
                                    </div>
                                    <div class="wap-cp-stat">
                                        <div class="wap-cp-stat-label">&#218;ltima compra</div>
                                        <div class="wap-cp-stat-value" id="wap-cp-stat-ultima">&#8212;</div>
                                    </div>
                                    <div class="wap-cp-stat wap-cp-stat--full">
                                        <div class="wap-cp-stat-label">D&#237;as sin comprar</div>
                                        <div class="wap-cp-stat-value" id="wap-cp-stat-dias">&#8212;</div>
                                    </div>
                                </div>
                            </div>

                            <!-- Dirección principal -->
                            <div class="wap-cp-section">
                                <div class="wap-cp-section-hdr">
                                    <span class="wap-cp-section-title">Direcci&#243;n principal</span>
                                    <a class="wap-cp-ver-todos" id="wap-cp-ver-dirs" href="#" style="display:none;">Ver todos</a>
                                </div>
                                <div class="wap-cp-address" id="wap-cp-address" style="display:none;">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    <div class="wap-cp-address-info">
                                        <div class="wap-cp-address-text" id="wap-cp-address-text"></div>
                                        <div class="wap-cp-address-sub" id="wap-cp-address-sub"></div>
                                    </div>
                                    <button class="wap-cp-edit-btn" id="wap-cp-addr-edit">Editar</button>
                                </div>
                            </div>

                            <!-- Últimos pedidos -->
                            <div class="wap-cp-section">
                                <div class="wap-cp-section-hdr">
                                    <span class="wap-cp-section-title">&#218;ltimos pedidos</span>
                                </div>
                                <div id="wap-cp-orders">
                                    <div class="wap-cp-orders-empty">Sin pedidos registrados</div>
                                </div>
                            </div>

                            <!-- Preferencias / notas -->
                            <div class="wap-cp-section">
                                <div class="wap-cp-section-hdr">
                                    <span class="wap-cp-section-title">Preferencias / notas</span>
                                </div>
                                <div class="wap-cp-tags-wrap" id="wap-cp-tags">
                                    <button class="wap-cp-add-note" id="wap-cp-add-note">+ Agregar nota</button>
                                </div>
                            </div>

                        </div><!-- /.wap-cp-scroll -->

                        <!-- Input oculto para guardar nombre (compatibilidad interna) -->
                        <input type="hidden" id="wap-cp-nombre" />

                        <!-- Acciones -->
                        <div class="wap-cp-actions">
                            <button class="wap-cp-btn-sec" id="wap-cp-btn-historial">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                Ver historial
                            </button>
                            <button class="wap-cp-btn-sec" id="wap-cp-save">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                Editar
                            </button>
                            <button class="wap-cp-btn-primary" id="wap-cp-btn-pedido">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>
                                Nuevo pedido
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Vista: Respuestas rápidas -->
                <div class="wap-view wap-view--hidden" id="wap-view-rr">
                    <div class="wap-rr-header">
                        <span>Respuestas rápidas</span>
                        <button class="wap-btn-connect" id="wap-rr-new-btn" style="margin:0;font-size:1.1rem;padding:5px 10px;">+ Nueva</button>
                    </div>
                    <div class="wap-rr-search-wrap">
                        <input type="search" id="wap-rr-search" placeholder="Buscar respuesta..." autocomplete="off">
                    </div>
                    <div class="wap-rr-form" id="wap-rr-form" style="display:none;"></div>
                    <div class="wap-rr-list" id="wap-rr-list"></div>
                </div>

                <!-- Vista: Sesiones -->
                <div class="wap-view wap-view--hidden" id="wap-view-ses">
                    <div class="wap-ses-header">
                        <span>Conexiones</span>
                        ${isAdmin ? `<button class="wap-btn-connect" id="wap-btn-connect" style="margin:0;font-size:1.1rem;padding:5px 10px;">+ Agregar</button>` : ''}
                    </div>
                    <div id="wap-connect-form" style="display:none;"></div>
                    <div id="wap-ses-list" class="wap-ses-list"></div>
                </div>

            </div>
        </div>
        <div class="wap-qr-modal" id="wap-qr-modal">
            <div class="wap-qr-box">
                <h3>Escanea con WhatsApp</h3>
                <p class="wap-qr-num" id="wap-qr-num"></p>
                <div class="wap-qr-img" id="wap-qr-img"></div>
                <p class="wap-qr-hint" id="wap-qr-hint">Abre WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular dispositivo</p>
                <button class="wap-qr-close" id="wap-qr-close">Cerrar</button>
            </div>
        </div>
    `;

    document.getElementById('wap-search').addEventListener('input', e => {
        _state.filterText = e.target.value.toLowerCase();
        if (_state.filtroEstado === 'resuelto') {
            _state.resueltas = { items: [], offset: 0, loading: false, done: false, busqueda: e.target.value.trim() };
            if (_resueltasObserver) { _resueltasObserver.disconnect(); _resueltasObserver = null; }
            _loadResueltas();
        } else {
            _renderList();
        }
    });
    document.getElementById('wap-new-conv-btn').addEventListener('click', () => _openNuevaConvModal());
    document.getElementById('wap-nc-close').addEventListener('click', _closeNuevaConvModal);
    document.getElementById('wap-nc-backdrop').addEventListener('click', e => {
        if (e.target === e.currentTarget) _closeNuevaConvModal();
    });
    document.getElementById('wap-nc-search').addEventListener('input', e => {
        clearTimeout(_ncSearchTimer);
        _ncSearchTimer = setTimeout(() => _buscarClientes(e.target.value), 300);
    });
    document.getElementById('wap-back').addEventListener('click', _closeChat);
    document.getElementById('wap-liberar-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _liberarChat(_state.activeNum, _state.activeContact);
    });
    // ── Split button acciones ──────────────────────────────────────────────
    document.getElementById('wap-actions-toggle').addEventListener('click', e => {
        e.stopPropagation();
        const menu = document.getElementById('wap-actions-menu');
        const open = menu.classList.toggle('open');
        if (!open) _closeActionsMenu();
    });
    document.getElementById('wap-action-transferir').addEventListener('click', async e => {
        e.stopPropagation();
        const list = document.getElementById('wap-asesores-list');
        const open = list.style.display !== 'none';
        if (open) { list.style.display = 'none'; return; }
        list.style.display = '';
        const asesorActivo = _getAsig(_state.activeNum, _state.activeContact)?.asesor;
        const opciones = _asesoresCache.filter(a => a.username !== asesorActivo);
        list.innerHTML = opciones.length
            ? opciones.map(a => `<button class="wap-asesor-item" data-username="${a.username}">${a.username}</button>`).join('')
            : `<button class="wap-asesor-item wap-asesor-item--loading">Sin asesores disponibles</button>`;
        list.querySelectorAll('.wap-asesor-item:not(.wap-asesor-item--loading)').forEach(btn => {
            btn.addEventListener('click', () => _transferirChat(_state.activeNum, _state.activeContact, btn.dataset.username));
        });
    });
    // Cerrar dropdown al hacer clic fuera
    document.addEventListener('click', e => {
        if (!e.target.closest('#wap-chat-actions-wrap')) _closeActionsMenu();
    });
    document.getElementById('wap-abrir-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _reabrirChat(_state.activeNum, _state.activeContact);
    });
    document.getElementById('wap-tomar-chat-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _tomarChat(_state.activeNum, _state.activeContact);
    });
    document.getElementById('wap-resolver-espera-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _resolverDesdeEspera(_state.activeNum, _state.activeContact);
    });
    // Header del chat clickable → panel datos del cliente
    document.getElementById('wap-chat-avatar').addEventListener('click', _openClientPanel);
    document.getElementById('wap-chat-info').addEventListener('click', _openClientPanel);
    document.getElementById('wap-cp-close').addEventListener('click', _closeClientPanel);
    document.getElementById('wap-cp-save').addEventListener('click', _startNameEdit);
    document.getElementById('wap-cp-name-display').addEventListener('click', _startNameEdit);
    document.getElementById('wap-cp-copy').addEventListener('click', () => {
        const txt = document.getElementById('wap-cp-phone')?.textContent?.replace(/\s/g, '');
        if (txt) { navigator.clipboard.writeText(txt).then(() => _showToast('Número copiado', 1800)); }
    });
    document.getElementById('wap-cp-lid-ok').addEventListener('click', () => {
        const val = document.getElementById('wap-cp-lid-input')?.value.trim().replace(/\D/g, '');
        if (val && val.length >= 10) { _closeClientPanel(); _vincularLidConNumero(val); }
        else _showToast('Ingresa un número válido (10 dígitos)', 2500);
    });
    document.getElementById('wap-cp-btn-historial').addEventListener('click', () => _showToast('Próximamente', 2000));
    document.getElementById('wap-cp-btn-pedido').addEventListener('click', () => _showToast('Próximamente', 2000));
    document.getElementById('wap-cp-add-note').addEventListener('click', () => _showToast('Próximamente', 2000));
    document.getElementById('wap-cp-addr-edit').addEventListener('click', () => _showToast('Próximamente', 2000));
    document.getElementById('wap-vincular-lid-btn').addEventListener('click', _vincularLid);
    document.getElementById('wap-send').addEventListener('click', _sendMessage);
    document.getElementById('wap-attach-btn').addEventListener('click', () => document.getElementById('wap-file-input').click());
    document.getElementById('wap-file-input').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) _setPendingFile(f); });
    document.getElementById('wap-media-preview-cancel').addEventListener('click', _clearPendingFile);
    document.getElementById('wap-voice-btn').addEventListener('click', async () => {
        if (_mediaRecorder?.state === 'recording') { await _stopRecording(true); }
        else { await _startRecording(); }
    });
    document.getElementById('wap-rec-cancel-btn').addEventListener('click', () => _stopRecording(false));
    document.getElementById('wap-input').addEventListener('input', e => {
        _onInputSlash();
        _autoResizeTextarea(e.target);
        _updateSendVoiceBtn();
    });
    document.getElementById('wap-input').addEventListener('blur', () => setTimeout(_hideSlashPicker, 150));
    document.getElementById('wap-input').addEventListener('keydown', e => {
        if (_slashPickerOpen()) {
            if (e.key === 'ArrowDown')  { e.preventDefault(); _slashMove(1);   return; }
            if (e.key === 'ArrowUp')    { e.preventDefault(); _slashMove(-1);  return; }
            if (e.key === 'Enter')      { e.preventDefault(); _slashConfirm(); return; }
            if (e.key === 'Escape')     { _hideSlashPicker();                  return; }
        }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });
    document.getElementById('wap-reply-cancel').addEventListener('click', _cancelReply);
    document.getElementById('wap-rr-new-btn').addEventListener('click', () => _openRRForm(null));
    document.getElementById('wap-rr-search').addEventListener('input', () => _renderRRView());
    document.getElementById('wap-rr-list').addEventListener('click', e => {
        const editBtn = e.target.closest('[data-rr-edit]');
        const delBtn  = e.target.closest('[data-rr-del]');
        if (editBtn) _openRRForm(parseInt(editBtn.dataset.rrEdit));
        if (delBtn)  _deleteRR(parseInt(delBtn.dataset.rrDel));
    });
    document.getElementById('wap-msgs').addEventListener('click', e => {
        // Reintentar mensaje fallido
        const retryBtn = e.target.closest('.wap-msg-retry');
        if (retryBtn) { _retrySend(+retryBtn.dataset.tmp); return; }

        // Abrir/cerrar menú de opciones
        const menuBtn = e.target.closest('.wap-msg-menu-btn');
        if (menuBtn) {
            e.stopPropagation();
            const msgId = menuBtn.dataset.menuMsgid;
            const dd = document.getElementById(`wap-dd-${msgId}`);
            const isOpen = dd?.classList.contains('open');
            // Cerrar todos los dropdowns abiertos
            document.querySelectorAll('.wap-msg-dropdown.open').forEach(d => d.classList.remove('open'));
            if (!isOpen && dd) dd.classList.add('open');
            return;
        }

        // Lightbox imagen
        const lbImg = e.target.closest('[data-lightbox]');
        if (lbImg) { _openLightbox(lbImg.dataset.lightbox); return; }

        // Reenviar
        const fwdBtn = e.target.closest('[data-fwd-msgid]');
        if (fwdBtn) {
            document.querySelectorAll('.wap-msg-dropdown.open').forEach(d => d.classList.remove('open'));
            _openFwdModal(fwdBtn.dataset.fwdMsgid);
            return;
        }

        // Responder
        const replyBtn = e.target.closest('[data-reply-msgid]');
        if (replyBtn) {
            _replyingTo = {
                msgId:  replyBtn.dataset.replyMsgid,
                texto:  replyBtn.dataset.replyTexto,
                fromMe: replyBtn.dataset.replyOut === '1',
                nombre: replyBtn.dataset.replyNombre,
            };
            document.querySelectorAll('.wap-msg-dropdown.open').forEach(d => d.classList.remove('open'));
            _updateReplyBar();
            document.getElementById('wap-input')?.focus();
            return;
        }

        // Editar
        const editBtn = e.target.closest('[data-edit-msgid]');
        if (editBtn) {
            _editingMsgId = editBtn.dataset.editMsgid;
            document.querySelectorAll('.wap-msg-dropdown.open').forEach(d => d.classList.remove('open'));
            _renderMsgs();
            document.getElementById('wap-edit-ta')?.focus();
            return;
        }

        // Cancelar edición
        if (e.target.closest('[data-cancel-edit]')) {
            _editingMsgId = null;
            _renderMsgs();
            return;
        }

        // Guardar edición
        const saveBtn = e.target.closest('[data-save-edit]');
        if (saveBtn) { _saveEditMsg(saveBtn.dataset.saveEdit); return; }

        // Eliminar
        const delBtn = e.target.closest('[data-del-msgid]');
        if (delBtn) { _deleteMsg(delBtn.dataset.delMsgid); return; }
    });

    // Cerrar dropdown al hacer click fuera de los mensajes
    document.addEventListener('click', () => {
        document.querySelectorAll('.wap-msg-dropdown.open').forEach(d => d.classList.remove('open'));
    });

    // wap-qr-modal usa position:fixed;inset:0 pero #wa-panel tiene transform,
    // lo que lo convertiría en containing-block. Lo movemos al <body> para que
    // el overlay cubra todo el viewport correctamente.
    const qrModal = document.getElementById('wap-qr-modal');
    if (qrModal) document.body.appendChild(qrModal);

    document.getElementById('wap-qr-close').addEventListener('click', _closeQr);

    // Cerrar dropdowns al hacer click fuera
    document.addEventListener('click', () => _closeAllDropdowns());

    if (isAdmin) {
        document.getElementById('wap-btn-connect').addEventListener('click', _toggleConnectForm);
    }

    // ── Navegación lateral ──
    document.getElementById('wap-nav').addEventListener('click', e => {
        const btn = e.target.closest('[data-view]');
        if (!btn) return;
        _navTo(btn.dataset.view);
    });
}

// ── Asesores ───────────────────────────────────────────────────────────────
async function _loadAsesores() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asesores`);
        if (r.ok) _asesoresCache = await r.json();
    } catch { /* sin conexión */ }
}

// ── Asignaciones ───────────────────────────────────────────────────────────
async function _loadAsignaciones(suppressRender = false) {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones`);
        if (!r.ok) return;
        const data = await r.json(); // [{ numero, contacto, asesor, estado }]
        _state.asignaciones = {};
        for (const a of data) _state.asignaciones[`${a.numero}:${a.contacto}`] = { asesor: a.asesor, estado: a.estado || 'asignado' };
        if (!suppressRender) _renderList();
        _scheduleConteos();
        _renderAsesorPills();
        _renderCiudadPills();
    } catch { /* sin conexión */ }
}

async function _tomarChat(num, phone) {
    if (!_asesorActual) return;
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, contacto: phone, asesor: _asesorActual }),
        });
        if (!r.ok) return _showToast('Error al tomar el chat', 3000);
        _state.asignaciones[`${num}:${phone}`] = { asesor: _asesorActual, estado: 'asignado' };
        _scheduleConteos();
        _state.activeNum = num;
        _openChat(phone);
    } catch { _showToast('Error de conexión', 3000); }
}

async function _resolverChat(num, phone) {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ estado: 'resuelto' }),
        });
        if (!r.ok) return _showToast('Error al resolver', 3000);
        if (_state.asignaciones[`${num}:${phone}`]) {
            _state.asignaciones[`${num}:${phone}`].estado = 'resuelto';
        }
        _closeChat();
        _renderList();
        _scheduleConteos();
        _showToast('Chat marcado como resuelto');
    } catch { _showToast('Error de conexión', 3000); }
}

async function _resolverDesdeEspera(num, phone) {
    if (!_asesorActual) return;
    try {
        // Crear asignación y resolverla en secuencia (sin depender de la sesión WA)
        const r1 = await fetch(`${HETZNER_URL}/wa/asignaciones`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, contacto: phone, asesor: _asesorActual }),
        });
        if (!r1.ok) return _showToast('Error al resolver', 3000);
        const r2 = await fetch(`${HETZNER_URL}/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ estado: 'resuelto' }),
        });
        if (!r2.ok) return _showToast('Error al resolver', 3000);
        _state.asignaciones[`${num}:${phone}`] = { asesor: _asesorActual, estado: 'resuelto' };
        _closeChat();
        _renderList();
        _scheduleConteos();
        _showToast('Chat resuelto ✓');
    } catch { _showToast('Error de conexión', 3000); }
}

async function _liberarChat(num, phone) {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ estado: 'resuelto' }),
        });
        if (!r.ok) return _showToast('Error al resolver', 3000);
        if (_state.asignaciones[`${num}:${phone}`]) {
            _state.asignaciones[`${num}:${phone}`].estado = 'resuelto';
        }
        _closeChat();
        _renderList();
        _scheduleConteos();
        _showToast('Chat resuelto ✓');
    } catch { _showToast('Error de conexión', 3000); }
}

// ── Load sessions ──────────────────────────────────────────────────────────
async function _loadSessions() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/sesiones`);
        if (!r.ok) return;
        const data = await r.json();
        _state.sesiones = data;
        // Asignar color a cada sesión al cargar
        data.forEach(s => _getColor(s.numero));
        // Persistir sesiones para render instantáneo en próxima recarga
        try { localStorage.setItem(LS_KEY_SES, JSON.stringify(data)); } catch { /* ignorar */ }
        _renderSessions();
        _renderList();
        _scheduleConteos();
        _loadContactos();
    } catch { /* sin conexion al backend */ }
}

// ── Load conversaciones desde Supabase — ÚNICA fuente de verdad ────────────
// Reconstruye _state.conv completo desde Supabase. Preserva solo msgs y
// customName del estado anterior (caché local). Ejecuta cada 60s para
// garantizar que todos los asesores ven la misma bandeja.
async function _loadConversaciones(suppressRender = false) {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/conversaciones`);
        if (!r.ok) return;
        const convs = await r.json(); // [{ numero, contacto, nombre, ultimo_mensaje, ultimo_ts }]
        if (!Array.isArray(convs)) return;

        // Construir nuevo conv solo con lo que Supabase devuelve
        const newConv = {};
        for (const c of convs) {
            const { numero, contacto, nombre, nombre_cliente, ultimo_mensaje, ultimo_ts } = c;
            if (!numero || !contacto) continue;
            if (contacto.includes('@')) continue; // grupos, canales, listas
            if (!ultimo_mensaje && !ultimo_ts) continue;

            if (!newConv[numero]) newConv[numero] = {};
            const prev = _state.conv[numero]?.[contacto] || {};
            newConv[numero][contacto] = {
                msgs:    prev.msgs?.length ? prev.msgs : [],
                unread:  prev.unread || 0,
                nombre:  nombre_cliente || prev.nombre || null, // clientes BD (fuente de verdad)
                name:    nombre         || prev.name   || null, // pushName WA (fallback)
                lastMsg: ultimo_mensaje || prev.lastMsg || '',
                lastTs:  ultimo_ts      || prev.lastTs  || 0,
            };
        }

        // Conversaciones recién llegadas por WS aún no confirmadas en Supabase:
        // si están en _state.conv pero no en newConv, conservarlas temporalmente.
        // Excluir resueltas para evitar que aparezcan como 'en_espera' por race condition.
        for (const [num, contactos] of Object.entries(_state.conv)) {
            for (const [phone, data] of Object.entries(contactos)) {
                if (!newConv[num]?.[phone] && data.lastTs > (Date.now() / 1000 - 120)) {
                    const asig = _state.asignaciones[`${num}:${phone}`];
                    if (asig?.estado === 'resuelto') continue; // no restaurar resueltas
                    if (!newConv[num]) newConv[num] = {};
                    newConv[num][phone] = data;
                }
            }
        }

        // Descartar conversaciones de sesiones que ya no existen
        // Guard: solo filtrar si las sesiones ya cargaron (evita borrar todo por race condition)
        if (_state.sesiones.length > 0) {
            const _sesActivas = new Set(_state.sesiones.map(s => s.numero));
            for (const num of Object.keys(newConv)) {
                if (!_sesActivas.has(num)) delete newConv[num];
            }
        }

        _state.conv = newConv;
        _saveConv();
        if (!suppressRender) _renderList();
    } catch { /* sin conexión — mantener estado actual */ }
}

// ── Load contacts ──────────────────────────────────────────────────────────
async function _loadContactos() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/contactos`);
        if (!r.ok) return;
        const data = await r.json(); // { [numero]: { [phone]: name } }
        let actualizado = false;
        for (const [numero, contactos] of Object.entries(data)) {
            for (const [phone, name] of Object.entries(contactos)) {
                if (!name) continue;
                // Solo actualizar si la conv ya existe — no crear entradas vacías
                if (!_state.conv[numero]?.[phone]) continue;
                const c = _state.conv[numero][phone];
                if (!c.nombre && c.name !== name) {
                    c.name = name;
                    actualizado = true;
                }
            }
        }
        if (actualizado) { _saveConv(); _renderList(); }
    } catch { /* sin conexion */ }
}

// ── WebSocket ──────────────────────────────────────────────────────────────
function _setWsStatus(status) {
    const dot = document.getElementById('wap-ws-dot');
    if (!dot) return;
    dot.className = `wap-ws-dot wap-ws-dot--${status}`;
    dot.title = status === 'ok'           ? 'Tiempo real: conectado'
              : status === 'reconectando' ? 'Tiempo real: reconectando...'
              : 'Tiempo real: desconectado';
}

function _connectWs() {
    _setWsStatus('reconectando');
    _ws = new WebSocket(WS_URL);
    _ws.onopen = () => {
        _wsRetry = 0;
        _setWsStatus('ok');
        if (_wsEverConnected) {
            // Reconexión — cargar ambas en paralelo y renderizar solo cuando ambas terminan
            // (evita race condition donde resueltos aparecen como en_espera)
            Promise.all([_loadConversaciones(true), _loadAsignaciones(true)])
                .then(() => _renderList());
            // Si hay un chat abierto, recargar sus mensajes desde Supabase
            if (_state.activeContact && _state.activeNum) {
                _loadMsgsSupabase(_state.activeContact);
            }
        }
        _wsEverConnected = true;
    };
    _ws.onmessage = e => {
        try {
            const msg = JSON.parse(e.data);
            console.log('[waPanel WS]', msg.tipo, msg);
            if (msg.tipo === 'wa:mensaje')    _onMensaje(msg);
            if (msg.tipo === 'wa:status')     _onStatus(msg);
            if (msg.tipo === 'wa:qr')         _onQr(msg);
            if (msg.tipo === 'wa:contacto')   _onContacto(msg);
            if (msg.tipo === 'wa:asignacion')   _onAsignacion(msg);
            if (msg.tipo === 'wa:liberacion')   _onLiberacion(msg);
            if (msg.tipo === 'wa:estado')       _onEstado(msg);
            if (msg.tipo === 'wa:transferencia') _onTransferencia(msg);
            if (msg.tipo === 'wa:merge')         _onMerge(msg);
            if (msg.tipo === 'wa:config')        _onConfig(msg);
            if (msg.tipo === 'wa:msg_status')    _onMsgStatus(msg);
            if (msg.tipo === 'wa:msg_eliminado') _onMsgEliminado(msg);
            if (msg.tipo === 'wa:msg_editado')   _onMsgEditado(msg);
            if (msg.tipo === 'wa:msg_edit')      _onMsgEdit(msg);
            if (msg.tipo === 'wa:eliminado')     _onSesionEliminada(msg);
            if (msg.tipo === 'wa:rr_update')     _onRrUpdate();
            if (msg.tipo === 'wa:reaccion')      _onReaccion(msg);
        } catch (err) { console.error('[waPanel WS parse error]', err, e.data); }
    };
    _ws.onclose = () => {
        _setWsStatus('desconectado');
        const delay = Math.min(1000 * 2 ** _wsRetry, 30_000);
        _wsRetry++;
        setTimeout(_connectWs, delay);
    };
    _ws.onerror = () => { _setWsStatus('desconectado'); };
}

// ── WS event handlers ──────────────────────────────────────────────────────
function _onMensaje({ numero, remitente, fromMe, pushName, texto, timestamp, asesor, desdeTelefono, tipoMensaje, mediaUrl, msgId, quotedMsgId, quotedTexto, quotedFromMe }) {
    // Solo chats 1:1 — descartar grupos, canales, listas de difusión, etc.
    if (!remitente) return;
    const _rimSuffix = remitente.split('@')[1] || '';
    if (_rimSuffix !== 's.whatsapp.net' && _rimSuffix !== 'lid') return;

    // remitente siempre es el contacto (cliente), tanto en entrantes como salientes
    // @lid = nuevo formato WA — guardamos el sufijo para reconstruir el JID al enviar
    const jidSuffix = remitente.endsWith('@lid') ? '@lid' : '@s.whatsapp.net';
    const phone     = remitente.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
    if (!phone) return;

    if (!_state.conv[numero])        _state.conv[numero]        = {};
    const isNewConv = !_state.conv[numero][phone];
    if (isNewConv) _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, nombre: null, name: null, jidSuffix: '@s.whatsapp.net' };

    const c   = _state.conv[numero][phone];
    c.jidSuffix = jidSuffix;  // actualizar siempre — puede cambiar entre sesiones
    const out = !!fromMe;
    // Actualizar nombre WA solo si el asesor no asigno uno manual
    if (pushName && !out && !c.nombre) c.name = pushName;

    // Deduplicar mensajes de sistema (optimista ya insertado)
    if (tipoMensaje === 'sistema') {
        if (c.msgs.some(m => m.tipo === 'sistema' && m.text === texto)) return;
    }

    // Deduplicar: si es saliente y ya existe en state (optimista), solo actualizar asesor si falta
    if (out) {
        const existing = [...c.msgs].reverse().find(m => m.out && m.text === texto);
        if (existing) {
            let changed = false;
            if (!existing.asesor && asesor) { existing.asesor = asesor; changed = true; }
            if (msgId && !existing.msgId) {
                existing.msgId  = msgId;
                existing.status = _pendingStatuses.has(msgId) ? _pendingStatuses.get(msgId).status : 2;
                _pendingStatuses.delete(msgId);
                changed = true;
            }
            if (mediaUrl && !existing.mediaUrl) { existing.mediaUrl = mediaUrl; existing.tipo = tipoMensaje || existing.tipo; changed = true; }
            if (changed) { _saveConv(); if (_state.activeContact === phone && _state.activeNum === numero) _renderMsgs(); }
            return;
        }
    }
    c.msgs.push({ text: texto, ts: timestamp || Math.floor(Date.now() / 1000), out, asesor: asesor || null, celular: !!desdeTelefono, tipo: tipoMensaje || 'mensaje', mediaUrl: mediaUrl || null, msgId: msgId || null, status: out ? 2 : undefined, quotedMsgId: quotedMsgId || null, quotedTexto: quotedTexto || null, quotedFromMe: quotedFromMe ?? null });
    c.lastMsg = texto;
    c.lastTs  = timestamp || Math.floor(Date.now() / 1000);

    const isActive = _state.activeContact === phone && _state.activeNum === numero;
    if (!isActive) c.unread++;

    _saveConv();
    _renderList();
    // Actualizar conteos si: entrante, desde celular, o conv resuelta que se reactiva
    const esEntranteOCelular = !fromMe || desdeTelefono;
    if (esEntranteOCelular && (isNewConv || _getEstado(numero, phone) === 'resuelto')) _scheduleConteos();
    if (isActive) _renderMsgs();
    if (!isActive) _flashIcon();
    if (!out) {
        const _estadoNotif = _getEstado(numero, phone);
        // Dos fuentes independientes: window._sipState (postToFrame) + DOM del panel SIP
        // hidePanel() resetea panel a 'none' explícitamente — nunca queda pegado
        const _sipActivo = window._sipState === 'incall' || window._sipState === 'ringing'
            || document.getElementById('sip-panel')?.style.display === 'block';
        const _debeNotificar = !_sipActivo && (
            _estadoNotif === 'en_espera'
            || _estadoNotif === 'resuelto'
            || (_estadoNotif === 'asignado' && _esMio(numero, phone) && !isActive)
        );
        if (_debeNotificar) { _notifAudio.currentTime = 0; _notifAudio.play().catch(() => {}); }
    }
}

function _onStatus({ numero, sede, status }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero);
    if (idx === -1) {
        if (status !== 'desconectado') _state.sesiones.push({ numero, sede: sede || '', status, tieneQr: false });
    } else {
        _state.sesiones[idx].status  = status;
        _state.sesiones[idx].tieneQr = false;
    }
    _getColor(numero); // asignar color si es nueva sesión
    _renderSessions();
    _renderSesionesView();
    _renderList(); // actualiza colores y filtros de bandeja al cambiar estado de sesión
    _scheduleConteos();
    if (_state.activeNum === numero) _updateOfflineBar();

    // QR escaneado — mostrar animación de confirmación en el modal
    if (status === 'conectando' && _waitingQrFor === numero) {
        const modal = document.getElementById('wap-qr-modal');
        const imgEl = document.getElementById('wap-qr-img');
        const hintEl = document.getElementById('wap-qr-hint');
        if (modal?.classList.contains('active') && imgEl) {
            _stopQrSteps();
            imgEl.innerHTML = `
                <div class="wap-qr-loader">
                    <div class="wap-qr-scanned">✓</div>
                    <p class="wap-qr-step" id="wap-qr-step">¡QR escaneado!</p>
                </div>`;
            if (hintEl) hintEl.style.display = 'none';
            _startQrSteps([
                { delay: 900,  text: 'Conectando tu cuenta...' },
                { delay: 2400, text: 'Verificando credenciales...' },
            ]);
        }
    }

    // Cerrar QR modal si el numero que estaba esperando QR ya se conecto
    if (status === 'conectado' && _qrNumero === numero) {
        _closeQr();
        const sede2 = _state.sesiones.find(s => s.numero === numero)?.sede;
        _showToast(`WhatsApp ${_capitalizarSede(sede2) || _fmtPhone(numero)} conectado`);
    }
}

function _onMsgStatus({ numero, msgId, status }) {
    if (!msgId || !numero) return;
    let updated = false;
    for (const convs of Object.values(_state.conv[numero] || {})) {
        const m = convs.msgs?.find(x => x.msgId === msgId);
        if (m) {
            if ((m.status || 0) >= status) return; // no retroceder (evita 4→3 por reordenamiento WS)
            m.status = status;
            updated = true;
            break;
        }
    }
    if (!updated) {
        // Condición de carrera: ACK llegó antes que el echo asignara el msgId — guardar para aplicar después
        _pendingStatuses.set(msgId, { numero, status });
        return;
    }
    _saveConv();
    // Actualizar solo el tick del bubble específico — evita re-render completo y pérdida de scroll
    if (_state.activeNum === numero) {
        const bubble = document.querySelector(`[data-msgid="${CSS.escape(msgId)}"]`);
        const tickEl = bubble?.querySelector('.wap-msg-ticks');
        if (tickEl) {
            tickEl.outerHTML = _tickSvg(status) || '';
        } else if (bubble && !bubble.querySelector('.wap-msg-ticks') && _tickSvg(status)) {
            // El tick aún no existía (status pasó de undefined a >=2)
            const tsSpan = bubble.querySelector('.wap-msg-ts');
            if (tsSpan) tsSpan.insertAdjacentHTML('afterend', _tickSvg(status));
        } else {
            _renderMsgs(); // fallback si el bubble no está en DOM
        }
    }
}

function _tickSvg(status) {
    if (!status || status < 2) return '';
    const color = status >= 4 ? '#53bdeb' : '#8696a0';
    if (status === 2) {
        return `<span class="wap-msg-ticks"><svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 5L4.5 8.5L13 1" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg></span>`;
    }
    return `<span class="wap-msg-ticks"><svg width="18" height="10" viewBox="0 0 18 10" fill="none">
        <path d="M1 5L4.5 8.5L13 1"   stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 5L8.5 8.5L17 1"   stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg></span>`;
}

function _onContacto({ numero, phone, name, fuente }) {
    if (!phone || !name) return;
    // Extraer clave sin sufijo (@s.whatsapp.net / @lid) para buscar en _state.conv
    const phoneKey = phone.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '');
    if (!phoneKey) return;
    if (!_state.conv[numero]?.[phoneKey]) return;
    const c = _state.conv[numero][phoneKey];
    if (fuente === 'clientes') {
        c.nombre = name; // fuente de verdad — override siempre
    } else if (!c.nombre) {
        c.name = name;   // pushName WA — solo si no hay nombre de clientes
    }
    _saveConv();
    _renderList();
    // Actualizar header si es la conversacion abierta
    if (_state.activeContact === phoneKey && _state.activeNum === numero) _updateChatHeader(phoneKey);
}

function _closeActionsMenu() {
    const menu = document.getElementById('wap-actions-menu');
    const list = document.getElementById('wap-asesores-list');
    if (menu) menu.classList.remove('open');
    if (list) { list.style.display = 'none'; list.innerHTML = ''; }
}

async function _transferirChat(num, phone, asesorNuevo) {
    _closeActionsMenu();
    // Optimista: mostrar mensaje de sistema inmediatamente sin esperar WS
    const textoSistema = `${_asesorActual || 'Asesor'} transfirió la conversación a ${asesorNuevo}`;
    if (!_state.conv[num]) _state.conv[num] = {};
    if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
    const c = _state.conv[num][phone];
    c.msgs.push({ text: textoSistema, ts: Math.floor(Date.now() / 1000), tipo: 'sistema' });
    _saveConv();
    if (_state.activeContact === phone && _state.activeNum === num) _renderMsgs();
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ asesor_nuevo: asesorNuevo, asesor_actual: _asesorActual }),
        });
        if (!r.ok) { _showToast('Error al transferir', 3000); return; }
        _showToast(`Chat transferido a ${asesorNuevo}`);
    } catch {
        _showToast('Error de conexión al transferir', 3000);
    }
}

function _onTransferencia({ numero, contacto, asesor_nuevo }) {
    const key = `${numero}:${contacto}`;
    if (_state.asignaciones[key]) _state.asignaciones[key].asesor = asesor_nuevo;
    _renderList();
    _scheduleConteos();
    // Si soy yo el que recibe el chat — actualizar header
    if (_state.activeContact === contacto && _state.activeNum === numero) {
        _updateOfflineBar();
        _updateChatHeader(contacto);
        const puedeResolver = _getEstado(numero, contacto) === 'asignado' && (_esMio(numero, contacto) || ['admin','callcenter-admin'].includes(_rolUsuario));
        const wrap = document.getElementById('wap-chat-actions-wrap');
        if (wrap) wrap.style.display = puedeResolver ? '' : 'none';
        if (asesor_nuevo !== _asesorActual) {
            _closeChat();
            _showToast(`Chat transferido a ${asesor_nuevo}`);
        }
    } else if (asesor_nuevo === _asesorActual) {
        _showToast(`Te transfirieron un chat de ${_fmtPhone(contacto)}`);
    }
}

function _onAsignacion({ numero, contacto, asesor }) {
    _state.asignaciones[`${numero}:${contacto}`] = { asesor, estado: 'asignado' };
    _renderList();
    _scheduleConteos();
    if (_state.activeContact === contacto && _state.activeNum === numero && asesor !== _asesorActual) {
        _closeChat();
        _showToast(`Chat tomado por ${asesor}`);
    }
}

function _onLiberacion({ numero, contacto }) {
    delete _state.asignaciones[`${numero}:${contacto}`];
    _renderList();
    _scheduleConteos();
}

function _onEstado({ numero, contacto, estado, asesor }) {
    const key = `${numero}:${contacto}`;
    if (_state.asignaciones[key]) {
        _state.asignaciones[key].estado = estado;
        if (asesor) _state.asignaciones[key].asesor = asesor;
    } else if (asesor) {
        _state.asignaciones[key] = { asesor, estado };
    }
    _renderList();
    _scheduleConteos();
    // Si el chat activo cambió de estado, refrescar header y barra
    if (_state.activeNum === numero && _state.activeContact === contacto) {
        _updateOfflineBar();
        _updateChatHeader(contacto);
        const actionsWrap = document.getElementById('wap-chat-actions-wrap');
        if (actionsWrap) {
            const isAdminChat   = ['admin', 'callcenter-admin'].includes(_rolUsuario);
            const puedeResolver = estado === 'asignado' && (_esMio(numero, contacto) || isAdminChat);
            actionsWrap.style.display = puedeResolver ? '' : 'none';
        }
    }
}

function _onMerge({ numero, lidPhone, realPhone }) {
    if (!_state.conv[numero]?.[lidPhone]) return;
    const lidConv  = _state.conv[numero][lidPhone];
    const realConv = _state.conv[numero][realPhone] || { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null };

    // Fusionar mensajes, deduplicar por ts+texto, ordenar cronológicamente
    const allMsgs = [...lidConv.msgs, ...realConv.msgs];
    allMsgs.sort((a, b) => a.ts - b.ts);
    const seen = new Set();
    realConv.msgs = allMsgs.filter(m => {
        const key = `${m.ts}:${m.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    realConv.unread += lidConv.unread;
    if ((lidConv.lastTs || 0) > (realConv.lastTs || 0)) {
        realConv.lastMsg = lidConv.lastMsg;
        realConv.lastTs  = lidConv.lastTs;
    }
    if (!realConv.customName && lidConv.name) realConv.name = lidConv.name;

    _state.conv[numero][realPhone] = realConv;
    delete _state.conv[numero][lidPhone];

    // Transferir asignación del lid al teléfono real en estado local
    const lidAsig = _state.asignaciones[`${numero}:${lidPhone}`];
    if (lidAsig) {
        _state.asignaciones[`${numero}:${realPhone}`] = { ...lidAsig };
    }
    delete _state.asignaciones[`${numero}:${lidPhone}`];

    // Si el chat lid estaba abierto, redirigir al teléfono real
    if (_state.activeContact === lidPhone && _state.activeNum === numero) {
        _state.activeContact = realPhone;
        _renderMsgs();
    }
    _saveConv();
    _renderList();
}

function _onConfig({ numero, color, respuesta_inicial }) {
    const s = _state.sesiones.find(x => x.numero === numero);
    if (!s) return;
    if (color !== undefined)             s.color              = color;
    if (respuesta_inicial !== undefined) s.respuesta_inicial  = respuesta_inicial;
    _renderSessions();
    _renderSesionesView();
    _renderList(); // actualiza bordes de colores en bandeja
    if (_state.activeNum === numero) _updateChatHeader(_state.activeContact);
}

function _onSesionEliminada({ numero }) {
    _state.sesiones = _state.sesiones.filter(s => s.numero !== numero);
    delete _state.conv[numero];
    if (_state.activeNum === numero) {
        _state.activeNum     = _state.sesiones.find(s => s.status === 'conectado')?.numero || null;
        _state.activeContact = null;
        _showListView();
    }
    _saveConv();
    _renderSessions();
    _renderSesionesView();
    _scheduleConteos();
    _renderList();
}

async function _onRrUpdate() {
    await _loadRespuestasRapidas();
    _renderRRView();
}

function _onReaccion({ numero, contacto, targetMsgId, reactor, emoji }) {
    const c = _state.conv[numero]?.[contacto];
    if (!c) return;
    const msg = c.msgs.find(m => m.msgId === targetMsgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    if (emoji) msg.reactions[reactor] = emoji;
    else delete msg.reactions[reactor];
    _saveConv();
    if (_state.activeContact === contacto && _state.activeNum === numero) _renderMsgs();
}

function _onQr({ numero, sede, qr }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero);
    if (idx === -1) _state.sesiones.push({ numero, sede: sede || '', status: 'esperando_qr', tieneQr: true });
    else            { _state.sesiones[idx].status = 'esperando_qr'; _state.sesiones[idx].tieneQr = true; }
    _renderSessions();
    _renderSesionesView();
    if (_waitingQrFor === numero) _showQr(numero, qr);
}

// ── Vista Sesiones ─────────────────────────────────────────────────────────
function _renderSesionesView() {
    const el = document.getElementById('wap-ses-list');
    if (!el) return;

    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);

    if (!_state.sesiones.length) {
        el.innerHTML = `<p class="wap-empty" style="padding:24px;">No hay conexiones activas</p>`;
        return;
    }

    el.innerHTML = _state.sesiones.map(s => {
        const color = _getColor(s.numero);
        const label = _sessionLabel(s.numero);

        if (s.numero === _editingNum) {
            // ── Card en modo edición ──
            const colorActual = _pendingColors[s.numero] || color;
            const usedColors  = new Set(
                _state.sesiones.filter(x => x.numero !== s.numero && x.color).map(x => x.color)
            );
            const swatches = SESSION_COLORS.map(c => {
                const isActive   = c === colorActual;
                const isUsed     = usedColors.has(c) && !isActive;
                return `<button class="wap-color-swatch${isActive ? ' wap-color-swatch--active' : ''}${isUsed ? ' wap-color-swatch--used' : ''}"
                    data-color="${c}" style="background:${c};" title="${isUsed ? 'En uso por otra conexión' : c}"${isUsed ? ' disabled' : ''}></button>`;
            }).join('');
            const respActual = _esc(s.respuesta_inicial || '');
            return `<div class="wap-ses-card wap-ses-card--editing" style="border-left:4px solid ${colorActual};" data-num="${s.numero}">
                <div class="wap-ses-edit-form">
                    <label class="wap-ses-edit-label">Nombre</label>
                    <input class="wap-ses-edit-input" id="wap-edit-name-${s.numero}"
                        type="text" value="${_esc(label)}" placeholder="${_fmtPhone(s.numero)}">
                    <label class="wap-ses-edit-label">Color identificador</label>
                    <div class="wap-color-swatches" id="wap-swatches-${s.numero}">${swatches}</div>
                    <label class="wap-ses-edit-label">Respuesta automática (primer mensaje)</label>
                    <textarea class="wap-ses-edit-textarea" id="wap-respuesta-${s.numero}"
                        rows="3" placeholder="Escribe el mensaje de bienvenida...">${respActual}</textarea>
                    <div class="wap-ses-edit-btns">
                        <button class="wap-ses-btn-cancel" data-num="${s.numero}">Cancelar</button>
                        <button class="wap-ses-btn-save" data-num="${s.numero}">Guardar</button>
                    </div>
                </div>
            </div>`;
        }

        // ── Card normal ──
        const isDesconectado = s.status === 'desconectado';
        const statusBadge = s.status === 'conectado'    ? '<span class="wap-ses-badge wap-ses-badge--green">Conectado</span>'
                          : s.status === 'esperando_qr' ? '<span class="wap-ses-badge wap-ses-badge--yellow">Esperando QR</span>'
                          : s.status === 'conectando'   ? '<span class="wap-ses-badge wap-ses-badge--blue">Conectando...</span>'
                          : s.status === 'reconectando' ? '<span class="wap-ses-badge wap-ses-badge--yellow">Reconectando...</span>'
                          : '<span class="wap-ses-badge wap-ses-badge--red">Desconectado</span>';
        const actionBtn = isAdmin
            ? (isDesconectado
                ? `<button class="wap-ses-btn-con" data-num="${s.numero}" title="Conectar">Conectar</button>`
                : `<button class="wap-ses-btn-des" data-num="${s.numero}" title="Desconectar">Desconectar</button>`)
            : '';
        return `<div class="wap-ses-card" style="border-left:4px solid ${color};">
            <div class="wap-ses-card-dot" style="background:${color};"></div>
            <div class="wap-ses-card-info">
                <span class="wap-ses-card-name">${_esc(label)}</span>
                <span class="wap-ses-card-num">${_fmtPhone(s.numero)}</span>
                ${statusBadge}
            </div>
            <div class="wap-ses-card-actions">
                <button class="wap-ses-btn-edit" data-num="${s.numero}" title="Editar">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                ${actionBtn}
                ${isAdmin ? `<button class="wap-ses-btn-del" data-num="${s.numero}" title="Eliminar conexión">🗑️</button>` : ''}
            </div>
        </div>`;
    }).join('');

    // Listeners card normal
    el.querySelectorAll('.wap-ses-btn-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            _editingNum = btn.dataset.num;
            _renderSesionesView();
        });
    });
    if (isAdmin) {
        el.querySelectorAll('.wap-ses-btn-des').forEach(btn => {
            btn.addEventListener('click', () => _desconectarSesion(btn.dataset.num));
        });
        el.querySelectorAll('.wap-ses-btn-con').forEach(btn => {
            btn.addEventListener('click', () => _reconectarSesion(btn.dataset.num));
        });
        el.querySelectorAll('.wap-ses-btn-del').forEach(btn => {
            btn.addEventListener('click', () => _eliminarSesion(btn.dataset.num));
        });
    }

    // Listeners card edición
    el.querySelectorAll('.wap-ses-btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            delete _pendingColors[btn.dataset.num];
            _editingNum = null;
            _renderSesionesView();
        });
    });
    el.querySelectorAll('.wap-ses-btn-save').forEach(btn => {
        btn.addEventListener('click', async () => {
            const num       = btn.dataset.num;
            const name      = document.getElementById(`wap-edit-name-${num}`)?.value.trim() || '';
            const respuesta = document.getElementById(`wap-respuesta-${num}`)?.value.trim() || '';
            const color     = _pendingColors[num];

            // Nombre: sigue en localStorage
            _state.customNames[num] = name || null;
            _saveMeta();

            // Cerrar edición ANTES del await para evitar render en modo edición durante la espera
            delete _pendingColors[num];
            _editingNum = null;
            _renderSesionesView();

            // Color + respuesta_inicial → API
            const body = { respuesta_inicial: respuesta };
            if (color !== undefined) body.color = color;
            try {
                await fetch(`${HETZNER_URL}/wa/sesiones/${encodeURIComponent(num)}/config`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } catch { _showToast('Error guardando configuración', 3000); }

            // Volver a la vista de conversaciones
            _navTo('conv');
        });
    });

    // Listeners swatches de color — solo marcan pendiente, no guardan todavía
    el.querySelectorAll('.wap-color-swatches').forEach(wrap => {
        const num = wrap.id.replace('wap-swatches-', '');
        wrap.querySelectorAll('.wap-color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                _pendingColors[num] = sw.dataset.color;
                wrap.querySelectorAll('.wap-color-swatch').forEach(s =>
                    s.classList.toggle('wap-color-swatch--active', s.dataset.color === sw.dataset.color));
                const card = el.querySelector(`.wap-ses-card--editing[data-num="${num}"]`);
                if (card) card.style.borderLeftColor = sw.dataset.color;
            });
        });
    });
}

// ── Render sessions (dropdown desde ícono en header) ───────────────────────
function _renderSessions() {
    const wrap   = document.getElementById('wap-sessions-wrap');
    const toggle = document.getElementById('wap-sessions-toggle');
    const el     = document.getElementById('wap-sessions');
    if (!wrap || !toggle || !el) return;

    const sesiones = _state.sesiones;

    // Con ≤1 sesión: ocultar ícono y dropdown
    if (sesiones.length <= 1) {
        toggle.style.display = 'none';
        wrap.style.display   = 'none';
        return;
    }

    // Con 2+ sesiones: mostrar ícono, registrar listener una sola vez
    toggle.style.display = '';
    if (!toggle._hasListener) {
        toggle._hasListener = true;
        toggle.addEventListener('click', e => {
            e.stopPropagation();
            const wasOpen = wrap.classList.contains('open');
            _closeAllDropdowns();
            if (!wasOpen) {
                wrap.classList.add('open');
                wrap.style.display = '';
            }
        });
        wrap.addEventListener('click', e => e.stopPropagation());
    }

    // ── Lista vertical con multi-selección ──────────────────────────
    const sel          = _state.filtroSesiones;
    const todasCls     = sel.size === 0 ? ' wap-sessions-item--active' : '';
    const todasChecked = sel.size === 0 ? ' wap-sessions-cb--checked'  : '';
    el.innerHTML = `
        <button class="wap-sessions-item${todasCls}" data-num="">
            <span class="wap-sessions-name">Todas las conexiones</span>
            <span class="wap-sessions-cb${todasChecked}"></span>
        </button>
        ${sesiones.map(s => {
            const color     = _getColor(s.numero);
            const checked   = sel.has(s.numero);
            const activeCls = checked ? ' wap-sessions-item--active' : '';
            const cbCls     = checked ? ' wap-sessions-cb--checked'  : '';
            return `<button class="wap-sessions-item${activeCls}" data-num="${s.numero}">
                <span class="wap-sessions-color-bar" style="background:${color};"></span>
                <span class="wap-sessions-name">${_sessionLabel(s.numero)}</span>
                <span class="wap-sessions-cb${cbCls}"></span>
            </button>`;
        }).join('')}
    `;

    el.querySelectorAll('.wap-sessions-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = btn.dataset.num;
            if (!num) { sel.clear(); wrap.classList.remove('open'); }
            else if (sel.has(num)) sel.delete(num);
            else sel.add(num);
            _renderSessions();
            _scheduleConteos();
            _renderList();
        });
    });
}

// ── Cerrar todos los dropdowns del header ──────────────────────────────────
function _closeAllDropdowns() {
    if (_asesorDdEl) _asesorDdEl.classList.remove('open');
    const aBtn = document.getElementById('wap-asesor-btn');
    if (aBtn) aBtn.classList.remove('wap-asesor-btn--open');
    const ciudadDd  = document.getElementById('wap-ciudad-dropdown');
    const ciudadBtn = document.getElementById('wap-ciudad-btn');
    if (ciudadDd)  ciudadDd.classList.remove('open');
    if (ciudadBtn) ciudadBtn.classList.remove('wap-ciudad-btn--open');
    const sesWrap = document.getElementById('wap-sessions-wrap');
    if (sesWrap) { sesWrap.classList.remove('open'); sesWrap.style.display = 'none'; }
}

// ── Render asesor dropdown en el header ────────────────────────────────────
// El dropdown vive en <body> para escapar overflow:hidden del panel y el
// transform de #wa-panel (igual que wap-qr-modal). Se posiciona con getBoundingClientRect.
function _renderAsesorPills(keepOpen = false) {
    const wrap = document.getElementById('wap-asesor-pills');
    if (!wrap) return;

    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    const fa      = _state.filtroAsesor;

    const asesores = isAdmin
        ? [...new Set(Object.values(_state.asignaciones).map(a => a.asesor).filter(Boolean))].filter(a => a !== _asesorActual).sort()
        : [];

    const labelActual = fa.size === 0              ? '👤 Asesor'
                      : fa.size === 1 && fa.has('mio') ? '👤 Míos'
                      : fa.size === 1              ? `👤 ${[...fa][0]}`
                      : `👤 ${fa.size} asesores`;
    const isActive = fa.size > 0;

    // Solo el botón en el wrap
    wrap.innerHTML = `
        <button class="wap-asesor-btn${isActive ? ' wap-asesor-btn--active' : ''}" id="wap-asesor-btn">
            <span>${labelActual}</span>
            <span class="wap-asesor-btn-arrow">▾</span>
        </button>
    `;

    // Singleton en <body>
    if (!_asesorDdEl) {
        _asesorDdEl = document.createElement('div');
        _asesorDdEl.className = 'wap-asesor-dropdown';
        document.body.appendChild(_asesorDdEl);
    }

    // Actualizar opciones
    _asesorDdEl.innerHTML = `
        ${_aOpt(null,  'Todos', fa)}
        ${_aOpt('mio', 'Míos',  fa)}
        ${asesores.map(a => _aOpt(a, a, fa)).join('')}
    `;
    _asesorDdEl.querySelectorAll('.wap-asesor-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            const key = opt.dataset.fa || null;
            if (key === null) {
                _state.filtroAsesor.clear();
            } else {
                if (_state.filtroAsesor.has(key)) _state.filtroAsesor.delete(key);
                else _state.filtroAsesor.add(key);
            }
            _renderAsesorPills(key !== null);
            _renderCiudadPills();
            _scheduleConteos();
            _renderList();
        });
    });

    const btn = wrap.querySelector('#wap-asesor-btn');

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = _asesorDdEl.classList.contains('open');
        _closeAllDropdowns();
        if (!wasOpen) {
            _asesorDdEl.classList.add('open');
            btn.classList.add('wap-asesor-btn--open');
            const r = btn.getBoundingClientRect();
            _asesorDdEl.style.top  = (r.bottom + 6) + 'px';
            _asesorDdEl.style.left = r.left + 'px';
        }
    });

    if (keepOpen) {
        _asesorDdEl.classList.add('open');
        btn.classList.add('wap-asesor-btn--open');
        const r = btn.getBoundingClientRect();
        _asesorDdEl.style.top  = (r.bottom + 6) + 'px';
        _asesorDdEl.style.left = r.left + 'px';
    }
}

function _aOpt(key, label, fa) {
    const checked = key === null ? fa.size === 0 : fa.has(key);
    const cbCls   = checked ? ' wap-sessions-cb--checked' : '';
    const activo  = checked ? ' wap-asesor-opt--active' : '';
    return `<button class="wap-asesor-opt${activo}" data-fa="${key ?? ''}">
        <span style="flex:1">${label}</span>
        <span class="wap-sessions-cb${cbCls}"></span>
    </button>`;
}

// ── Render ciudad dropdown en el header ────────────────────────────────────
function _renderCiudadPills(keepOpen = false) {
    const wrap = document.getElementById('wap-ciudad-pills');
    if (!wrap) return;

    const fc = _state.filtroCiudad;
    const labelActual = fc.size === 0 ? 'Ciudad'
                      : fc.size === 1 ? (CIUDAD_BADGE[[...fc][0]] || [...fc][0])
                      : `${fc.size} ciudades`;
    const isActive = fc.size > 0;

    wrap.innerHTML = `
        <button class="wap-ciudad-btn${isActive ? ' wap-ciudad-btn--active' : ''}" id="wap-ciudad-btn">
            <span>📍 ${labelActual}</span>
            <span class="wap-ciudad-btn-arrow">▾</span>
        </button>
        <div class="wap-ciudad-dropdown" id="wap-ciudad-dropdown">
            ${_cOpt(null,          'Todas',              fc)}
            ${_cOpt('bucaramanga', 'Bucaramanga · BGA',  fc)}
            ${_cOpt('cartago',     'Cartago · CAR',      fc)}
        </div>
    `;

    if (keepOpen) {
        wrap.querySelector('#wap-ciudad-dropdown')?.classList.add('open');
        wrap.querySelector('#wap-ciudad-btn')?.classList.add('wap-ciudad-btn--open');
    }

    const btn      = wrap.querySelector('#wap-ciudad-btn');
    const dropdown = wrap.querySelector('#wap-ciudad-dropdown');

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = dropdown.classList.contains('open');
        _closeAllDropdowns();
        if (!wasOpen) {
            dropdown.classList.add('open');
            btn.classList.add('wap-ciudad-btn--open');
        }
    });

    dropdown.querySelectorAll('.wap-ciudad-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            const key = opt.dataset.fc || null;
            if (key === null) {
                _state.filtroCiudad.clear();
            } else {
                if (_state.filtroCiudad.has(key)) _state.filtroCiudad.delete(key);
                else _state.filtroCiudad.add(key);
            }
            _renderCiudadPills(key !== null);
            _renderList();
        });
    });
}

function _cOpt(key, label, fc) {
    const checked = key === null ? fc.size === 0 : fc.has(key);
    const cbCls   = checked ? ' wap-sessions-cb--checked' : '';
    const activo  = checked ? ' wap-ciudad-opt--active' : '';
    return `<button class="wap-ciudad-opt${activo}" data-fc="${key ?? ''}">
        <span style="flex:1">${label}</span>
        <span class="wap-sessions-cb${cbCls}"></span>
    </button>`;
}

// ── Render filtro asesor (solo admin) ─────────────────────────────────────
function _renderFiltroAsesor() {
    const el = document.getElementById('wap-filtro-asesor');
    if (!el) return;
    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    if (!isAdmin) { el.style.display = 'none'; return; }

    el.style.display = '';
    const esMio = _state.filtroAsesor.has('mio');
    el.innerHTML = `<button class="wap-filtro wap-filtro--active" id="wap-btn-fa" style="--fc:#6b7280;">
        ${esMio ? 'Míos' : 'Todos'}
    </button>`;

    el.querySelector('#wap-btn-fa').addEventListener('click', () => {
        if (_state.filtroAsesor.has('mio')) _state.filtroAsesor.delete('mio');
        else { _state.filtroAsesor.clear(); _state.filtroAsesor.add('mio'); }
        _scheduleConteos();
        _renderFiltros();
        _renderList();
    });
}

// ── Conteos locales (filtrados por sesión y asesor) ────────────────────────
// Calcula desde _state.conv + _state.asignaciones sin llamar al servidor,
// así los badges reflejan exactamente el filtro de sesiones activo.
function _computeConteos() {
    const fa           = _state.filtroAsesor;
    const asesorTarget = fa.has('mio')  ? _asesorActual
                       : fa.size === 1  ? [...fa][0]
                       : null; // null = sin restricción (todos o multi)
    const sesionesActivas = new Set(_state.sesiones.map(s => s.numero));
    const base    = _state.filtroSesiones.size > 0 ? _state.filtroSesiones : sesionesActivas;
    const numeros = new Set([...base].filter(n => sesionesActivas.has(n)));

    let en_espera = 0, asignado = 0, resuelto = 0;

    for (const num of numeros) {
        const convs = _state.conv[num] || {};
        for (const phone of Object.keys(convs)) {
            if (phone === num) continue; // auto-mensajes
            const asig = _state.asignaciones[`${num}:${phone}`];
            if (!asig) {
                en_espera++;
            } else if (asig.estado === 'asignado') {
                if (!asesorTarget || asig.asesor === asesorTarget) asignado++;
            } else if (asig.estado === 'resuelto') {
                if (!asesorTarget || asig.asesor === asesorTarget) resuelto++;
            }
        }
    }

    _state.conteos = { en_espera, asignado, resuelto };
    document.dispatchEvent(new CustomEvent('wa:conteos', { detail: { ..._state.conteos } }));
}

let _conteoTimer = null;
function _scheduleConteos() {
    clearTimeout(_conteoTimer);
    _conteoTimer = setTimeout(() => { _computeConteos(); _renderFiltros(); _renderAsesorPills(); _renderCiudadPills(); }, 100);
}

// ── Render filtros de estado ───────────────────────────────────────────────
function _renderFiltros() {
    const el = document.getElementById('wap-filtros');
    if (!el) return;

    const { en_espera: espera, asignado, resuelto } = _state.conteos;
    const total = espera + asignado + resuelto;
    const f     = _state.filtroEstado;

    const badge = (key, label, count) => {
        const activo = f === key ? ' wap-filtro--active' : '';
        return `<button class="wap-filtro${activo}" data-filtro="${key ?? ''}">
            ${label} <span class="wap-filtro-count">${count}</span>
        </button>`;
    };

    const actTodos    = f === null    ? ' wap-filtro--active' : '';
    const actResuelto = f === 'resuelto' ? ' wap-filtro--active' : '';
    el.innerHTML =
        badge('asignado',  'Atención', asignado) +
        badge('en_espera', 'Espera',   espera)   +
        `<button class="wap-filtro${actTodos}" data-filtro="">Todos</button>` +
        `<button class="wap-filtro${actResuelto}" data-filtro="resuelto">Resueltos</button>`;

    el.querySelectorAll('.wap-filtro[data-filtro]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.filtro || null;
            const prev = _state.filtroEstado;
            _state.filtroEstado = (prev === key) ? null : key;
            if (_state.filtroEstado === 'resuelto') {
                _state.resueltas = { items: [], offset: 0, loading: false, done: false };
                _loadResueltas();
            } else {
                if (_resueltasObserver) { _resueltasObserver.disconnect(); _resueltasObserver = null; }
            }
            _renderFiltros();
            _renderList();
        });
    });
}

// ── Resueltas — carga paginada ─────────────────────────────────────────────
let _resueltasObserver = null;

async function _loadResueltas() {
    const r = _state.resueltas;
    if (r.loading || r.done) return;
    r.loading = true;
    _renderResueltas(); // muestra spinner

    const isAdmin  = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    const params   = new URLSearchParams({ offset: r.offset, limit: 20 });
    if (!isAdmin) params.set('asesor', _asesorActual);
    if (r.busqueda) params.set('busqueda', r.busqueda);

    try {
        const res  = await fetch(`${HETZNER_URL}/wa/conversaciones/resueltas?${params}`);
        const data = res.ok ? await res.json() : [];
        r.items.push(...(Array.isArray(data) ? data : []));
        r.offset += data.length;
        r.done    = data.length < 20;

        // Pre-poblar _state.conv con nombre_cliente/nombre para evitar mostrar el lid crudo
        // También marcar en _state.asignaciones como resuelto para que _getEstado no los
        // muestre como 'en_espera' si el usuario vuelve a otra tab.
        for (const c of (Array.isArray(data) ? data : [])) {
            if (!c.numero || !c.contacto) continue;
            if (!_state.conv[c.numero])             _state.conv[c.numero] = {};
            if (!_state.conv[c.numero][c.contacto]) _state.conv[c.numero][c.contacto] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
            const cv  = _state.conv[c.numero][c.contacto];
            if (c.nombre_cliente && !cv.nombre) cv.nombre = c.nombre_cliente;
            if (c.nombre         && !cv.name)   cv.name   = c.nombre;
            const key = `${c.numero}:${c.contacto}`;
            if (!_state.asignaciones[key]) {
                _state.asignaciones[key] = { asesor: c.asesor || null, estado: 'resuelto' };
            } else if (_state.asignaciones[key].estado !== 'asignado') {
                _state.asignaciones[key].estado = 'resuelto';
            }
        }
    } catch { /* sin conexión */ }

    r.loading = false;
    _renderResueltas();
}

function _renderResueltas() {
    const el = document.getElementById('wap-list');
    if (!el) return;
    const r = _state.resueltas;

    // Aplicar filtros transversales (asesor, ciudad, sesión) — texto lo filtra el backend
    let items = r.items;
    if (_state.filtroSesiones.size > 0) {
        items = items.filter(c => _state.filtroSesiones.has(c.numero));
    }
    if (_state.filtroCiudad.size > 0) {
        items = items.filter(c => _state.filtroCiudad.has(_ciudadDeSesion(c.numero)));
    }
    if (_state.filtroAsesor.size > 0) {
        const fa     = _state.filtroAsesor;
        const hasMio = fa.has('mio');
        const otros  = [...fa].filter(a => a !== 'mio');
        items = items.filter(c =>
            (hasMio && c.asesor === _asesorActual) ||
            otros.some(a => a === c.asesor)
        );
    }

    if (!items.length && !r.loading) {
        el.innerHTML = `<div class="wap-empty">No hay chats resueltos</div>`;
        return;
    }

    // Agrupar por fecha: insertar separador HOY / AYER / DD MMM YYYY
    let lastLabel = null;
    const html = items.map(c => {
        const color    = _getColor(c.numero);
        const convData = _state.conv[c.numero]?.[c.contacto];
        const display  = c.nombre_cliente || convData?.nombre || convData?.name || c.nombre || _fmtPhone(c.contacto);
        const ts       = c.ultimo_ts ? _fmtTsHora(c.ultimo_ts) : '';
        const isActive = _state.activeContact === c.contacto && _state.activeNum === c.numero;

        // Sede desde sesiones en memoria
        const sesInfo = _state.sesiones.find(s => s.numero === c.numero);
        const sede    = sesInfo?.sede ? _capitalizarSede(sesInfo.sede) : '';

        // Separador de fecha
        const dateLabel = c.ultimo_ts ? _dateLabelResueltas(c.ultimo_ts) : null;
        const sep = (dateLabel && dateLabel !== lastLabel)
            ? `<div class="wap-r-date-sep">${dateLabel}</div>`
            : '';
        if (dateLabel) lastLabel = dateLabel;

        // Badge de sede (verde fijo)
        const sedeBadge = sede
            ? `<span class="wap-r-sede-badge">${_esc(sede)}</span>`
            : '';

        // Asesor con ícono WA
        const WA_SVG = `<svg width="12" height="12" viewBox="0 0 32 32" fill="#25D366" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.833.738 5.494 2.027 7.808L0 32l8.418-2.004A15.94 15.94 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.267 13.267 0 0 1-6.74-1.833l-.484-.287-5.002 1.19 1.224-4.867-.315-.5A13.28 13.28 0 0 1 2.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.27-9.874c-.398-.199-2.355-1.162-2.72-1.294-.365-.133-.63-.199-.895.199-.266.398-1.029 1.294-1.261 1.56-.232.265-.465.298-.863.1-.398-.2-1.681-.62-3.202-1.977-1.184-1.056-1.983-2.36-2.215-2.758-.232-.398-.025-.613.174-.811.179-.178.398-.465.597-.698.2-.232.266-.398.398-.663.133-.266.067-.498-.033-.697-.1-.2-.895-2.158-1.227-2.955-.323-.776-.651-.671-.895-.683l-.763-.013c-.265 0-.696.1-.1.06 1.494-.265 1.96-.199 2.657.199.697.398 2.456 2.357 2.456 5.748 0 3.39-2.456 6.681-2.821 6.946z"/></svg>`;
        const asesorEl = c.asesor
            ? `<span class="wap-r-asesor">${WA_SVG}Resuelto por <strong>${_esc(c.asesor)}</strong></span>`
            : '';

        return `${sep}<div class="wap-conv-item${isActive ? ' wap-conv-item--active' : ''}"
                    data-phone="${c.contacto}" data-num="${c.numero}"
                    style="align-items:flex-start;padding-right:12px;">
            <div class="wap-conv-stripe" style="background:${color};" data-tooltip="${_esc(sede)}"></div>
            <div class="wap-avatar" style="background:${color};color:${_textColorForBg(color)};margin-top:2px;flex-shrink:0;">${_initials(display)}</div>
            <div class="wap-conv-info">
                <div class="wap-conv-row">
                    <span class="wap-conv-name">${_esc(display)}</span>
                    <span class="wap-conv-ts">${ts}</span>
                </div>
                ${sedeBadge ? `<div style="margin-top:3px;">${sedeBadge}</div>` : ''}
                ${asesorEl ? `<div>${asesorEl}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    const sentinel = r.done ? '' : `<div id="wap-resueltas-sentinel" style="height:1px;"></div>`;
    const spinner  = r.loading ? `<div class="wap-empty" style="padding:10px;">Cargando...</div>` : '';
    el.innerHTML   = html + sentinel + spinner;

    // Click con event delegation (evita acumular listeners en re-renders)
    el.onclick = e => {
        const item = e.target.closest('.wap-conv-item');
        if (!item) return;
        const phone = item.dataset.phone;
        const num   = item.dataset.num;
        if (!_state.conv[num]) _state.conv[num] = {};
        if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
        _state.activeNum = num;
        _openChat(phone);
    };

    // IntersectionObserver para cargar más al llegar al sentinel
    if (_resueltasObserver) { _resueltasObserver.disconnect(); _resueltasObserver = null; }
    const sentinel_el = el.querySelector('#wap-resueltas-sentinel');
    if (sentinel_el) {
        _resueltasObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) _loadResueltas();
        }, { threshold: 0.1 });
        _resueltasObserver.observe(sentinel_el);
    }
}

// ── Render conversation list ───────────────────────────────────────────────
function _renderList() {
    const el = document.getElementById('wap-list');
    if (!el) return;

    // Vista resueltas: paginación separada
    if (_state.filtroEstado === 'resuelto') { _renderResueltas(); return; }

    // Recopilar conversaciones de todas las sesiones (o solo la activa si está filtrada)
    const sesionesActivas = new Set(_state.sesiones.map(s => s.numero));
    const allConvs = [];
    for (const [num, convs] of Object.entries(_state.conv)) {
        if (!sesionesActivas.has(num)) continue; // omitir sesiones eliminadas
        if (_state.filtroSesiones.size > 0 && !_state.filtroSesiones.has(num)) continue;
        for (const [phone, data] of Object.entries(convs)) {
            if (phone === num) continue; // ignorar mensajes a sí mismo
            allConvs.push({ num, phone, data });
        }
    }

    const q      = _state.filterText;
    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    const filtered = allConvs
        .filter(({ num, phone, data }) => {
            // Filtrar por texto
            if (q && !phone.includes(q) && !(data.customName || data.name || '').toLowerCase().includes(q)) return false;

            const estado = _getEstado(num, phone);
            const asig   = _getAsig(num, phone);

            // Filtro asesor — multiselección; 'mio' incluye en_espera
            if (_state.filtroAsesor.size > 0) {
                const fa       = _state.filtroAsesor;
                const hasMio   = fa.has('mio');
                const esEspera = estado === 'en_espera';
                const esMioChat = hasMio && (esEspera || asig?.asesor === _asesorActual);
                const otrosMatch = [...fa].filter(a => a !== 'mio').some(a => a === asig?.asesor);
                if (!esMioChat && !otrosMatch) return false;
            }

            // Filtro ciudad — multiselección
            if (_state.filtroCiudad.size > 0 && !_state.filtroCiudad.has(_ciudadDeSesion(num))) return false;

            // Filtro activo por badge
            if (_state.filtroEstado === 'en_espera') return estado === 'en_espera';
            if (_state.filtroEstado === 'asignado')  return estado === 'asignado' && (isAdmin || asig?.asesor === _asesorActual);
            if (_state.filtroEstado === 'resuelto')  return estado === 'resuelto' && (isAdmin || asig?.asesor === _asesorActual);

            // Sin filtro (Todos): en_espera + asignado a mí + resueltos al final
            if (estado === 'en_espera') return true;
            if (estado === 'asignado' && (isAdmin || asig?.asesor === _asesorActual)) return true;
            if (estado === 'resuelto'  && (isAdmin || asig?.asesor === _asesorActual)) return true;
            return false;
        })
        .sort((a, b) => {
            // Todos: orden puro por hora de llegada (más reciente primero)
            if (_state.filtroEstado === null) return b.data.lastTs - a.data.lastTs;
            // Filtros específicos: agrupar por estado y luego por hora
            const prioridad = e => e === 'en_espera' ? 0 : e === 'asignado' ? 1 : 2;
            const pa = prioridad(_getEstado(a.num, a.phone));
            const pb = prioridad(_getEstado(b.num, b.phone));
            if (pa !== pb) return pa - pb;
            return b.data.lastTs - a.data.lastTs;
        });

    if (!filtered.length) {
        el.innerHTML = `<p class="wap-empty">${_state.sesiones.length ? 'Sin conversaciones' : 'Sin sesiones activas'}</p>`;
        return;
    }

    el.innerHTML = filtered.map(({ num, phone, data }) => {
        const color      = _getColor(num);
        const sesInfo    = _state.sesiones.find(s => s.numero === num);
        const sedeLabel  = sesInfo?.sede ? _capitalizarSede(sesInfo.sede) : '';
        const estado     = _getEstado(num, phone);
        const asig       = _getAsig(num, phone);
        const esLibre    = estado === 'en_espera';
        const esMio      = _esMio(num, phone);
        const sesStatus  = _state.sesiones.find(s => s.numero === num)?.status;
        const isOffline  = sesStatus === 'desconectado' || sesStatus === 'reconectando';
        const unread  = data.unread ? `<span class="wap-badge">${data.unread}</span>` : '';
        const ts      = data.lastTs ? _fmtTs(data.lastTs) : '';
        const display = data.nombre || data.name || _fmtPhone(phone);
        const hasName = !!(data.nombre || data.name);
        const sub     = hasName ? `<span class="wap-conv-phone">${_fmtPhone(phone)}</span>` : '';
        const ciudad  = _ciudadDeSesion(num);
        const badgeCode = CIUDAD_BADGE[ciudad] || ciudad.toUpperCase().slice(0, 3);
        const badgeTxt = sedeLabel ? `${badgeCode}-${sedeLabel}` : badgeCode;
        const badgeCls = ciudad === 'cartago' ? 'wap-ciudad-badge--ctg' : 'wap-ciudad-badge--bga';
        const ciudadBadge = `<span class="wap-ciudad-badge ${badgeCls}">${badgeTxt}</span>`;

        const estadoTag = isOffline
                ? `<span class="wap-offline-tag">Sesión caída</span>`
                : esLibre && _state.filtroEstado !== 'en_espera'
                    ? `<span class="wap-estado-tag wap-estado--espera">En espera</span>`
                    : estado === 'resuelto'
                        ? `<span class="wap-estado-tag wap-estado--resuelto">Resuelto</span>`
                        : asig ? `<span class="wap-estado-tag wap-estado--mio">${_esc(asig.asesor)}</span>` : '';

        const tomarBtn = (esLibre && !isOffline)
            ? `<button class="wap-tomar-btn" data-num="${num}" data-phone="${phone}">TOMAR</button>`
            : '';

        return `<div class="wap-conv-item${esLibre && !isOffline ? ' wap-conv-item--libre' : ''}${isOffline ? ' wap-conv-item--offline' : ''}" data-phone="${phone}" data-num="${num}" style="position:relative; padding-right:${esLibre && !isOffline ? '78px' : '12px'};">
            <div class="wap-conv-stripe" style="background:${color};" data-tooltip="${_esc(sedeLabel)}"></div>
            <div class="wap-avatar" style="background:${color};color:${_textColorForBg(color)};">${_initials(display)}</div>
            <div class="wap-conv-info">
                <div class="wap-conv-row">
                    <span class="wap-conv-name">${_esc(display)}</span>
                    <span class="wap-conv-ts">${ts}</span>
                </div>
                <div class="wap-conv-row">
                    <span class="wap-conv-last">${sub || _esc(data.lastMsg)}</span>
                    ${unread}
                </div>
                ${estadoTag ? `<div class="wap-conv-row" style="margin-top:3px;">${estadoTag}</div>` : ''}
                <div class="wap-conv-row" style="margin-top:3px;justify-content:flex-end;">${ciudadBadge}</div>
            </div>
            ${tomarBtn}
        </div>`;
    }).join('');

    // Botones "Tomar"
    el.querySelectorAll('.wap-tomar-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            _tomarChat(btn.dataset.num, btn.dataset.phone);
        });
    });

    el.querySelectorAll('.wap-conv-item').forEach(item => {
        item.addEventListener('click', () => {
            _state.activeNum = item.dataset.num;
            _openChat(item.dataset.phone);
        });
    });
}

// ── Chat view ──────────────────────────────────────────────────────────────
function _openChat(phone) {
    _state.activeContact = phone;
    const c = _state.conv[_state.activeNum]?.[phone];
    if (c) c.unread = 0;

    _updateChatHeader(phone);

    // Mostrar RESOLVER si el chat está asignado y: es mío, o soy admin/callcenter-admin
    const isAdminChat  = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    const puedeResolver = _getEstado(_state.activeNum, phone) === 'asignado' && (_esMio(_state.activeNum, phone) || isAdminChat);
    const actionsWrap  = document.getElementById('wap-chat-actions-wrap');
    if (actionsWrap) actionsWrap.style.display = puedeResolver ? '' : 'none';

    document.getElementById('wap-list').style.display                    = 'none';
    document.getElementById('wap-search-wrap').style.display             = 'none';
    document.querySelector('.wap-panel-header').style.display            = 'none';
    document.querySelector('.wap-filtros-wrap').style.display            = 'none';
    document.getElementById('wap-sessions-wrap').style.display           = 'none';
    document.getElementById('wap-chat').style.display                    = 'flex';

    // Mostrar msgs locales de inmediato, luego reemplazar con Supabase
    _renderMsgs();
    _updateOfflineBar(); // mostrar/ocultar banner según estado de sesión
    _renderList(); // actualizar badge en background
    _loadMsgsSupabase(phone);
}

async function _loadMsgsSupabase(phone) {
    const num = _state.activeNum;
    if (!num || !phone) return;

    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/mensajes/${encodeURIComponent(num)}/${encodeURIComponent(phone)}?limit=50`
        );
        if (!r.ok) return;
        const msgs = await r.json(); // [{id, texto, timestamp, saliente, nombre, ...}]
        if (!Array.isArray(msgs) || !msgs.length) return;

        if (!_state.conv[num])        _state.conv[num]        = {};
        if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null };

        const c = _state.conv[num][phone];

        // Convertir formato Supabase → formato interno
        // Para status: usar el mayor entre Supabase y memoria (evita regresión cuando el re-sync
        // llega antes de que el UPDATE de Supabase se haya confirmado)
        const prevMsgs = new Map((c.msgs || []).filter(m => m.msgId).map(m => [m.msgId, m]));
        const supabaseMsgs = msgs.map(m => {
            const prev   = prevMsgs.get(m.msg_id);
            const dbStat = m.status || (m.saliente ? 2 : undefined);
            return {
                text:         m.texto,
                ts:           m.timestamp,
                out:          m.saliente,
                msgId:        m.msg_id,
                asesor:       m.asesor || null,
                celular:      !!m.desde_telefono,
                tipo:         m.tipo || 'mensaje',
                mediaUrl:     m.media_url      || null,
                status:       Math.max(dbStat || 0, prev?.status || 0) || undefined,
                reactions:    m.reactions      || {},
                quotedMsgId:  m.quoted_msg_id  || null,
                quotedTexto:  m.quoted_texto   || null,
                quotedFromMe: m.quoted_from_me ?? null,
                editado:      !!m.editado,
            };
        });

        // Conservar msgs en memoria más nuevos que el último de Supabase (llegaron vía WS)
        const lastSupabaseTs = supabaseMsgs[supabaseMsgs.length - 1]?.ts ?? 0;
        const masNuevos      = c.msgs.filter(m => m.ts > lastSupabaseTs);
        c.msgs = [...supabaseMsgs, ...masNuevos];

        // Actualizar nombre desde Supabase si el asesor no asignó uno manual
        if (!c.customName) {
            const nombreSupabase = msgs.find(m => !m.saliente && m.nombre)?.nombre;
            if (nombreSupabase) c.name = nombreSupabase;
        }

        // Actualizar lastMsg / lastTs desde el historial completo
        if (c.msgs.length) {
            const ultimo = c.msgs[c.msgs.length - 1];
            c.lastMsg = ultimo.text;
            c.lastTs  = ultimo.ts;
        }

        _saveConv();
        // Solo re-renderizar si esta conversación sigue abierta
        if (_state.activeContact === phone && _state.activeNum === num) {
            _renderMsgs();
            _updateChatHeader(phone);
        }
        _renderList();
    } catch { /* sin conexión — se queda con datos locales */ }
}

function _updateChatHeader(phone) {
    const c       = _state.conv[_state.activeNum]?.[phone];
    const display = c?.nombre || c?.name || _fmtPhone(phone);
    const color   = _getColor(_state.activeNum);

    // Avatar: inicial + color de sesión
    const avatarEl = document.getElementById('wap-chat-avatar');
    if (avatarEl) {
        avatarEl.textContent      = (display[0] || '?').toUpperCase();
        avatarEl.style.background = color;
        avatarEl.style.color      = _textColorForBg(color);
    }

    // El span puede haber sido reemplazado por un input de edición/vincular sin confirmar.
    // Lo restauramos aquí para garantizar que el header siempre sea navegable.
    let nameEl = document.getElementById('wap-chat-name');
    if (!nameEl || nameEl.tagName !== 'SPAN') {
        const fresh = document.createElement('span');
        fresh.className = 'wap-chat-name';
        fresh.id        = 'wap-chat-name';
        if (nameEl) nameEl.replaceWith(fresh);
        else document.querySelector('.wap-chat-name-row')?.prepend(fresh);
        nameEl = fresh;
        const vb = document.getElementById('wap-vincular-lid-btn');
        if (vb) vb.style.display = 'none';
    }
    nameEl.textContent = display;

    // Sub-línea: dot de color + estado + asesor
    const asig  = _getAsig(_state.activeNum, phone);
    const viaEl = document.getElementById('wap-chat-via');
    if (viaEl) {
        let cls  = 'wap-chat-via';
        let text = '';
        if (asig?.asesor) {
            if (asig.estado === 'resuelto') {
                cls  += ' wap-chat-via--resuelto';
                text  = `Resuelto · ${asig.asesor}`;
            } else {
                cls  += ' wap-chat-via--atencion';
                text  = `En atención · ${asig.asesor}`;
            }
        } else {
            cls  += ' wap-chat-via--espera';
            text  = 'En espera';
        }
        viaEl.className = cls;
        viaEl.innerHTML = `<span class="wap-chat-via-dot"></span>${text}`;
    }

    // Nombre de la conexión (debajo del estado)
    const conexionEl = document.getElementById('wap-chat-conexion');
    if (conexionEl) conexionEl.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="#25D366" style="flex-shrink:0;vertical-align:middle;margin-right:3px;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.48a.75.75 0 00.916.919l5.701-1.476A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.713 9.713 0 01-4.953-1.354l-.355-.211-3.683.953.982-3.594-.232-.369A9.718 9.718 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>${_sessionLabel(_state.activeNum)}`;

    // Botón vincular: siempre oculto (se maneja desde el panel de datos del cliente)
    const vincularBtn = document.getElementById('wap-vincular-lid-btn');
    if (vincularBtn) vincularBtn.style.display = 'none';

    // Badge de color de la conexión en el borde izquierdo del header
    const header = document.querySelector('.wap-chat-header');
    if (header) header.style.borderLeftColor = color;
}

function _vincularLid() {
    const lid = _state.activeContact;
    const num = _state.activeNum;
    if (!lid || !num || lid.length <= 12) return;

    const nameEl     = document.getElementById('wap-chat-name');
    const vincularBtn = document.getElementById('wap-vincular-lid-btn');
    const editBtn    = document.getElementById('wap-edit-name-btn');

    // Mostrar input inline debajo del nombre
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
    const input = document.createElement('input');
    input.className   = 'wap-name-input';
    input.type        = 'tel';
    input.placeholder = 'Ej: 3001234567';
    input.style.width = '150px';
    const okBtn = document.createElement('button');
    okBtn.textContent = '✓';
    okBtn.style.cssText = 'background:var(--color-primario);color:#fff;border:none;border-radius:6px;padding:2px 7px;cursor:pointer;font-size:1.1rem;';
    wrap.appendChild(input);
    wrap.appendChild(okBtn);
    nameEl.replaceWith(wrap);
    editBtn.style.display    = 'none';
    vincularBtn.style.display = 'none';
    input.focus();

    async function _confirmar() {
        const val = input.value.trim().replace(/\D/g, '');
        // Restaurar UI antes de hacer fetch
        const span = document.createElement('span');
        span.className = 'wap-chat-name';
        span.id        = 'wap-chat-name';
        wrap.replaceWith(span);
        editBtn.style.display    = '';

        if (!val || val.length < 10) {
            _updateChatHeader(lid);
            return;
        }

        try {
            const r = await fetch(
                `${HETZNER_URL}/wa/contactos/${encodeURIComponent(num)}/${encodeURIComponent(lid)}/vincular`,
                { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ realPhone: val }) }
            );
            if (r.ok) {
                _showToast('Contacto vinculado correctamente', 3000);
            } else {
                const err = await r.json().catch(() => ({}));
                _showToast('Error: ' + (err.error || r.status), 4000);
                _updateChatHeader(lid);
            }
        } catch { _showToast('Error de conexión', 3000); _updateChatHeader(lid); }
    }

    function _cancelar() {
        if (!document.contains(wrap)) return; // ya fue reemplazado
        const span = document.createElement('span');
        span.className = 'wap-chat-name';
        span.id        = 'wap-chat-name';
        wrap.replaceWith(span);
        editBtn.style.display     = '';
        vincularBtn.style.display = lid.length > 12 ? '' : 'none';
        _updateChatHeader(lid);
    }

    let _okClicked = false;
    okBtn.addEventListener('mousedown', () => { _okClicked = true; });
    okBtn.addEventListener('click', () => { _okClicked = false; _confirmar(); });
    input.addEventListener('blur', () => { if (!_okClicked) _cancelar(); _okClicked = false; });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _confirmar(); }
        if (e.key === 'Escape') _cancelar();
    });
}

// ── Panel datos del cliente ─────────────────────────────────────────────────
function _openClientPanel() {
    const phone = _state.activeContact;
    const num   = _state.activeNum;
    if (!phone || !num) return;

    const c       = _state.conv[num]?.[phone];
    const display = c?.nombre || c?.name || '';
    const color   = _getColor(num);
    const isLid   = phone.length > 12;
    const sesInfo = _state.sesiones.find(s => s.numero === num);
    const sede    = sesInfo?.sede ? _capitalizarSede(sesInfo.sede) : '';

    // Avatar
    const avatarEl = document.getElementById('wap-cp-avatar');
    if (avatarEl) {
        avatarEl.textContent      = _initials(display || _fmtPhone(phone));
        avatarEl.style.background = color;
        avatarEl.style.color      = _textColorForBg(color);
    }

    // Nombre (display + input oculto)
    const nameDisplay = document.getElementById('wap-cp-name-display');
    if (nameDisplay) nameDisplay.textContent = display || _fmtPhone(phone);
    const nombreInput = document.getElementById('wap-cp-nombre');
    if (nombreInput) nombreInput.value = display;

    // Teléfono
    const phoneEl = document.getElementById('wap-cp-phone');
    if (phoneEl) phoneEl.textContent = isLid ? 'Sin teléfono registrado' : _fmtPhone(phone);

    // Badges
    const badgesEl = document.getElementById('wap-cp-badges');
    if (badgesEl) {
        badgesEl.innerHTML = isLid
            ? ''
            : `<span class="wap-cp-badge wap-cp-badge--identificado">&#10003; Identificado</span>`;
    }

    // Canal (WA + sede)
    const canalEl = document.getElementById('wap-cp-canal');
    if (canalEl) {
        const WA_DOT = `<svg width="12" height="12" viewBox="0 0 32 32" fill="#25D366" xmlns="http://www.w3.org/2000/svg"><path d="M16 0C7.163 0 0 7.163 0 16c0 2.833.738 5.494 2.027 7.808L0 32l8.418-2.004A15.94 15.94 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0z"/></svg>`;
        canalEl.innerHTML = `${WA_DOT} WhatsApp${sede ? ' · ' + _esc(sede) : ''}`;
    }

    // Banner LID
    const lidSection = document.getElementById('wap-cp-lid-section');
    if (lidSection) lidSection.style.display = isLid ? 'flex' : 'none';
    if (isLid) { const li = document.getElementById('wap-cp-lid-input'); if (li) li.value = ''; }

    // Resetear stats y secciones dinámicas al abrir
    ['wap-cp-stat-pedidos','wap-cp-stat-total','wap-cp-stat-ticket',
     'wap-cp-stat-ultima','wap-cp-stat-dias'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '—';
    });
    const ordersEl = document.getElementById('wap-cp-orders');
    if (ordersEl) ordersEl.innerHTML = '<div class="wap-cp-orders-empty">Sin pedidos registrados</div>';
    const addrEl = document.getElementById('wap-cp-address');
    if (addrEl) addrEl.style.display = 'none';

    // Cargar stats si tiene teléfono real
    if (!isLid) _loadClientStats(phone);

    document.getElementById('wap-client-panel')?.classList.add('wap-cp--open');
}

// ── Carga stats del cliente desde pedidos_callcenter ───────────────────────
async function _loadClientStats(phone) {
    if (!supabase) return;
    const n   = phone.replace(/\D/g, '');
    const n10 = n.startsWith('57') && n.length === 12 ? n.slice(2) : n;

    // Estado "cargando"
    ['wap-cp-stat-pedidos','wap-cp-stat-total','wap-cp-stat-ticket',
     'wap-cp-stat-ultima','wap-cp-stat-dias'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '...';
    });

    try {
        const { data, error } = await supabase
            .from('pedidos_callcenter')
            .select('total, fecha, sede')
            .or(`telefono.eq.${n},telefono.eq.${n10}`)
            .neq('estado', 'cancelado')
            .order('fecha', { ascending: false })
            .limit(50);

        if (error || !data) return;

        // Stats
        const count   = data.length;
        const gastado = data.reduce((s, r) => s + (r.total || 0), 0);
        const ticket  = count ? Math.round(gastado / count) : 0;
        const ultima  = data[0]?.fecha ? new Date(data[0].fecha) : null;
        const dias    = ultima ? Math.floor((Date.now() - ultima.getTime()) / 86400000) : null;

        const fmtCOP   = n => n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
        const fmtFecha = d => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set('wap-cp-stat-pedidos', count > 0 ? count : '0');
        set('wap-cp-stat-total',   count > 0 ? fmtCOP(gastado) : '—');
        set('wap-cp-stat-ticket',  count > 0 ? fmtCOP(ticket)  : '—');
        set('wap-cp-stat-ultima',  ultima ? fmtFecha(ultima) : '—');
        set('wap-cp-stat-dias',    dias !== null ? `${dias} días` : '—');

        // Últimos 3 pedidos
        const ordersEl = document.getElementById('wap-cp-orders');
        if (ordersEl) {
            if (!count) {
                ordersEl.innerHTML = '<div class="wap-cp-orders-empty">Sin pedidos registrados</div>';
            } else {
                ordersEl.innerHTML = data.slice(0, 3).map(p => {
                    const f       = p.fecha ? new Date(p.fecha) : null;
                    const fechaStr = f ? f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                    const sedeStr  = p.sede ? _capitalizarSede(p.sede) : '—';
                    const totalStr = p.total ? fmtCOP(p.total) : '—';
                    return `<div class="wap-cp-order">
                        <div class="wap-cp-order-left">
                            <div>
                                <div class="wap-cp-order-date">${_esc(fechaStr)}</div>
                                <div class="wap-cp-order-sede">${_esc(sedeStr)}</div>
                            </div>
                        </div>
                        <div class="wap-cp-order-total">${_esc(totalStr)}</div>
                    </div>`;
                }).join('');
            }
        }

        // Badge "Cliente frecuente" si tiene 5+ pedidos
        if (count >= 5) {
            const badgesEl = document.getElementById('wap-cp-badges');
            if (badgesEl && !badgesEl.querySelector('.wap-cp-badge--frecuente')) {
                badgesEl.insertAdjacentHTML('afterbegin',
                    `<span class="wap-cp-badge wap-cp-badge--frecuente">&#11088; Cliente frecuente</span>`);
            }
        }
    } catch { /* sin conexión — mantener estado */}
}

function _closeClientPanel() {
    document.getElementById('wap-client-panel')?.classList.remove('wap-cp--open');
}

function _startNameEdit() {
    const nameDiv = document.getElementById('wap-cp-name-display');
    if (!nameDiv || nameDiv.querySelector('input')) return; // ya editando

    const current = nameDiv.textContent.trim();
    const input   = document.createElement('input');
    input.type      = 'text';
    input.value     = current;
    input.className = 'wap-cp-name-input';

    nameDiv.textContent = '';
    nameDiv.appendChild(input);
    input.select();

    let committed = false;
    const commit = (save) => {
        if (committed) return;
        committed = true;
        const nuevo = input.value.trim();
        nameDiv.textContent = save && nuevo ? nuevo : current;
        if (save && nuevo && nuevo !== current) _saveClientPanel(nuevo);
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(true); }
        if (e.key === 'Escape') { commit(false); }
    });
    input.addEventListener('blur', () => commit(true));
}

async function _saveClientPanel(nuevo) {
    const phone   = _state.activeContact;
    const num     = _state.activeNum;
    if (!phone || !num || !nuevo) return;

    const c       = _state.conv[num]?.[phone];
    const current = c?.nombre || c?.name || '';
    if (nuevo === current) return;

    const hiddenInput = document.getElementById('wap-cp-nombre');
    if (hiddenInput) hiddenInput.value = nuevo;

    // Update optimista — persistir antes del fetch para sobrevivir un reinicio de servicio
    const prevNombre = c?.nombre || null;
    if (_state.conv[num]?.[phone]) { _state.conv[num][phone].nombre = nuevo; _saveConv(); }
    const avatarEl = document.getElementById('wap-cp-avatar');
    if (avatarEl) avatarEl.textContent = _initials(nuevo);
    _renderList();

    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/contactos/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nombre: nuevo }) }
        );
        if (r.ok) {
            _showToast('Nombre actualizado', 2000);
        } else {
            // Revertir si el backend rechazó
            if (_state.conv[num]?.[phone]) { _state.conv[num][phone].nombre = prevNombre; _saveConv(); }
            _showToast('Error al guardar el nombre', 3000);
        }
    } catch {
        // Sin conexión — el nombre queda en localStorage para cuando reconecte
        _showToast('Sin conexión — nombre guardado localmente', 3000);
    }
    _updateChatHeader(phone);
}

// Vincular lid desde el panel (equivalente a _vincularLid pero con el número ya dado)
async function _vincularLidConNumero(realPhone) {
    const lid = _state.activeContact;
    const num  = _state.activeNum;
    if (!lid || !num || lid.length <= 12) return;
    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/contactos/${encodeURIComponent(num)}/${encodeURIComponent(lid)}/vincular`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ realPhone }) }
        );
        if (r.ok) _showToast(`Vinculado a ${_fmtPhone(realPhone)}`, 2500);
        else _showToast('Error al vincular — revisa el número', 3000);
    } catch { _showToast('Error de conexión', 3000); }
}

function _editContactName() {
    const phone = _state.activeContact;
    const num   = _state.activeNum;
    if (!phone || !num) return;

    // Bloquear edición para @lid sin resolver (contacto no identificado)
    if (/^\d{14,}$/.test(phone)) {
        _showToast('No se puede editar el nombre de un contacto no identificado', 3000);
        return;
    }

    const c       = _state.conv[num]?.[phone];
    const current = c?.nombre || c?.name || '';
    const nameEl  = document.getElementById('wap-chat-name');
    const editBtn = document.getElementById('wap-edit-name-btn');

    const input = document.createElement('input');
    input.className   = 'wap-name-input';
    input.value       = current;
    input.placeholder = _fmtPhone(phone);
    nameEl.replaceWith(input);
    editBtn.style.display = 'none';
    input.focus();
    input.select();

    async function _guardar() {
        const nuevo = input.value.trim();
        // Restaurar span primero para no bloquear la UI
        const span = document.createElement('span');
        span.className = 'wap-chat-name';
        span.id        = 'wap-chat-name';
        input.replaceWith(span);
        editBtn.style.display = '';

        if (!nuevo || nuevo === current) { _updateChatHeader(phone); return; }

        try {
            const r = await fetch(
                `${HETZNER_URL}/wa/contactos/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`,
                { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ nombre: nuevo }) }
            );
            if (r.ok) {
                if (_state.conv[num]?.[phone]) {
                    _state.conv[num][phone].nombre = nuevo;
                    _saveConv();
                }
                _renderList();
            } else {
                _showToast('Error al guardar el nombre', 3000);
            }
        } catch { _showToast('Error de conexión', 3000); }
        _updateChatHeader(phone);
    }

    input.addEventListener('blur', _guardar);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
}

function _closeChat() {
    _closeClientPanel();
    _state.activeContact = null;
    _showListView();
}

function _navTo(view) {
    document.querySelectorAll('#wap-nav .wap-nav-icon').forEach(b =>
        b.classList.toggle('wap-nav-icon--active', b.dataset.view === view));
    document.getElementById('wap-view-conv').classList.toggle('wap-view--hidden', view !== 'conv');
    document.getElementById('wap-view-rr').classList.toggle('wap-view--hidden', view !== 'rr');
    document.getElementById('wap-view-ses').classList.toggle('wap-view--hidden', view !== 'ses');
    if (view === 'ses') _renderSesionesView();
    if (view === 'conv') _renderList();
    if (view === 'rr') _renderRRView();
}

// ── Nueva conversación / Reenvío ────────────────────────────────────────────
let _ncSesionSeleccionada = null;
let _ncSearchTimer        = null;
let _ncCallback           = null; // null = nueva conv | async fn(num, phone) = reenvío

function _openNuevaConvModal(callback = null) {
    _ncCallback           = callback;
    _ncSesionSeleccionada = null;

    // Título y label dinámicos según modo
    const esReenvio = !!callback;
    const titleEl   = document.querySelector('.wap-nc-title');
    if (titleEl) titleEl.textContent = esReenvio ? 'Reenviar a...' : 'Nueva conversación';
    const labelSesEl = document.getElementById('wap-nc-label-ses');
    if (labelSesEl) labelSesEl.textContent = esReenvio ? 'Reenviar desde' : 'Enviar desde';

    // Renderizar sesiones conectadas
    const sesEl = document.getElementById('wap-nc-sessions');
    const conectadas = _state.sesiones.filter(s => s.status === 'conectado');
    if (!conectadas.length) {
        sesEl.innerHTML = '<span style="font-size:1rem;color:#9ca3af;">Sin sesiones conectadas</span>';
    } else {
        sesEl.innerHTML = conectadas.map(s => `
            <button class="wap-filtro wap-nc-ses-pill" data-num="${s.numero}" title="${s.numero}">
                ${s.sede || s.numero}
            </button>
        `).join('');
        sesEl.querySelectorAll('.wap-nc-ses-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                sesEl.querySelectorAll('.wap-nc-ses-pill').forEach(b => b.classList.remove('wap-filtro--active'));
                btn.classList.add('wap-filtro--active');
                _ncSesionSeleccionada = btn.dataset.num;
            });
        });
        // Auto-seleccionar sesión activa o primera
        const auto = _state.activeNum
            ? sesEl.querySelector(`[data-num="${_state.activeNum}"]`)
            : sesEl.querySelector('.wap-nc-ses-pill');
        if (auto) { auto.click(); }
    }
    document.getElementById('wap-nc-search').value = '';
    document.getElementById('wap-nc-results').innerHTML = '<p class="wap-nc-empty">Escribe para buscar...</p>';
    document.getElementById('wap-nc-backdrop').classList.add('open');
    document.getElementById('wap-nc-search').focus();
}

function _closeNuevaConvModal() {
    document.getElementById('wap-nc-backdrop').classList.remove('open');
    clearTimeout(_ncSearchTimer);
    _ncCallback = null;
}

async function _buscarClientes(q) {
    const res = document.getElementById('wap-nc-results');
    if (!q.trim()) {
        res.innerHTML = '<p class="wap-nc-empty">Escribe para buscar...</p>';
        return;
    }
    res.innerHTML = '<p class="wap-nc-empty">Buscando...</p>';
    const { data, error } = await supabase
        .from('clientes')
        .select('nombre, telefono, ciudad')
        .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%`)
        .limit(20);
    // Normalizar a JID colombiano completo: 3XXXXXXXXX → 573XXXXXXXXX
    const _normPhone = (p) => {
        const d = p.replace(/\D/g, '');
        if (d.startsWith('57') && d.length === 12) return d;
        if (d.startsWith('3')  && d.length === 10) return `57${d}`;
        return d;
    };
    const _iniciarConNum = (phone) => {
        if (!_ncSesionSeleccionada) { alert('Selecciona una sesión primero'); return; }
        const normPhone = _normPhone(phone);
        const num       = _ncSesionSeleccionada;
        const cb        = _ncCallback; // guardar ANTES de cerrar (closeModal pone _ncCallback=null)
        _closeNuevaConvModal();
        if (cb) {
            cb(num, normPhone);
        } else {
            _state.activeNum = num;
            _navTo('conv');
            _openChat(normPhone);
        }
    };

    const clientes = (!error && data?.length) ? data : [];
    const numLimpio = q.replace(/\D/g, '');
    const esNumero = numLimpio.length >= 7;
    // ¿Ya está en resultados?
    const yaEnResultados = clientes.some(c => c.telefono === numLimpio || c.telefono === q);

    const htmlResultados = clientes.map(c => `
        <div class="wap-nc-result" data-phone="${c.telefono}">
            <span class="wap-nc-result-name">${_esc(c.nombre || '—')}</span>
            <span class="wap-nc-result-phone">${_esc(c.telefono)}${c.ciudad ? ' · ' + _esc(c.ciudad) : ''}</span>
        </div>
    `).join('');

    const htmlNuevoNum = (esNumero && !yaEnResultados) ? `
        <button class="wap-nc-new-num" data-phone="${numLimpio}">
            <span class="wap-nc-new-num-text">💬 Iniciar con ${_esc(numLimpio)}</span>
        </button>
    ` : '';

    if (!htmlResultados && !htmlNuevoNum) {
        res.innerHTML = '<p class="wap-nc-empty">Sin resultados</p>';
        return;
    }

    res.innerHTML = htmlResultados + htmlNuevoNum;

    res.querySelectorAll('.wap-nc-result').forEach(el => {
        el.addEventListener('click', () => _iniciarConNum(el.dataset.phone));
    });
    res.querySelector('.wap-nc-new-num')?.addEventListener('click', e => {
        _iniciarConNum(e.currentTarget.dataset.phone);
    });
}

function _showListView() {
    _editingMsgId = null;
    _cancelReply();
    document.getElementById('wap-chat').style.display                    = 'none';
    document.getElementById('wap-list').style.display                    = '';
    document.getElementById('wap-search-wrap').style.display             = '';
    document.querySelector('.wap-panel-header').style.display            = '';
    document.querySelector('.wap-filtros-wrap').style.display            = '';
    // sessions-wrap: NO restaurar — el usuario lo abre explícitamente con el botón Conexión
}

function _renderMsgs() {
    const el = document.getElementById('wap-msgs');
    if (!el) return;

    const c = _state.conv[_state.activeNum]?.[_state.activeContact];
    if (!c?.msgs.length) {
        el.innerHTML = `<p class="wap-empty" style="background:transparent;">Inicio de la conversacion</p>`;
        return;
    }
    const _parts = [];
    let _lastDay = null;
    for (const m of c.msgs) {
        const dk = m.ts ? _dayKey(m.ts) : null;
        if (dk && dk !== _lastDay) {
            _lastDay = dk;
            _parts.push(`<div class="wap-fecha-sep"><span>${_dateLabelChat(m.ts)}</span></div>`);
        }
        _parts.push((() => {
        if (m.tipo === 'sistema') {
            return `<div class="wap-msg wap-msg--sistema">
                ${_esc(m.text)}${m.ts ? ' · ' + _fmtTsHora(m.ts) : ''}
            </div>`;
        }
        const statusCls = m.pending ? ' wap-msg--pending' : m.failed ? ' wap-msg--failed' : '';
        const statusEl  = m.pending
            ? `<span class="wap-msg-status">⏳</span>`
            : m.failed
            ? `<span class="wap-msg-status">✗</span><button class="wap-msg-retry" data-tmp="${m.tmpId}">Reintentar</button>`
            : (m.out && !m.celular ? _tickSvg(m.status) : '');
        const isEditing = m.out && m.msgId === _editingMsgId;
        const replyAttrs = `data-reply-msgid="${_esc(m.msgId)}" data-reply-out="${m.out ? '1' : '0'}" data-reply-texto="${_esc(m.text)}" data-reply-nombre="${_esc(m.out ? _asesorActual : (m.nombre || _fmtPhone(_state.activeContact)))}"`;
        const menuBtn = m.msgId && !m.pending && !m.failed && !isEditing
            ? m.out
                ? `<button class="wap-msg-menu-btn" data-menu-msgid="${_esc(m.msgId)}" title="Opciones">&#x25BE;</button>
                   <div class="wap-msg-dropdown" id="wap-dd-${_esc(m.msgId)}">
                       <button class="wap-msg-dropdown-item" ${replyAttrs}>&#x21A9; Responder</button>
                       <button class="wap-msg-dropdown-item" data-fwd-msgid="${_esc(m.msgId)}">&#x21AA; Reenviar</button>
                       <button class="wap-msg-dropdown-item" data-edit-msgid="${_esc(m.msgId)}">&#9998; Editar</button>
                       <button class="wap-msg-dropdown-item wap-msg-dropdown-item--danger" data-del-msgid="${_esc(m.msgId)}">&#x1F5D1; Eliminar</button>
                   </div>`
                : `<button class="wap-msg-menu-btn" data-menu-msgid="${_esc(m.msgId)}" title="Opciones">&#x25BE;</button>
                   <div class="wap-msg-dropdown" id="wap-dd-${_esc(m.msgId)}">
                       <button class="wap-msg-dropdown-item" ${replyAttrs}>&#x21A9; Responder</button>
                       <button class="wap-msg-dropdown-item" data-fwd-msgid="${_esc(m.msgId)}">&#x21AA; Reenviar</button>
                   </div>`
            : '';
        const quotedBlock = m.quotedTexto
            ? `<div class="wap-msg-quoted">
                   <span class="wap-msg-quoted-author">${_esc(m.quotedFromMe ? _asesorActual || 'Tú' : (m.nombre || _fmtPhone(_state.activeContact)))}</span>
                   <span class="wap-msg-quoted-text">${_esc(m.quotedTexto)}</span>
               </div>`
            : '';
        const mediaBlock = (() => {
            if (!m.mediaUrl) return '';
            const url = _esc(m.mediaUrl);
            if (m.tipo === 'imagen' || m.tipo === 'sticker') {
                const cls = m.tipo === 'sticker' ? 'wap-msg-sticker' : 'wap-msg-img';
                const clickAttr = m.tipo === 'imagen' ? `data-lightbox="${url}"` : '';
                return `<img class="${cls}" src="${url}" alt="${m.tipo}" loading="lazy" ${clickAttr}>`;
            }
            if (m.tipo === 'audio' || m.tipo === 'voz') {
                return `<audio class="wap-msg-audio" controls src="${url}" preload="metadata"></audio>`;
            }
            if (m.tipo === 'video') {
                return `<video class="wap-msg-video" controls src="${url}" preload="none" playsinline></video>`;
            }
            if (m.tipo === 'documento') {
                const nombre = _esc(m.text.replace('📄 ', '') || 'Documento');
                return `<a class="wap-msg-doc" href="${url}" target="_blank" download>📄 ${nombre}</a>`;
            }
            return '';
        })();
        const msgContent = isEditing
            ? `<div class="wap-msg-edit-form">
                   <textarea id="wap-edit-ta" rows="3" style="width:100%">${_esc(m.text)}</textarea>
                   <div class="wap-msg-edit-btns">
                       <button class="wap-msg-edit-cancel" data-cancel-edit>Cancelar</button>
                       <button class="wap-msg-edit-save"   data-save-edit="${_esc(m.msgId)}">Guardar</button>
                   </div>
               </div>`
            : (() => {
                // Si hay media: extraer caption real (texto después de ": ") o no mostrar texto
                let caption = '';
                if (mediaBlock) {
                    const sep = m.text.indexOf(': ');
                    caption = sep !== -1 ? m.text.slice(sep + 2) : '';
                } else {
                    caption = m.text;
                }
                const textEl = caption ? `<span class="wap-msg-text">${_esc(caption)}</span>` : '';
                return `${quotedBlock}${mediaBlock}${textEl}`;
            })();
        const reactionBadges = (() => {
            const r = m.reactions;
            if (!r || !Object.keys(r).length) return '';
            const badges = Object.entries(r).map(([k, e]) => `<span class="wap-reaction-badge" title="${k === 'asesor' ? 'Tú' : 'Cliente'}">${e}</span>`).join('');
            return `<div class="wap-reactions">${badges}</div>`;
        })();
        return `<div class="wap-msg ${m.out ? 'wap-msg--out' : 'wap-msg--in'}${m.celular ? ' wap-msg--celular' : ''}${statusCls}"${m.msgId ? ` data-msgid="${_esc(m.msgId)}"` : ''}>
            ${menuBtn}
            ${m.celular ? `<span class="wap-msg-celular-label">📱 Desde celular</span>` : (m.out && m.asesor ? `<span class="wap-msg-asesor">${_esc(m.asesor)}</span>` : '')}
            ${msgContent}
            ${isEditing ? '' : `${m.editado ? '<span class="wap-msg-edited">Editado</span>' : ''}<span class="wap-msg-ts">${m.pending || m.failed ? '' : (m.ts ? _fmtTsHora(m.ts) : '')}</span>${statusEl}`}
            ${reactionBadges}
        </div>`;
        })());
    }
    el.innerHTML = _parts.join('');
    el.scrollTop = el.scrollHeight;
}

function _updateOfflineBar() {
    const bar       = document.getElementById('wap-offline-bar');
    const resBar    = document.getElementById('wap-resuelto-bar');
    const esperaBar = document.getElementById('wap-espera-bar');
    const inputRow  = document.querySelector('.wap-input-row');
    const input     = document.getElementById('wap-input');
    const sendBtn   = document.getElementById('wap-send');
    const attachBtn = document.getElementById('wap-attach-btn');
    const voiceBtn  = document.getElementById('wap-voice-btn');
    const msgs      = document.getElementById('wap-msgs');
    if (!bar) return;

    const sesStatus = _state.sesiones.find(s => s.numero === _state.activeNum)?.status;
    const offline   = sesStatus === 'desconectado' || sesStatus === 'reconectando';
    const estado    = _getEstado(_state.activeNum, _state.activeContact);
    const resuelto  = estado === 'resuelto';
    const enEspera  = estado === 'en_espera';
    const bloqueado = resuelto || enEspera;

    bar.classList.toggle('visible', offline && !bloqueado);
    if (resBar)    resBar.classList.toggle('visible', resuelto);
    if (esperaBar) {
        esperaBar.classList.toggle('visible', enEspera);
        // Cuando offline: ocultar Tomar (requiere sesión), dejar visible Resolver
        const tomarBtn    = document.getElementById('wap-tomar-chat-btn');
        const esperaLabel = document.getElementById('wap-espera-label');
        if (tomarBtn)    tomarBtn.style.display    = offline ? 'none' : '';
        if (esperaLabel) esperaLabel.textContent   = offline
            ? '⚠️ Sesión caída — puedes resolver el chat'
            : '💬 En espera — toma el chat para responder';
    }

    // Bloqueado (resuelto o en espera): ocultar input y atenuar mensajes
    if (inputRow) inputRow.style.display = bloqueado ? 'none' : '';
    if (msgs)     msgs.style.opacity     = bloqueado ? '0.6' : '';

    // Solo offline sin bloqueo: deshabilitar input
    if (!bloqueado) {
        if (input)     input.disabled     = offline;
        if (sendBtn)   sendBtn.disabled   = offline;
        if (attachBtn) attachBtn.disabled = offline;
        if (voiceBtn)  voiceBtn.disabled  = offline;
    }
}

async function _reabrirChat(num, phone) {
    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}/reabrir`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ asesor: _asesorActual }) }
        );
        if (!r.ok) return _showToast('Error al abrir el chat', 3000);
        // _onEstado y _onMensaje llegarán vía WS para actualizar estado y mostrar mensaje de sistema
    } catch { _showToast('Error de conexión', 3000); }
}

async function _sendMessage() {
    // Esperar a que termine el fetch del adjunto de RR (si está en curso)
    if (_pendingMediaFetch) {
        _showToast('Cargando adjunto...', 1500);
        await _pendingMediaFetch;
    }
    if (_pendingFile) { await _sendMedia(); return; }
    const input = document.getElementById('wap-input');
    const texto = input?.value.trim();
    if (!texto || !_state.activeNum || !_state.activeContact) return;

    // Bloquear envío si la sesión está desconectada
    const sesStatus = _state.sesiones.find(s => s.numero === _state.activeNum)?.status;
    if (sesStatus === 'desconectado' || sesStatus === 'reconectando') {
        _showToast('Sesión desconectada — reconecta para responder', 3500);
        return;
    }

    input.value = '';
    _autoResizeTextarea(input);
    _updateSendVoiceBtn();
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    const ts    = Math.floor(Date.now() / 1000);
    const tmpId = ++_tmpMsgId;

    // Optimistic update con estado "pending"
    if (!_state.conv[num])        _state.conv[num]        = {};
    if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
    const c = _state.conv[num][phone];
    const replySnap = _replyingTo;  // capturar antes de _cancelReply()
    c.msgs.push({ text: texto, ts, out: true, asesor: _asesorActual, pending: true, tmpId,
                  quotedMsgId:  replySnap?.msgId  || null,
                  quotedTexto:  replySnap?.texto  || null,
                  quotedFromMe: replySnap?.fromMe ?? null });
    c.lastMsg = texto;
    c.lastTs  = ts;
    _saveConv();
    _renderMsgs();

    try {
        const destinatario = phone + (c?.jidSuffix || '@s.whatsapp.net');
        const r = await fetch(`${HETZNER_URL}/wa/mensajes`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, destinatario, texto, asesor: _asesorActual, quoted: replySnap }),
            signal:  AbortSignal.timeout(10000),
        });
        _cancelReply();
        const m = c.msgs.find(x => x.tmpId === tmpId);
        if (r.ok) {
            if (m) { delete m.pending; delete m.tmpId; }
        } else {
            if (m) { m.failed = true; delete m.pending; }
            const err = await r.json().catch(() => ({}));
            _showToast(err.error?.includes('no disponible') ? '⚠️ Sesión desconectada' : '⚠️ Error al enviar — toca Reintentar', 4000);
        }
    } catch {
        const m = c.msgs.find(x => x.tmpId === tmpId);
        if (m) { m.failed = true; delete m.pending; }
        _showToast('⚠️ Sin conexión — toca Reintentar', 4000);
    }
    _saveConv();
    _renderMsgs();
}

async function _retrySend(tmpId) {
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    if (!num || !phone) return;
    const c = _state.conv[num]?.[phone];
    if (!c) return;
    const m = c.msgs.find(x => x.tmpId === tmpId);
    if (!m) return;

    m.pending = true;
    delete m.failed;
    _renderMsgs();

    try {
        const destinatario = phone + (c?.jidSuffix || '@s.whatsapp.net');
        const r = await fetch(`${HETZNER_URL}/wa/mensajes`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, destinatario, texto: m.text, asesor: _asesorActual }),
            signal:  AbortSignal.timeout(10000),
        });
        if (r.ok) {
            delete m.pending;
            delete m.tmpId;
            delete m.failed;
        } else {
            m.failed = true;
            delete m.pending;
            _showToast('⚠️ Error al reenviar mensaje', 4000);
        }
    } catch {
        m.failed = true;
        delete m.pending;
        _showToast('⚠️ Sin conexión — intenta de nuevo', 4000);
    }
    _saveConv();
    _renderMsgs();
}

// ── Adjuntar archivos ───────────────────────────────────────────────────────
function _clearPendingFile() {
    _pendingFile = null;
    const preview = document.getElementById('wap-media-preview');
    const input   = document.getElementById('wap-file-input');
    if (preview) preview.style.display = 'none';
    if (input)   input.value = '';
}

function _setPendingFile(file) {
    _pendingFile = file;
    const preview = document.getElementById('wap-media-preview');
    const name    = document.getElementById('wap-media-preview-name');
    if (name)    name.textContent      = file.name;
    if (preview) preview.style.display = 'flex';
}

async function _sendMedia() {
    if (!_pendingFile || !_state.activeNum || !_state.activeContact) return;
    const sesStatus = _state.sesiones.find(s => s.numero === _state.activeNum)?.status;
    if (sesStatus === 'desconectado' || sesStatus === 'reconectando') {
        _showToast('Sesión desconectada — reconecta para enviar', 3500);
        return;
    }

    const num     = _state.activeNum;
    const phone   = _state.activeContact;
    const file    = _pendingFile;
    const inputEl = document.getElementById('wap-input');
    const texto   = inputEl?.value.trim() || null;

    if (!_state.conv[num])        _state.conv[num]        = {};
    if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
    const c            = _state.conv[num][phone];
    const destinatario = phone + (c?.jidSuffix || '@s.whatsapp.net');

    const base = file.type.split(';')[0].trim();
    const tipo  = base.startsWith('image/') ? 'imagen' : base.startsWith('video/') ? 'video'
                : base.startsWith('audio/') ? 'voz' : 'documento';
    // imagen y video soportan caption en WA → un solo mensaje
    // audio y documento NO soportan caption → texto separado primero
    const soportaCaption = tipo === 'imagen' || tipo === 'video';

    _clearPendingFile();
    if (inputEl) { inputEl.value = ''; _autoResizeTextarea(inputEl); _updateSendVoiceBtn(); }

    // ── 1. Texto separado solo para audio/documento ────────────────────────
    if (texto && !soportaCaption) {
        const ts1   = Math.floor(Date.now() / 1000);
        const tmpId = ++_tmpMsgId;
        c.msgs.push({ text: texto, ts: ts1, out: true, asesor: _asesorActual, pending: true, tmpId });
        c.lastMsg = texto; c.lastTs = ts1;
        _saveConv(); _renderMsgs();

        try {
            const r = await fetch(`${HETZNER_URL}/wa/mensajes`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ numero: num, destinatario, texto, asesor: _asesorActual }),
                signal:  AbortSignal.timeout(10000),
            });
            const m = c.msgs.find(x => x.tmpId === tmpId);
            if (r.ok) { if (m) { delete m.pending; delete m.tmpId; } }
            else      { if (m) { m.failed = true; delete m.pending; } }
        } catch {
            const m = c.msgs.find(x => x.tmpId === tmpId);
            if (m) { m.failed = true; delete m.pending; }
        }
        _saveConv(); _renderMsgs();
    }

    // ── 2. Enviar archivo (con caption si imagen/video) ────────────────────
    const caption   = (texto && soportaCaption) ? texto : null;
    // El render extrae caption buscando ": " — mismo formato que guarda el backend
    const textoDesc = caption ? (tipo === 'imagen' ? 'Imagen: ' + caption : 'Video: ' + caption)
                    : tipo === 'voz' ? 'Nota de voz' : tipo === 'documento' ? file.name
                    : tipo === 'imagen' ? 'Imagen' : 'Video';

    const ts2        = Math.floor(Date.now() / 1000);
    const previewUrl = (tipo === 'imagen' || tipo === 'voz') ? URL.createObjectURL(file) : null;
    c.msgs.push({ text: textoDesc, ts: ts2, out: true, asesor: _asesorActual, pending: true, tipo, mediaUrl: previewUrl });
    c.lastMsg = textoDesc; c.lastTs = ts2;
    _saveConv(); _renderMsgs();

    try {
        const fd = new FormData();
        fd.append('numero', num);
        fd.append('destinatario', destinatario);
        fd.append('asesor', _asesorActual || '');
        if (caption) fd.append('caption', caption);
        fd.append('file', file);
        const r = await fetch(`${HETZNER_URL}/wa/mensajes/media`, {
            method: 'POST',
            body:   fd,
            signal: AbortSignal.timeout(30000),
        });
        const last = c.msgs[c.msgs.length - 1];
        if (r.ok) {
            if (last?.pending) { delete last.pending; }
        } else {
            if (last?.pending) { last.failed = true; delete last.pending; }
            const err = await r.json().catch(() => ({}));
            _showToast('Error al enviar archivo: ' + (err.error || 'intenta de nuevo'), 4000);
        }
    } catch {
        const last = c.msgs[c.msgs.length - 1];
        if (last?.pending) { last.failed = true; delete last.pending; }
        _showToast('Error de conexión al enviar archivo', 4000);
    }
    _saveConv();
    _renderMsgs();
}

// ── Toggle send ↔ mic (estilo WhatsApp) ────────────────────────────────────
function _updateSendVoiceBtn() {
    const hasText = !!document.getElementById('wap-input')?.value.trim();
    const sendBtn  = document.getElementById('wap-send');
    const voiceBtn = document.getElementById('wap-voice-btn');
    if (sendBtn)  sendBtn.style.display  = hasText ? '' : 'none';
    if (voiceBtn) voiceBtn.style.display = hasText ? 'none' : '';
}

// ── Grabación de voz ────────────────────────────────────────────────────────
async function _startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _recChunks     = [];
        _mediaRecorder = new MediaRecorder(stream);
        _mediaRecorder.addEventListener('dataavailable', e => { if (e.data.size > 0) _recChunks.push(e.data); });
        _mediaRecorder.start();
        _recSeconds = 0;
        _updateVoiceUI(true);
        _recInterval = setInterval(() => {
            _recSeconds++;
            const m   = String(Math.floor(_recSeconds / 60)).padStart(2, '0');
            const s   = String(_recSeconds % 60).padStart(2, '0');
            const inp = document.getElementById('wap-input');
            if (inp) inp.placeholder = `Grabando... ${m}:${s}`;
        }, 1000);
    } catch {
        _showToast('No se pudo acceder al micrófono', 3000);
    }
}

async function _stopRecording(send = true) {
    if (!_mediaRecorder) return;
    clearInterval(_recInterval);
    _recInterval = null;
    return new Promise(resolve => {
        _mediaRecorder.addEventListener('stop', async () => {
            const stream = _mediaRecorder.stream;
            stream.getTracks().forEach(t => t.stop());
            _updateVoiceUI(false);
            if (send && _recChunks.length > 0) {
                const blob = new Blob(_recChunks, { type: 'audio/webm' });
                _pendingFile = new File([blob], 'nota-de-voz.webm', { type: 'audio/webm' });
                await _sendMedia();
            }
            _mediaRecorder = null;
            _recChunks     = [];
            resolve();
        }, { once: true });
        _mediaRecorder.stop();
    });
}

function _updateVoiceUI(recording) {
    const voiceBtn    = document.getElementById('wap-voice-btn');
    const sendBtn     = document.getElementById('wap-send');
    const attachBtn   = document.getElementById('wap-attach-btn');
    const cancelBtn   = document.getElementById('wap-rec-cancel-btn');
    const input       = document.getElementById('wap-input');
    if (recording) {
        voiceBtn?.classList.add('wap-voice-btn--rec');
        if (voiceBtn)  { voiceBtn.style.display = ''; voiceBtn.title = 'Detener y enviar'; }
        if (sendBtn)   sendBtn.style.display   = 'none';
        if (attachBtn) attachBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = '';
        if (input)     { input.disabled = true; input.placeholder = 'Grabando... 0:00'; }
    } else {
        voiceBtn?.classList.remove('wap-voice-btn--rec');
        if (voiceBtn)  voiceBtn.title          = 'Grabar audio';
        if (attachBtn) attachBtn.style.display = '';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (input)     { input.disabled = false; input.placeholder = 'Escribe un mensaje...'; }
        _updateSendVoiceBtn();  // restaura mic/send según si hay texto
    }
}

// ── QR modal ───────────────────────────────────────────────────────────────
function _stopQrSteps() {
    _qrStepTimers.forEach(clearTimeout);
    _qrStepTimers = [];
}

function _startQrSteps(steps) {
    _stopQrSteps();
    steps.forEach(({ delay, text }) => {
        _qrStepTimers.push(setTimeout(() => {
            const el = document.getElementById('wap-qr-step');
            if (!el) return;
            el.classList.add('fade');
            setTimeout(() => {
                const el2 = document.getElementById('wap-qr-step');
                if (!el2) return;
                el2.textContent = text;
                el2.classList.remove('fade');
            }, 300);
        }, delay));
    });
}

function _showQr(numero, qrData) {
    const modal  = document.getElementById('wap-qr-modal');
    const imgEl  = document.getElementById('wap-qr-img');
    const hintEl = document.getElementById('wap-qr-hint');
    if (!modal || !imgEl) return;

    _qrNumero = numero;
    document.getElementById('wap-qr-num').textContent = `Número: ${_fmtPhone(numero)}`;

    if (qrData) {
        // QR listo — detener animación y mostrar imagen
        _stopQrSteps();
        imgEl.innerHTML = `<img src="${qrData}" alt="QR WhatsApp">`;
        if (hintEl) hintEl.style.display = '';
    } else {
        // Sin QR aún — mostrar loader animado con pasos
        imgEl.innerHTML = `
            <div class="wap-qr-loader">
                <div class="wap-qr-spinner"></div>
                <p class="wap-qr-step" id="wap-qr-step">Iniciando sesión...</p>
            </div>`;
        if (hintEl) hintEl.style.display = 'none';
        _startQrSteps([
            { delay: 1200, text: 'Conectando con WhatsApp...' },
            { delay: 3000, text: 'Generando código QR...' },
            { delay: 5200, text: 'Casi listo...' },
        ]);
    }

    modal.classList.add('active');

    // Abrir el panel si está colapsado
    const panel = document.getElementById('wa-panel');
    if (panel && !panel.classList.contains('expanded')) {
        document.getElementById('wa-strip')?.click();
    }
}

function _closeQr() {
    _stopQrSteps();
    document.getElementById('wap-qr-modal')?.classList.remove('active');
    _qrNumero     = null;
    _waitingQrFor = null;
}

// ── Reconectar sesión desconectada (admin) ────────────────────────────────
async function _reconectarSesion(numero) {
    const s = _state.sesiones.find(x => x.numero === numero);
    if (!s) return;

    // Feedback visual en el botón
    const btn = document.querySelector(`.wap-ses-btn-con[data-num="${numero}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Conectando...'; }

    _waitingQrFor = numero;
    try {
        const r = await fetch(`${HETZNER_URL}/wa/sesiones`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero, sede: s.sede }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Error');
        _onQr({ numero, sede: s.sede, qr: data.qr || null });
    } catch (e) {
        _waitingQrFor = null;
        if (btn) { btn.disabled = false; btn.textContent = 'Conectar'; }
        _showToast('Error al reconectar: ' + e.message);
    }
}

// ── Desconectar sesión (admin) ─────────────────────────────────────────────
async function _desconectarSesion(numero) {
    if (!confirm(`¿Desconectar sesión ${_fmtPhone(numero)}?`)) return;
    try {
        await fetch(`${HETZNER_URL}/wa/sesiones/${encodeURIComponent(numero)}`, { method: 'DELETE' });

        // No eliminamos conv ni asignaciones — las conversaciones quedan
        // visibles en la bandeja con indicador de sesión caída (Opción B).

        // Marcar como desconectada (no eliminar — la card sigue visible con botón Conectar)
        const idx = _state.sesiones.findIndex(s => s.numero === numero);
        if (idx !== -1) {
            _state.sesiones[idx].status  = 'desconectado';
            _state.sesiones[idx].tieneQr = false;
        }

        // Si era la sesión activa, pasar a la primera conectada o a null
        if (_state.activeNum === numero) {
            _state.activeNum     = _state.sesiones.find(s => s.status === 'conectado')?.numero || null;
            _state.activeContact = null;
            _showListView();
        }
        _renderSessions();
        _renderSesionesView();
        _scheduleConteos();
        _renderList();
        _showToast('Sesión desconectada');
    } catch {
        _showToast('Error al desconectar');
    }
}

// ── Eliminar sesion permanentemente (admin) ───────────────────────────────
async function _eliminarSesion(numero) {
    const label = _sessionLabel(numero);
    if (!confirm(`¿Eliminar la conexión "${label}" permanentemente?\n\nSe eliminará la sesión, los archivos de autenticación y el registro en la base de datos. Las conversaciones pasadas se conservan.`)) return;
    try {
        await fetch(`${HETZNER_URL}/wa/sesiones/${encodeURIComponent(numero)}?eliminar=true`, { method: 'DELETE' });

        // Eliminar completamente del estado
        _state.sesiones = _state.sesiones.filter(s => s.numero !== numero);
        delete _state.conv[numero];

        // Si era la sesión activa, cerrar chat
        if (_state.activeNum === numero) {
            _state.activeNum     = _state.sesiones.find(s => s.status === 'conectado')?.numero || null;
            _state.activeContact = null;
            _showListView();
        }

        _saveConv();
        _renderSessions();
        _renderSesionesView();
        _scheduleConteos();
        _renderList();
        _showToast(`Conexión "${label}" eliminada`);
    } catch {
        _showToast('Error al eliminar la conexión');
    }
}

// ── Conectar numero (admin) ────────────────────────────────────────────────
function _toggleConnectForm() {
    const wrap = document.getElementById('wap-connect-form');
    if (!wrap) return;

    if (wrap.style.display !== 'none') {
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        return;
    }

    wrap.style.display = 'block';
    wrap.innerHTML = `
        <div class="wap-connect-form">
            <input type="tel" id="wap-cf-num" placeholder="Numero WhatsApp (ej: 573001234567)">
            <input type="text" id="wap-cf-sede" placeholder="Sede (ej: bucaramanga)">
            <div class="wap-connect-form-btns">
                <button class="wap-btn-cancel" id="wap-cf-cancel">Cancelar</button>
                <button class="wap-btn-ok" id="wap-cf-ok">Conectar</button>
            </div>
        </div>`;

    document.getElementById('wap-cf-cancel').addEventListener('click', () => {
        wrap.style.display = 'none';
        wrap.innerHTML = '';
    });
    document.getElementById('wap-cf-ok').addEventListener('click', async () => {
        const numero = document.getElementById('wap-cf-num').value.replace(/\D/g, '');
        const sede   = document.getElementById('wap-cf-sede').value.trim();
        if (!numero || !sede) return alert('Completa todos los campos');
        const btn = document.getElementById('wap-cf-ok');
        btn.disabled = true;
        btn.textContent = 'Conectando...';
        try {
            const r = await fetch(`${HETZNER_URL}/wa/sesiones`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ numero, sede }),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(data.error || 'Error');
            wrap.style.display = 'none';
            wrap.innerHTML = '';
            // Marcar que este cliente espera el QR de este numero
            _waitingQrFor = numero;
            // Mostrar modal de inmediato (QR llegará por WS o viene en la respuesta)
            _onQr({ numero, sede, qr: data.qr || null });
            // Si en 6s no llega wa:qr por WS, la sesión probablemente ya existe con
            // credenciales viejas → borrar y recrear para forzar QR fresco.
            const _qrTimeout = setTimeout(async () => {
                if (!document.getElementById('wap-qr-modal')?.classList.contains('active')) return;
                const imgEl2 = document.getElementById('wap-qr-img');
                if (imgEl2?.querySelector('img')) return; // ya llegó el QR, no hacer nada
                // Mostrar pasos de recreación de sesión
                _startQrSteps([
                    { delay: 0,    text: 'Limpiando sesión anterior...' },
                    { delay: 1800, text: 'Reiniciando conexión...' },
                    { delay: 3500, text: 'Generando código QR...' },
                ]);
                try {
                    // Borrar sesión existente
                    await fetch(`${HETZNER_URL}/wa/sesiones/${encodeURIComponent(numero)}`, { method: 'DELETE' });
                    // Esperar un momento y recrear
                    await new Promise(r => setTimeout(r, 1500));
                    const r2 = await fetch(`${HETZNER_URL}/wa/sesiones`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ numero, sede }),
                    });
                    const d2 = await r2.json().catch(() => ({}));
                    if (d2.qr) _showQr(numero, d2.qr);
                } catch { /* ignore */ }
            }, 6000);
        } catch (e) {
            alert('Error al conectar: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Conectar';
        }
    });
}

// ── Persistencia localStorage ──────────────────────────────────────────────
function _purgeEmptyConvs() {
    let changed = false;
    for (const num of Object.keys(_state.conv)) {
        for (const phone of Object.keys(_state.conv[num])) {
            const c = _state.conv[num][phone];
            if (!c.msgs?.length && !c.lastMsg) {
                delete _state.conv[num][phone];
                changed = true;
            }
        }
    }
    if (changed) _saveConv();
}

function _saveConv() {
    try {
        // Limitar a MAX_MSGS por conversacion antes de guardar
        const trimmed = {};
        for (const num of Object.keys(_state.conv)) {
            trimmed[num] = {};
            for (const phone of Object.keys(_state.conv[num])) {
                const c = _state.conv[num][phone];
                trimmed[num][phone] = {
                    ...c,
                    msgs: c.msgs.slice(-MAX_MSGS),
                };
            }
        }
        localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
    } catch { /* localStorage lleno — ignorar */ }
}

// Solo carga msgs y customName como caché temporal para mostrar historial
// mientras llega la respuesta de Supabase. _loadConversaciones() lo reemplaza.
function _loadConv() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        for (const num of Object.keys(parsed)) {
            const convs = parsed[num];
            for (const phone of Object.keys(convs)) {
                const c = convs[phone];
                if (phone.includes('@')) continue; // grupos, canales, listas
                if (!c.msgs?.length && !c.lastMsg) continue;
                if (!_state.conv[num]) _state.conv[num] = {};
                // Solo msgs, nombre y name como caché — lista y metadata vienen de Supabase
                _state.conv[num][phone] = {
                    msgs:    c.msgs?.slice(-MAX_MSGS) || [],
                    unread:  0,
                    nombre:  c.nombre || null, // clientes BD
                    name:    c.name   || null, // pushName WA
                    lastMsg: c.lastMsg || '',
                    lastTs:  c.lastTs  || 0,
                };
            }
        }
    } catch { /* datos corruptos — ignorar */ }
}

// ── Toast ──────────────────────────────────────────────────────────────────
function _showToast(msg, ms = 3000) {
    const t = document.createElement('div');
    t.className = 'wap-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
}

// ── Reenvío de mensajes ─────────────────────────────────────────────────────
let _fwdMsg = null; // mensaje a reenviar

function _openFwdModal(msgId) {
    // Buscar el mensaje en _state.conv
    let found = null;
    for (const phones of Object.values(_state.conv[_state.activeNum] || {})) {
        found = phones.msgs?.find(x => x.msgId === msgId);
        if (found) break;
    }
    if (!found) return;
    _fwdMsg = found;

    // Reutilizar el modal de Nueva Conversación en modo reenvío
    _openNuevaConvModal(async (num, phone) => {
        await _doForward(num, phone);
    });
}

function _closeFwdModal() {
    _closeNuevaConvModal();
    _fwdMsg = null;
}


async function _doForward(num, phone) {
    if (!_fwdMsg) return;
    const m = _fwdMsg;
    _fwdMsg = null;

    // Construir JID válido: usar sufijo guardado en conv, o @s.whatsapp.net por defecto
    const jidSuffix    = _state.conv[num]?.[phone]?.jidSuffix || '@s.whatsapp.net';
    const destinatario = phone + jidSuffix;

    // Navegar al chat destino
    _state.activeNum = num;
    _navTo('conv');
    _openChat(phone);

    // Si ya existe la conv → intentar tomarla (no bloqueamos si falla)
    if (_state.conv[num]?.[phone]) {
        _tomarChat(num, phone).catch(() => {});
    }

    try {
        if (m.mediaUrl) {
            // Media: descargar desde Storage y reenviar como multipart
            const resp = await fetch(m.mediaUrl);
            if (!resp.ok) throw new Error('No se pudo descargar el archivo');
            const blob = await resp.blob();
            const ext  = m.mediaUrl.split('.').pop().split('?')[0] || 'bin';
            const file = new File([blob], `reenvio.${ext}`, { type: blob.type });
            const fd   = new FormData();
            fd.append('numero',       num);
            fd.append('destinatario', destinatario);
            fd.append('asesor',       _asesorActual || '');
            if (m.text) {
                const sep = m.text.indexOf(': ');
                const caption = sep !== -1 ? m.text.slice(sep + 2) : '';
                if (caption) fd.append('caption', caption);
            }
            fd.append('file', file);
            await fetch(`${HETZNER_URL}/wa/mensajes/media`, { method: 'POST', body: fd });
        } else {
            // Texto plano
            await fetch(`${HETZNER_URL}/wa/mensajes`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ numero: num, destinatario, texto: m.text, asesor: _asesorActual || '' }),
            });
        }
    } catch (err) {
        console.error('[fwd]', err);
        _showToast('Error al reenviar', 3000);
    }
}

// ── Lightbox imágenes ───────────────────────────────────────────────────────
function _openLightbox(src) {
    const lb = document.createElement('div');
    lb.className = 'wap-lightbox';
    lb.innerHTML = `<button class="wap-lightbox-close" title="Cerrar">&times;</button><img src="${src}" alt="imagen">`;
    lb.addEventListener('click', e => { if (e.target === lb || e.target.classList.contains('wap-lightbox-close')) lb.remove(); });
    document.addEventListener('keydown', function onEsc(e) { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onEsc); } });
    document.body.appendChild(lb);
}

// ── Flash icono del panel (nuevo mensaje) ──────────────────────────────────
function _flashIcon() {
    const strip = document.getElementById('wa-strip');
    if (!strip) return;
    strip.classList.add('wap-flash');
    setTimeout(() => strip.classList.remove('wap-flash'), 1500);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _fmtPhone(raw) {
    const n = String(raw || '').replace(/\D/g, '');
    if (n.startsWith('57') && n.length === 12) return `+57 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
    if (n.length === 10) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
    return raw;
}

function _initials(nameOrPhone) {
    const s = String(nameOrPhone || '').trim();
    // Si tiene letras → iniciales del nombre
    if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s)) {
        return s.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }
    // Si es puro número → últimos 2 dígitos
    return s.replace(/\D/g, '').slice(-2) || '??';
}

function _fmtTs(ts) {
    const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
    const d  = new Date(ms);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Clave de día para agrupar mensajes: "YYYY-M-D"
function _dayKey(ts) {
    const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
    const d  = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Etiqueta de fecha para separadores en el chat de mensajes
function _dateLabelChat(ts) {
    const ms  = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
    const d   = new Date(ms);
    const now = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(+today - 86400000);
    const itemDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (+itemDay === +today)     return 'Hoy';
    if (+itemDay === +yesterday) return 'Ayer';
    const diffDays = Math.floor((+today - +itemDay) / 86400000);
    if (diffDays < 7) return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Solo hora HH:MM (para lista resueltas donde la fecha va como separador)
function _fmtTsHora(ts) {
    const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// Etiqueta de fecha para separadores en lista resueltas: HOY / AYER / DD MMM YYYY
function _dateLabelResueltas(ts) {
    const ms = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
    const d  = new Date(ms);
    const now = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(+today - 86400000);
    const itemDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (+itemDay === +today)     return 'HOY';
    if (+itemDay === +yesterday) return 'AYER';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
}

function _capitalizarSede(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ── Reply ───────────────────────────────────────────────────────────────────

function _updateReplyBar() {
    const bar  = document.getElementById('wap-reply-bar');
    if (!bar) return;
    if (!_replyingTo) { bar.classList.remove('visible'); return; }
    document.getElementById('wap-reply-author').textContent = _replyingTo.fromMe ? (_asesorActual || 'Tú') : _replyingTo.nombre;
    document.getElementById('wap-reply-text').textContent   = _replyingTo.texto;
    bar.classList.add('visible');
}

function _cancelReply() {
    _replyingTo = null;
    _updateReplyBar();
}

// ── Editar / Eliminar mensaje ───────────────────────────────────────────────

async function _saveEditMsg(msgId) {
    const texto = document.getElementById('wap-edit-ta')?.value.trim();
    if (!texto) { _showToast('El mensaje no puede estar vacío', 2500); return; }
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/mensajes/${encodeURIComponent(num)}/${encodeURIComponent(phone)}/${encodeURIComponent(msgId)}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ texto, asesor: _asesorActual }) }
        );
        if (!r.ok) { _showToast('Error al editar', 3000); return; }
        // Actualizar localmente (optimistic)
        const c = _state.conv[num]?.[phone];
        if (c) {
            const m = c.msgs.find(x => x.msgId === msgId);
            if (m) { m.text = texto; m.editado = true; }
            _saveConv();
        }
        _editingMsgId = null;
        _renderMsgs();
    } catch { _showToast('Error de conexión', 3000); }
}

function _onMsgEditado({ numero, contacto, msgId, texto }) {
    const c = _state.conv[numero]?.[contacto];
    if (!c) return;
    const m = c.msgs.find(x => x.msgId === msgId);
    if (!m) return;
    m.text    = texto;
    m.editado = true;
    _saveConv();
    if (_state.activeNum === numero && _state.activeContact === contacto) {
        const bubble = document.querySelector(`[data-msgid="${CSS.escape(msgId)}"]`);
        const textEl = bubble?.querySelector('.wap-msg-text');
        if (textEl) {
            textEl.textContent = texto;
            if (!bubble.querySelector('.wap-msg-edited')) {
                bubble.querySelector('.wap-msg-ts')?.insertAdjacentHTML('beforebegin', '<span class="wap-msg-edited">Editado</span>');
            }
        } else {
            _renderMsgs();
        }
    }
}

// Edición de mensaje por el cliente desde WhatsApp
function _onMsgEdit({ numero, contacto, msgId, textoNuevo }) {
    const c = _state.conv[numero]?.[contacto];
    if (!c) return;
    const m = c.msgs.find(x => x.msgId === msgId);
    if (!m) return;
    m.text    = textoNuevo;
    m.editado = true;
    _saveConv();
    if (_state.activeNum === numero && _state.activeContact === contacto) {
        const bubble = document.querySelector(`[data-msgid="${CSS.escape(msgId)}"]`);
        const textEl = bubble?.querySelector('.wap-msg-text');
        if (textEl) {
            textEl.textContent = textoNuevo;
            if (!bubble.querySelector('.wap-msg-edited')) {
                bubble.querySelector('.wap-msg-ts')?.insertAdjacentHTML('beforebegin', '<span class="wap-msg-edited">Editado</span>');
            }
        } else {
            _renderMsgs();
        }
    }
}

async function _deleteMsg(msgId) {
    if (!msgId || !_state.activeNum || !_state.activeContact) return;
    if (!confirm('¿Eliminar este mensaje para todos?')) return;
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    try {
        const r = await fetch(
            `${HETZNER_URL}/wa/mensajes/${encodeURIComponent(num)}/${encodeURIComponent(phone)}/${encodeURIComponent(msgId)}`,
            { method: 'DELETE' }
        );
        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            _showToast(err.error || 'Error al eliminar', 3000);
            return;
        }
        // Eliminar localmente (el WS broadcast también lo hará para otros paneles)
        _removeMsgLocally(num, phone, msgId);
    } catch { _showToast('Error de conexión', 3000); }
}

function _onMsgEliminado({ numero, contacto, msgId }) {
    if (!numero || !contacto || !msgId) return;
    _removeMsgLocally(numero, contacto, msgId);
}

function _removeMsgLocally(num, phone, msgId) {
    const c = _state.conv[num]?.[phone];
    if (!c) return;
    c.msgs = c.msgs.filter(m => m.msgId !== msgId);
    _saveConv();
    if (_state.activeNum === num && _state.activeContact === phone) _renderMsgs();
}

// ── Auto-resize textarea ────────────────────────────────────────────────────
function _autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Respuestas rápidas ──────────────────────────────────────────────────────

async function _loadRespuestasRapidas() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/respuestas-rapidas`);
        if (!r.ok) return;
        _state.respuestasRapidas = await r.json();
    } catch { /* sin conexión */ }
}

function _renderRRView() {
    const list = document.getElementById('wap-rr-list');
    if (!list) return;
    if (!_state.respuestasRapidas.length) {
        list.innerHTML = `<p class="wap-rr-empty">Sin respuestas rápidas — crea la primera con "+ Nueva"</p>`;
        return;
    }
    const q = (document.getElementById('wap-rr-search')?.value || '').toLowerCase().trim();
    const items = q
        ? _state.respuestasRapidas.filter(rr =>
            rr.titulo.toLowerCase().includes(q) || rr.texto.toLowerCase().includes(q))
        : _state.respuestasRapidas;
    if (!items.length) {
        list.innerHTML = `<p class="wap-rr-empty">Sin resultados para "${_esc(q)}"</p>`;
        return;
    }
    list.innerHTML = items.map(rr => `
        <div class="wap-rr-item" data-id="${rr.id}">
            <div class="wap-rr-item-body">
                <div class="wap-rr-item-titulo">${_esc(rr.titulo)}${rr.media_url ? '<span class="wap-rr-media-badge">&#128206;</span>' : ''}</div>
                <div class="wap-rr-item-texto">${_esc(rr.texto)}</div>
            </div>
            <div class="wap-rr-item-btns">
                <button class="wap-rr-icon-btn" data-rr-edit="${rr.id}" title="Editar">&#9998;</button>
                <button class="wap-rr-icon-btn wap-rr-icon-btn--del" data-rr-del="${rr.id}" title="Eliminar">&#128465;</button>
            </div>
        </div>`).join('');
}

function _openRRForm(id) {
    const form = document.getElementById('wap-rr-form');
    if (!form) return;
    _rrPendingFile = null;
    const rr = id ? _state.respuestasRapidas.find(x => x.id === id) : null;
    const mediaIcon = t => t === 'imagen' ? '🖼️' : t === 'video' ? '🎬' : t === 'audio' ? '🎵' : '📄';
    form.style.display = '';
    form.innerHTML = `
        <input  id="wap-rr-titulo" type="text" placeholder="Título corto (ej: saludo)" maxlength="60" value="${_esc(rr?.titulo || '')}">
        <small id="wap-rr-titulo-warn" style="display:none;color:#dc2626;font-size:1.05rem;margin-top:-2px;">Ya existe una respuesta con ese título</small>
        <textarea id="wap-rr-texto" rows="3"   placeholder="Texto del mensaje...">${_esc(rr?.texto || '')}</textarea>
        <p class="wap-rr-vars-hint">Insertar: <code class="wap-rr-var" data-var="{nombreUsuario}">{nombreUsuario}</code><code class="wap-rr-var" data-var="{nombreAsesor}">{nombreAsesor}</code></p>
        <input type="file" id="wap-rr-file-input" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" style="display:none">
        ${rr?.media_url
            ? `<div class="wap-rr-media-row" id="wap-rr-media-row">
                   <span>${mediaIcon(rr.media_tipo)} ${_esc(rr.media_nombre || rr.media_tipo || 'Archivo adjunto')}</span>
                   <button class="wap-rr-media-del" id="wap-rr-media-del" title="Quitar adjunto">&#x2715;</button>
               </div>`
            : `<div class="wap-rr-media-row" id="wap-rr-media-row" style="display:none"></div>`
        }
        <button class="wap-rr-attach-btn" id="wap-rr-attach-btn">&#128206; Adjuntar archivo</button>
        <div class="wap-rr-form-btns">
            <button class="wap-btn-secondary" id="wap-rr-cancel">Cancelar</button>
            <button class="wap-btn-connect"   id="wap-rr-save" style="margin:0;font-size:1.1rem;padding:5px 14px;">${rr ? 'Guardar' : 'Crear'}</button>
        </div>`;

    form.querySelector('#wap-rr-cancel').addEventListener('click', () => {
        _rrPendingFile = null;
        form.style.display = 'none';
        form.innerHTML = '';
    });
    form.querySelector('#wap-rr-save').addEventListener('click', () => _saveRR(id));
    form.querySelector('#wap-rr-attach-btn').addEventListener('click', () => form.querySelector('#wap-rr-file-input').click());
    form.querySelector('#wap-rr-file-input').addEventListener('change', e => {
        const file = e.target.files?.[0];
        if (!file) return;
        _rrPendingFile = file;
        const mediaIcon = t => t === 'imagen' ? '🖼️' : t === 'video' ? '🎬' : t === 'audio' ? '🎵' : '📄';
        const tipo = file.type.startsWith('image/') ? 'imagen' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'documento';
        const row = form.querySelector('#wap-rr-media-row');
        row.innerHTML = `<span>${mediaIcon(tipo)} ${_esc(file.name)}</span><button class="wap-rr-media-del" id="wap-rr-media-del" title="Quitar adjunto">&#x2715;</button>`;
        row.style.display = 'flex';
        row.querySelector('#wap-rr-media-del').addEventListener('click', () => { _rrPendingFile = null; row.style.display = 'none'; row.innerHTML = ''; });
    });
    const delBtn = form.querySelector('#wap-rr-media-del');
    if (delBtn) delBtn.addEventListener('click', () => {
        _rrPendingFile = null;
        const row = form.querySelector('#wap-rr-media-row');
        row.style.display = 'none'; row.innerHTML = '';
    });
    form.querySelectorAll('.wap-rr-var').forEach(badge => {
        badge.addEventListener('click', () => {
            const ta = form.querySelector('#wap-rr-texto');
            const start = ta.selectionStart, end = ta.selectionEnd, v = badge.dataset.var;
            ta.value = ta.value.slice(0, start) + v + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + v.length;
            ta.focus();
        });
    });
    form.querySelector('#wap-rr-titulo').addEventListener('input', e => {
        const val = e.target.value.trim().toLowerCase();
        const warn = form.querySelector('#wap-rr-titulo-warn');
        const dup = val && _state.respuestasRapidas.some(x => x.id !== id && x.titulo.toLowerCase() === val);
        warn.style.display = dup ? '' : 'none';
    });
    form.querySelector('#wap-rr-titulo').focus();
}

async function _saveRR(id) {
    const titulo  = document.getElementById('wap-rr-titulo')?.value.trim();
    const texto   = document.getElementById('wap-rr-texto')?.value.trim();
    if (!titulo || !texto) { _showToast('Completa título y texto', 2500); return; }
    const dup = _state.respuestasRapidas.find(x => x.id !== id && x.titulo.toLowerCase() === titulo.toLowerCase());
    if (dup) { _showToast('Ya existe una respuesta con ese título', 3000); return; }

    // Feedback en el botón mientras guarda
    const saveBtn = document.getElementById('wap-rr-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `${HETZNER_URL}/wa/respuestas-rapidas/${id}` : `${HETZNER_URL}/wa/respuestas-rapidas`;

    const rrActual     = id ? _state.respuestasRapidas.find(x => x.id === id) : null;
    const mediaRow     = document.getElementById('wap-rr-media-row');
    const mediaEliminada = rrActual?.media_url && !_rrPendingFile && mediaRow?.style.display === 'none';

    try {
        let r;
        if (_rrPendingFile) {
            const fd = new FormData();
            fd.append('titulo', titulo);
            fd.append('texto', texto);
            fd.append('file', _rrPendingFile);
            r = await fetch(url, { method, body: fd });
        } else {
            r = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ titulo, texto }),
            });
        }

        if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            _showToast('Error al guardar: ' + (err.error || r.status), 4000);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = id ? 'Guardar' : 'Crear'; }
            return;
        }

        const saved = await r.json();

        if (mediaEliminada) {
            await fetch(`${HETZNER_URL}/wa/respuestas-rapidas/${id}/media`, { method: 'DELETE' }).catch(() => {});
            saved.media_url = null; saved.media_tipo = null; saved.media_nombre = null;
        }

        if (id) {
            const idx = _state.respuestasRapidas.findIndex(x => x.id === id);
            if (idx !== -1) _state.respuestasRapidas[idx] = saved;
        } else {
            _state.respuestasRapidas.push(saved);
        }
        _rrPendingFile = null;
        const form = document.getElementById('wap-rr-form');
        if (form) { form.style.display = 'none'; form.innerHTML = ''; }
        _renderRRView();
        _showToast(id ? 'Respuesta actualizada ✓' : 'Respuesta creada ✓', 2500);
    } catch (e) {
        _showToast('Error de conexión: ' + e.message, 4000);
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = id ? 'Guardar' : 'Crear'; }
    }
}

async function _deleteRR(id) {
    if (!confirm('¿Eliminar esta respuesta rápida?')) return;
    try {
        const r = await fetch(`${HETZNER_URL}/wa/respuestas-rapidas/${id}`, { method: 'DELETE' });
        if (!r.ok) { _showToast('Error al eliminar', 3000); return; }
        _state.respuestasRapidas = _state.respuestasRapidas.filter(x => x.id !== id);
        _renderRRView();
        _showToast('Respuesta eliminada');
    } catch { _showToast('Error de conexión', 3000); }
}

// ── Slash picker ────────────────────────────────────────────────────────────

let _slashIdx     = -1;    // ítem seleccionado en el picker
let _editingMsgId = null;  // msgId del mensaje en edición inline
let _replyingTo   = null;  // { msgId, texto, fromMe, nombre } | null

function _slashPickerOpen() {
    return document.getElementById('wap-slash-picker')?.classList.contains('visible');
}

function _onInputSlash() {
    const input = document.getElementById('wap-input');
    const val   = input?.value ?? '';
    if (!val.startsWith('/')) { _hideSlashPicker(); return; }

    const query   = val.slice(1).toLowerCase();
    const matches = _state.respuestasRapidas.filter(rr =>
        rr.titulo.toLowerCase().includes(query)
    );

    if (!matches.length) { _hideSlashPicker(); return; }

    const picker = document.getElementById('wap-slash-picker');
    if (!picker) return;

    picker.innerHTML = matches.map((rr, i) => `
        <div class="wap-slash-item${i === 0 ? ' wap-slash-selected' : ''}" data-slash-idx="${i}" data-slash-id="${rr.id}">
            <span class="wap-slash-item-titulo">${_esc(rr.titulo)}${rr.media_url ? ' &#128206;' : ''}</span>
            <span class="wap-slash-item-texto">${_esc(rr.texto)}</span>
        </div>`).join('');

    _slashIdx = 0;
    picker.classList.add('visible');

    // click en un ítem
    picker.querySelectorAll('.wap-slash-item').forEach(el => {
        el.addEventListener('mousedown', e => {
            e.preventDefault(); // evita blur en el input
            const id = parseInt(el.dataset.slashId);
            _applySlash(id);
        });
    });
}

function _slashMove(delta) {
    const items = document.querySelectorAll('#wap-slash-picker .wap-slash-item');
    if (!items.length) return;
    items[_slashIdx]?.classList.remove('wap-slash-selected');
    _slashIdx = Math.max(0, Math.min(items.length - 1, _slashIdx + delta));
    items[_slashIdx]?.classList.add('wap-slash-selected');
    items[_slashIdx]?.scrollIntoView({ block: 'nearest' });
}

function _slashConfirm() {
    const selected = document.querySelector('#wap-slash-picker .wap-slash-selected');
    if (!selected) return;
    const id = parseInt(selected.dataset.slashId);
    _applySlash(id);
}

async function _applySlash(id) {
    const rr    = _state.respuestasRapidas.find(x => x.id === id);
    const input = document.getElementById('wap-input');
    if (!rr || !input) return;

    // Resolver variables
    const c             = _state.conv[_state.activeNum]?.[_state.activeContact];
    const nombreUsuario = c?.nombre || c?.name || _fmtPhone(_state.activeContact);
    const nombreAsesor  = _asesorActual || '';

    input.value = rr.texto
        .replace(/\{nombreUsuario\}/gi, nombreUsuario)
        .replace(/\{nombreAsesor\}/gi, nombreAsesor);
    _autoResizeTextarea(input);
    _updateSendVoiceBtn();
    _hideSlashPicker();

    // Si la RR tiene adjunto, descargarlo con progreso visible sobre el input
    if (rr.media_url) {
        const bar   = document.getElementById('wap-media-loading');
        const name  = document.getElementById('wap-media-loading-name');
        const fill  = document.getElementById('wap-media-loading-fill');
        const pct   = document.getElementById('wap-media-loading-pct');

        if (bar) {
            if (name) name.textContent = rr.media_nombre || 'Adjunto';
            if (fill) fill.style.width = '0%';
            if (pct)  pct.textContent  = '0%';
            bar.style.display = 'flex';
        }

        _pendingMediaFetch = (async () => {
            try {
                const response = await fetch(rr.media_url);
                const total    = parseInt(response.headers.get('Content-Length') || '0', 10);
                const reader   = response.body.getReader();
                const chunks   = [];
                let received   = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    received += value.length;
                    if (total && fill && pct) {
                        const p = Math.min(99, Math.round((received / total) * 100));
                        fill.style.width = p + '%';
                        pct.textContent  = p + '%';
                    }
                }

                if (fill) fill.style.width = '100%';
                if (pct)  pct.textContent  = '100%';

                const mime = (response.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim();
                const blob = new Blob(chunks, { type: mime });
                _setPendingFile(new File([blob], rr.media_nombre || 'archivo', { type: mime }));
            } catch {
                _showToast('No se pudo cargar el adjunto', 3000);
            } finally {
                if (bar) bar.style.display = 'none';
                _pendingMediaFetch = null;
            }
        })();
    }

    input.focus();
}

function _hideSlashPicker() {
    const picker = document.getElementById('wap-slash-picker');
    if (picker) { picker.classList.remove('visible'); picker.innerHTML = ''; }
    _slashIdx = -1;
}
