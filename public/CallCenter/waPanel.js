/**
 * waPanel.js — WhatsApp Omnicanal Panel
 * Se inicializa con initWaPanel('wa-body', { rol }) desde callcenter-shell.html
 * Renderiza lista de conversaciones + chat inline dentro del panel lateral.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js';

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
    '#f59e0b', // amarillo
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
    filtroAsesor:    null,  // null = todos | 'nombre' = solo ese asesor (admin)
    filtroSesiones:    new Set(), // Set<numero> vacío = todas las sesiones
    conteos:           { en_espera: 0, asignado: 0, resuelto: 0 }, // desde Supabase, compartido
    respuestasRapidas: [], // [{ id, titulo, texto }]
    resueltas: { items: [], offset: 0, loading: false, done: false }, // paginación infinita
};

// ── Helpers de estado ───────────────────────────────────────────────────────
function _getAsig(num, phone)   { return _state.asignaciones[`${num}:${phone}`]; }
function _getEstado(num, phone) { const a = _getAsig(num, phone); return a ? (a.estado || 'asignado') : 'en_espera'; }
function _esMio(num, phone)     { return _getAsig(num, phone)?.asesor === _asesorActual; }

let _editingNum    = null;  // numero cuya card está en modo edición
let _pendingColors = {};   // { [numero]: colorHex } — selección temporal antes de guardar

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
let _ws              = null;
let _wsEverConnected = false; // true después de la primera conexión exitosa
let _qrNumero        = null;  // numero cuyo QR modal esta abierto
let _waitingQrFor    = null;  // numero que este cliente esta esperando escanear (solo quien lo genero)
let _qrStepTimers    = [];    // timers de animación de pasos del modal QR
let _tmpMsgId        = 0;     // contador para identificar mensajes optimistas
const _pendingStatuses = new Map(); // msgId → {numero,status} para ACKs que llegan antes del echo

const LS_KEY      = 'wap_conv_v2';
const MAX_MSGS    = 200;   // maximos mensajes guardados por conversacion

// ── API pública ────────────────────────────────────────────────────────────
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
    _renderShell(body);
    _loadSessions();
    _loadAsignaciones();
    _loadConversaciones(); // fuente de verdad — reconstruye conv desde Supabase
    _loadRespuestasRapidas();
    _connectWs();
    setInterval(_loadConversaciones, 60_000); // re-sync cada 60s
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
    background: #f4ecdf;
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
    background: #f5f0e8;
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
.wap-ses-card--editing { flex-direction: column; align-items: stretch; }
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
    gap: 0;
    padding: 9px 12px 8px;
    border-bottom: 1px solid rgba(0,0,0,.08);
    flex-shrink: 0;
    background: #f5f0e8;
}
.wap-panel-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--color-primario);
    flex-shrink: 0;
}
/* ── Asesor dropdown (header) ────────────────────── */
.wap-asesor-pills {
    position: relative;
    flex: 1;
    padding: 0 6px;
    min-width: 0;
}
.wap-asesor-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 11px;
    border-radius: 20px;
    border: 1px solid rgba(0,0,0,.12);
    background: transparent;
    color: #374151;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    max-width: 100%;
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
    position: absolute;
    top: calc(100% + 6px);
    left: 6px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0,0,0,.13);
    z-index: 9999;
    min-width: 160px;
    padding: 4px 0;
    display: none;
}
.wap-asesor-dropdown.open { display: block; }
.wap-asesor-opt {
    display: block;
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
.wap-sessions-icon {
    width: 28px; height: 28px;
    border: 1px solid rgba(0,0,0,.15);
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #374151;
    padding: 0;
    transition: background .15s;
}
.wap-sessions-icon:hover { background: rgba(0,0,0,.06); }

/* ── Sessions colapsable ─────────────────────────── */
.wap-sessions-wrap {
    flex-shrink: 0;
    border-bottom: 1px solid rgba(0,0,0,.08);
}
.wap-sessions-active-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.wap-sessions {
    display: none;
    flex-direction: column;
    padding: 4px 0 6px;
}
.wap-sessions-wrap.open .wap-sessions { display: flex; }
.wap-sessions-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 14px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2rem;
    font-weight: 500;
    color: #374151;
    text-align: left;
    transition: background .12s;
}
.wap-sessions-item:hover { background: rgba(0,0,0,.04); }
.wap-sessions-item--active {
    background: rgba(0,0,0,.06);
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
    padding: 10px 12px 10px 10px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0,0,0,.05);
    transition: background .12s;
    border-left: 4px solid transparent;
}
.wap-conv-item:hover { background: rgba(0,0,0,.04); }
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
}
.wap-conv-info {
    flex: 1;
    min-width: 0;
}
.wap-conv-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4px;
}
.wap-conv-name {
    font-weight: 600;
    font-size: 1.3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-terciario);
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
    border-radius: 16px;
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

/* ── Chat view ───────────────────────────────────── */
.wap-chat {
    display: none;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}
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
.wap-msg--out:hover .wap-msg-menu-btn { display: flex; }
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
.wap-reactions { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.wap-reaction-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; background: rgba(0,0,0,.08); border-radius: 12px; font-size: 15px; cursor: default; border: 1px solid rgba(0,0,0,.10); }
.wap-msg--out .wap-reactions { justify-content: flex-end; }
.wap-msg-ts {
    font-size: 1rem;
    color: #9ca3af;
    align-self: flex-end;
}
.wap-input-row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 8px 10px;
    background: #f0f0f0;
    flex-shrink: 0;
}
.wap-input-row textarea {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 20px;
    font-size: 1.3rem;
    font-family: inherit;
    background: #fff;
    resize: none;
    overflow-y: auto;
    min-height: 36px;
    max-height: 120px;
    line-height: 1.4;
    scrollbar-width: thin;
}
.wap-input-row textarea:focus { outline: none; }
.wap-input-row button {
    background: var(--color-primario);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 36px;
    height: 36px;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background .15s;
}
.wap-input-row button:hover { background: var(--color-cuaternario); }

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
    background: #f4ecdf;
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

            <!-- ── Área de contenido ── -->
            <div class="wap-content" id="wap-content">

                <!-- Vista: Conversaciones -->
                <div class="wap-view" id="wap-view-conv">
                    <div class="wap-panel-header">
                        <span class="wap-panel-title">WhatsApp</span>
                        <div class="wap-asesor-pills" id="wap-asesor-pills"></div>
                        <button class="wap-sessions-icon" id="wap-sessions-toggle" title="Conexiones" style="display:none;">
                            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg>
                        </button>
                    </div>
                    <div class="wap-sessions-wrap" id="wap-sessions-wrap" style="display:none;">
                        <div class="wap-sessions" id="wap-sessions"></div>
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
                            <div class="wap-chat-avatar" id="wap-chat-avatar"></div>
                            <div class="wap-chat-info" id="wap-chat-info">
                                <div class="wap-chat-name-row">
                                    <span class="wap-chat-name" id="wap-chat-name"></span>
                                    <button class="wap-edit-name-btn" id="wap-edit-name-btn" title="Editar nombre">&#9998;</button>
                                    <button class="wap-vincular-lid-btn" id="wap-vincular-lid-btn" title="Vincular a número real" style="display:none;">&#128279;</button>
                                </div>
                                <span class="wap-chat-via" id="wap-chat-via"></span>
                                <span class="wap-chat-conexion" id="wap-chat-conexion"></span>
                            </div>
                            <button class="wap-liberar-btn" id="wap-liberar-btn" title="Resolver y liberar a bandeja" style="display:none;">&#10003; Resolver</button>
                        </div>
                        <div class="wap-msgs" id="wap-msgs"></div>
                        <div class="wap-offline-bar" id="wap-offline-bar">
                            ⚠️ Sesión desconectada — reconecta para responder
                        </div>
                        <div class="wap-espera-bar" id="wap-espera-bar">
                            <span>💬 En espera — toma el chat para responder</span>
                            <button class="wap-tomar-chat-btn" id="wap-tomar-chat-btn">Tomar</button>
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
                        <div class="wap-input-row">
                            <div class="wap-slash-picker" id="wap-slash-picker"></div>
                            <textarea id="wap-input" placeholder="Escribe un mensaje..." rows="1"></textarea>
                            <button id="wap-send">&#10148;</button>
                        </div>
                    </div>
                </div>

                <!-- Vista: Respuestas rápidas -->
                <div class="wap-view wap-view--hidden" id="wap-view-rr">
                    <div class="wap-rr-header">
                        <span>Respuestas rápidas</span>
                        <button class="wap-btn-connect" id="wap-rr-new-btn" style="margin:0;font-size:1.1rem;padding:5px 10px;">+ Nueva</button>
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
        _renderList();
    });
    document.getElementById('wap-back').addEventListener('click', _closeChat);
    document.getElementById('wap-liberar-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _liberarChat(_state.activeNum, _state.activeContact);
    });
    document.getElementById('wap-abrir-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _reabrirChat(_state.activeNum, _state.activeContact);
    });
    document.getElementById('wap-tomar-chat-btn').addEventListener('click', () => {
        if (_state.activeNum && _state.activeContact)
            _tomarChat(_state.activeNum, _state.activeContact);
    });
    document.getElementById('wap-edit-name-btn').addEventListener('click', _editContactName);
    document.getElementById('wap-vincular-lid-btn').addEventListener('click', _vincularLid);
    document.getElementById('wap-send').addEventListener('click', _sendMessage);
    document.getElementById('wap-input').addEventListener('input', e => {
        _onInputSlash();
        _autoResizeTextarea(e.target);
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

    // Cerrar dropdown de asesor al hacer click fuera
    document.addEventListener('click', () => {
        const dd = document.getElementById('wap-asesor-dropdown');
        const btn = document.getElementById('wap-asesor-btn');
        if (dd) dd.classList.remove('open');
        if (btn) btn.classList.remove('wap-asesor-btn--open');
    });

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

// ── Asignaciones ───────────────────────────────────────────────────────────
async function _loadAsignaciones() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/asignaciones`);
        if (!r.ok) return;
        const data = await r.json(); // [{ numero, contacto, asesor, estado }]
        _state.asignaciones = {};
        for (const a of data) _state.asignaciones[`${a.numero}:${a.contacto}`] = { asesor: a.asesor, estado: a.estado || 'asignado' };
        _renderList();
        _scheduleConteos();
        _renderAsesorPills();
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
async function _loadConversaciones() {
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
        // si están en _state.conv pero no en newConv, conservarlas temporalmente
        for (const [num, contactos] of Object.entries(_state.conv)) {
            for (const [phone, data] of Object.entries(contactos)) {
                if (!newConv[num]?.[phone] && data.lastTs > (Date.now() / 1000 - 120)) {
                    // Llegó en los últimos 2 minutos — puede ser lag de Supabase
                    if (!newConv[num]) newConv[num] = {};
                    newConv[num][phone] = data;
                }
            }
        }

        // Descartar conversaciones de sesiones que ya no existen
        const _sesActivas = new Set(_state.sesiones.map(s => s.numero));
        for (const num of Object.keys(newConv)) {
            if (!_sesActivas.has(num)) delete newConv[num];
        }

        _state.conv = newConv;
        _saveConv();
        _renderList();
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
        _setWsStatus('ok');
        if (_wsEverConnected) {
            // Reconexión — recuperar mensajes perdidos durante la desconexión
            _loadConversaciones();
            _loadAsignaciones();
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
            if (msg.tipo === 'wa:asignacion') _onAsignacion(msg);
            if (msg.tipo === 'wa:liberacion') _onLiberacion(msg);
            if (msg.tipo === 'wa:estado')     _onEstado(msg);
            if (msg.tipo === 'wa:merge')         _onMerge(msg);
            if (msg.tipo === 'wa:config')        _onConfig(msg);
            if (msg.tipo === 'wa:msg_status')    _onMsgStatus(msg);
            if (msg.tipo === 'wa:msg_eliminado') _onMsgEliminado(msg);
            if (msg.tipo === 'wa:msg_editado')   _onMsgEditado(msg);
            if (msg.tipo === 'wa:eliminado')     _onSesionEliminada(msg);
            if (msg.tipo === 'wa:rr_update')     _onRrUpdate();
            if (msg.tipo === 'wa:reaccion')      _onReaccion(msg);
        } catch (err) { console.error('[waPanel WS parse error]', err, e.data); }
    };
    _ws.onclose = () => { _setWsStatus('desconectado'); setTimeout(_connectWs, 5000); };
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
    if (!out && _getEstado(numero, phone) !== 'asignado') { _notifAudio.currentTime = 0; _notifAudio.play().catch(() => {}); }
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
        if (m) { m.status = status; updated = true; break; }
    }
    if (!updated) {
        // Condición de carrera: ACK llegó antes que el echo asignara el msgId — guardar para aplicar después
        _pendingStatuses.set(msgId, { numero, status });
        return;
    }
    _saveConv();
    if (_state.activeNum === numero) _renderMsgs();
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
    const _cSuffix = phone.split('@')[1] || '';
    if (_cSuffix !== 's.whatsapp.net' && _cSuffix !== 'lid') return;
    if (!_state.conv[numero]?.[phone]) return;
    const c = _state.conv[numero][phone];
    if (fuente === 'clientes') {
        c.nombre = name; // fuente de verdad — override siempre
    } else if (!c.nombre) {
        c.name = name;   // pushName WA — solo si no hay nombre de clientes
    }
    _saveConv();
    _renderList();
    // Actualizar header si es la conversacion abierta
    if (_state.activeContact === phone && _state.activeNum === numero) _updateChatHeader(phone);
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
        const liberarBtn = document.getElementById('wap-liberar-btn');
        if (liberarBtn) {
            const isAdminChat   = ['admin', 'callcenter-admin'].includes(_rolUsuario);
            const puedeResolver = estado === 'asignado' && (_esMio(numero, contacto) || isAdminChat);
            liberarBtn.style.display = puedeResolver ? '' : 'none';
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
            return `<div class="wap-ses-card wap-ses-card--editing" style="border-left:4px solid ${colorActual};background:#f5f0e8;" data-num="${s.numero}">
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
        toggle.addEventListener('click', () => wrap.classList.toggle('open'));
    }

    // ── Lista vertical con multi-selección ──────────────────────────
    const sel          = _state.filtroSesiones;
    const todasCls     = sel.size === 0 ? ' wap-sessions-item--active' : '';
    const todasChecked = sel.size === 0 ? ' wap-sessions-cb--checked'  : '';
    el.innerHTML = `
        <button class="wap-sessions-item${todasCls}" data-num="">
            <span class="wap-sessions-status wap-sessions-status--green"></span>
            <span class="wap-sessions-name">Todas las conexiones</span>
            <span class="wap-sessions-cb${todasChecked}"></span>
        </button>
        ${sesiones.map(s => {
            const color     = _getColor(s.numero);
            const checked   = sel.has(s.numero);
            const activeCls = checked ? ' wap-sessions-item--active' : '';
            const cbCls     = checked ? ' wap-sessions-cb--checked'  : '';
            const statusCls = s.status === 'conectado'    ? 'wap-sessions-status--green'
                            : s.status === 'esperando_qr' ? 'wap-sessions-status--yellow'
                            : 'wap-sessions-status--red';
            return `<button class="wap-sessions-item${activeCls}" data-num="${s.numero}">
                <span class="wap-sessions-status ${statusCls}"></span>
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

// ── Render asesor dropdown en el header ────────────────────────────────────
function _renderAsesorPills() {
    const wrap = document.getElementById('wap-asesor-pills');
    if (!wrap) return;

    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    const fa      = _state.filtroAsesor;

    // Lista de asesores únicos con chats activos (solo admin)
    const asesores = isAdmin
        ? [...new Set(Object.values(_state.asignaciones).map(a => a.asesor).filter(Boolean))].sort()
        : [];

    const labelActual = fa === null ? 'Todos'
                      : fa === 'mio' ? 'Míos'
                      : fa;
    const isActive = fa !== null;

    wrap.innerHTML = `
        <button class="wap-asesor-btn${isActive ? ' wap-asesor-btn--active' : ''}" id="wap-asesor-btn">
            <span>${labelActual}</span>
            <span class="wap-asesor-btn-arrow">▾</span>
        </button>
        <div class="wap-asesor-dropdown" id="wap-asesor-dropdown">
            ${_aOpt(null,  'Todos', fa)}
            ${_aOpt('mio', 'Míos',  fa)}
            ${asesores.map(a => _aOpt(a, a, fa)).join('')}
        </div>
    `;

    const btn      = wrap.querySelector('#wap-asesor-btn');
    const dropdown = wrap.querySelector('#wap-asesor-dropdown');

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = dropdown.classList.toggle('open');
        btn.classList.toggle('wap-asesor-btn--open', open);
    });

    dropdown.querySelectorAll('.wap-asesor-opt').forEach(opt => {
        opt.addEventListener('click', e => {
            e.stopPropagation();
            const key = opt.dataset.fa || null;
            _state.filtroAsesor = (_state.filtroAsesor === key) ? null : key;
            dropdown.classList.remove('open');
            btn.classList.remove('wap-asesor-btn--open');
            _renderAsesorPills();
            _scheduleConteos();
            _renderList();
        });
    });
}

function _aOpt(key, label, fa) {
    const activo = fa === key ? ' wap-asesor-opt--active' : '';
    return `<button class="wap-asesor-opt${activo}" data-fa="${key ?? ''}">${label}</button>`;
}

// ── Render filtro asesor (solo admin) ─────────────────────────────────────
function _renderFiltroAsesor() {
    const el = document.getElementById('wap-filtro-asesor');
    if (!el) return;
    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
    if (!isAdmin) { el.style.display = 'none'; return; }

    el.style.display = '';
    const esMio = _state.filtroAsesor === 'mio';
    el.innerHTML = `<button class="wap-filtro wap-filtro--active" id="wap-btn-fa" style="--fc:#6b7280;">
        ${esMio ? 'Míos' : 'Todos'}
    </button>`;

    el.querySelector('#wap-btn-fa').addEventListener('click', () => {
        _state.filtroAsesor = _state.filtroAsesor === 'mio' ? null : 'mio';
        _scheduleConteos();
        _renderFiltros();
        _renderList();
    });
}

// ── Conteos locales (filtrados por sesión y asesor) ────────────────────────
// Calcula desde _state.conv + _state.asignaciones sin llamar al servidor,
// así los badges reflejan exactamente el filtro de sesiones activo.
function _computeConteos() {
    const asesorTarget = _state.filtroAsesor === 'mio' ? _asesorActual
                       : _state.filtroAsesor            ? _state.filtroAsesor
                       : null;
    const numeros = _state.filtroSesiones.size > 0
        ? _state.filtroSesiones
        : new Set(Object.keys(_state.conv));

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
    _conteoTimer = setTimeout(() => { _computeConteos(); _renderFiltros(); _renderAsesorPills(); }, 100);
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

    try {
        const res  = await fetch(`${HETZNER_URL}/wa/conversaciones/resueltas?${params}`);
        const data = res.ok ? await res.json() : [];
        r.items.push(...(Array.isArray(data) ? data : []));
        r.offset += data.length;
        r.done    = data.length < 20;
    } catch { /* sin conexión */ }

    r.loading = false;
    _renderResueltas();
}

function _renderResueltas() {
    const el = document.getElementById('wap-list');
    if (!el) return;
    const r = _state.resueltas;

    if (!r.items.length && !r.loading) {
        el.innerHTML = `<div class="wap-empty">No hay chats resueltos</div>`;
        return;
    }

    const html = r.items.map(c => {
        const color   = _getColor(c.numero);
        const display = c.nombre_cliente || c.nombre || _fmtPhone(c.contacto);
        const ts      = c.ultimo_ts ? _fmtTs(c.ultimo_ts) : '';
        const isActive = _state.activeContact === c.contacto && _state.activeNum === c.numero;
        return `<div class="wap-conv-item${isActive ? ' wap-conv-item--active' : ''}"
                    data-phone="${c.contacto}" data-num="${c.numero}"
                    style="border-left:4px solid ${color};position:relative;padding-right:12px;">
            <div class="wap-avatar" style="background:${color};color:${_textColorForBg(color)};">${_initials(display)}</div>
            <div class="wap-conv-body">
                <div class="wap-conv-top">
                    <span class="wap-conv-name">${_esc(display)}</span>
                    <span class="wap-conv-ts">${ts}</span>
                </div>
                <div class="wap-conv-bottom">
                    <span class="wap-conv-last">${_esc(c.ultimo_mensaje || '')}</span>
                    ${c.asesor ? `<span class="wap-estado wap-estado--resuelto" style="font-size:.9rem;padding:1px 5px;">${_esc(c.asesor)}</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    const sentinel = r.done ? '' : `<div id="wap-resueltas-sentinel" style="height:1px;"></div>`;
    const spinner  = r.loading ? `<div class="wap-empty" style="padding:10px;">Cargando...</div>` : '';
    el.innerHTML   = html + sentinel + spinner;

    // Listeners de click
    el.querySelectorAll('.wap-conv-item').forEach(item => {
        item.addEventListener('click', () => {
            const phone = item.dataset.phone;
            const num   = item.dataset.num;
            if (!_state.conv[num]) _state.conv[num] = {};
            if (!_state.conv[num][phone]) _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
            _openChat(num, phone);
        });
    });

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

            // Filtro asesor
            if (_state.filtroAsesor) {
                const target = _state.filtroAsesor === 'mio' ? _asesorActual : _state.filtroAsesor;
                if (asig?.asesor !== target) return false;
            }

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

        const estadoTag = isOffline
                ? `<span class="wap-offline-tag">Sesión caída</span>`
                : esLibre
                    ? `<span class="wap-estado-tag wap-estado--espera">En espera</span>`
                    : estado === 'resuelto'
                        ? `<span class="wap-estado-tag wap-estado--resuelto">Resuelto</span>`
                        : asig ? `<span class="wap-estado-tag wap-estado--mio">${_esc(asig.asesor)}</span>` : '';

        const tomarBtn = (esLibre && !isOffline)
            ? `<button class="wap-tomar-btn" data-num="${num}" data-phone="${phone}">TOMAR</button>`
            : '';

        return `<div class="wap-conv-item${esLibre && !isOffline ? ' wap-conv-item--libre' : ''}${isOffline ? ' wap-conv-item--offline' : ''}" data-phone="${phone}" data-num="${num}" style="border-left:4px solid ${color}; position:relative; padding-right:${esLibre && !isOffline ? '78px' : '12px'};">
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
    const liberarBtn   = document.getElementById('wap-liberar-btn');
    if (liberarBtn) liberarBtn.style.display = puedeResolver ? '' : 'none';

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
        const eb = document.getElementById('wap-edit-name-btn');
        if (eb) eb.style.display = '';
        const vb = document.getElementById('wap-vincular-lid-btn');
        if (vb) vb.style.display = phone.length > 12 ? '' : 'none';
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

    // Botón vincular: visible solo cuando el contacto es un @lid sin resolver (> 12 dígitos)
    const vincularBtn = document.getElementById('wap-vincular-lid-btn');
    if (vincularBtn) vincularBtn.style.display = phone.length > 12 ? '' : 'none';

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

function _showListView() {
    _editingMsgId = null;
    _cancelReply();
    document.getElementById('wap-chat').style.display                    = 'none';
    document.getElementById('wap-list').style.display                    = '';
    document.getElementById('wap-search-wrap').style.display             = '';
    document.querySelector('.wap-panel-header').style.display            = '';
    document.querySelector('.wap-filtros-wrap').style.display            = '';
    // sessions-wrap: solo restaurar si hay 2+ sesiones (renderSessions lo controla)
    if (_state.sesiones.length > 1) {
        document.getElementById('wap-sessions-wrap').style.display       = '';
    }
}

function _renderMsgs() {
    const el = document.getElementById('wap-msgs');
    if (!el) return;

    const c = _state.conv[_state.activeNum]?.[_state.activeContact];
    if (!c?.msgs.length) {
        el.innerHTML = `<p class="wap-empty" style="background:transparent;">Inicio de la conversacion</p>`;
        return;
    }
    el.innerHTML = c.msgs.map(m => {
        if (m.tipo === 'sistema') {
            return `<div class="wap-msg wap-msg--sistema">
                ${_esc(m.text)}${m.ts ? ' · ' + _fmtTs(m.ts) : ''}
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
                       <button class="wap-msg-dropdown-item" data-edit-msgid="${_esc(m.msgId)}">&#9998; Editar</button>
                       <button class="wap-msg-dropdown-item wap-msg-dropdown-item--danger" data-del-msgid="${_esc(m.msgId)}">&#x1F5D1; Eliminar</button>
                   </div>`
                : `<button class="wap-msg-reply-direct" ${replyAttrs} title="Responder">&#x21A9;</button>`
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
        return `<div class="wap-msg ${m.out ? 'wap-msg--out' : 'wap-msg--in'}${m.celular ? ' wap-msg--celular' : ''}${statusCls}">
            ${menuBtn}
            ${m.celular ? `<span class="wap-msg-celular-label">📱 Desde celular</span>` : (m.out && m.asesor ? `<span class="wap-msg-asesor">${_esc(m.asesor)}</span>` : '')}
            ${msgContent}
            ${isEditing ? '' : `<span class="wap-msg-ts">${m.pending || m.failed ? '' : (m.ts ? _fmtTs(m.ts) : '')}</span>${statusEl}`}
            ${reactionBadges}
        </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
}

function _updateOfflineBar() {
    const bar       = document.getElementById('wap-offline-bar');
    const resBar    = document.getElementById('wap-resuelto-bar');
    const esperaBar = document.getElementById('wap-espera-bar');
    const inputRow  = document.querySelector('.wap-input-row');
    const input     = document.getElementById('wap-input');
    const sendBtn   = document.getElementById('wap-send');
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
    if (esperaBar) esperaBar.classList.toggle('visible', enEspera && !offline);

    // Bloqueado (resuelto o en espera): ocultar input y atenuar mensajes
    if (inputRow) inputRow.style.display = bloqueado ? 'none' : '';
    if (msgs)     msgs.style.opacity     = bloqueado ? '0.6' : '';

    // Solo offline sin bloqueo: deshabilitar input
    if (!bloqueado) {
        if (input)   input.disabled   = offline;
        if (sendBtn) sendBtn.disabled = offline;
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
        // Actualizar localmente
        const c = _state.conv[num]?.[phone];
        if (c) {
            const m = c.msgs.find(x => x.msgId === msgId);
            if (m) m.text = texto;
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
    m.text = texto;
    _saveConv();
    if (_state.activeNum === numero && _state.activeContact === contacto) _renderMsgs();
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
    list.innerHTML = _state.respuestasRapidas.map(rr => `
        <div class="wap-rr-item" data-id="${rr.id}">
            <div class="wap-rr-item-body">
                <div class="wap-rr-item-titulo">${_esc(rr.titulo)}</div>
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
    const rr = id ? _state.respuestasRapidas.find(x => x.id === id) : null;
    form.style.display = '';
    form.innerHTML = `
        <input  id="wap-rr-titulo"  type="text"    placeholder="Título corto (ej: saludo)" maxlength="60" value="${_esc(rr?.titulo || '')}">
        <textarea id="wap-rr-texto" rows="3"       placeholder="Texto del mensaje...">${_esc(rr?.texto || '')}</textarea>
        <p class="wap-rr-vars-hint">Insertar: <code class="wap-rr-var" data-var="{nombreUsuario}">{nombreUsuario}</code><code class="wap-rr-var" data-var="{nombreAsesor}">{nombreAsesor}</code></p>
        <div class="wap-rr-form-btns">
            <button class="wap-btn-secondary" id="wap-rr-cancel">Cancelar</button>
            <button class="wap-btn-connect"   id="wap-rr-save" style="margin:0;font-size:1.1rem;padding:5px 14px;">${rr ? 'Guardar' : 'Crear'}</button>
        </div>`;
    form.querySelector('#wap-rr-cancel').addEventListener('click', () => {
        form.style.display = 'none';
        form.innerHTML = '';
    });
    form.querySelector('#wap-rr-save').addEventListener('click', () => _saveRR(id));
    form.querySelectorAll('.wap-rr-var').forEach(badge => {
        badge.addEventListener('click', () => {
            const ta    = form.querySelector('#wap-rr-texto');
            const start = ta.selectionStart;
            const end   = ta.selectionEnd;
            const v     = badge.dataset.var;
            ta.value    = ta.value.slice(0, start) + v + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + v.length;
            ta.focus();
        });
    });
    form.querySelector('#wap-rr-titulo').focus();
}

async function _saveRR(id) {
    const titulo = document.getElementById('wap-rr-titulo')?.value.trim();
    const texto  = document.getElementById('wap-rr-texto')?.value.trim();
    if (!titulo || !texto) { _showToast('Completa título y texto', 2500); return; }

    const method = id ? 'PUT' : 'POST';
    const url    = id
        ? `${HETZNER_URL}/wa/respuestas-rapidas/${id}`
        : `${HETZNER_URL}/wa/respuestas-rapidas`;

    try {
        const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo, texto }),
        });
        if (!r.ok) { _showToast('Error al guardar', 3000); return; }
        const saved = await r.json();
        if (id) {
            const idx = _state.respuestasRapidas.findIndex(x => x.id === id);
            if (idx !== -1) _state.respuestasRapidas[idx] = saved;
        } else {
            _state.respuestasRapidas.push(saved);
        }
        const form = document.getElementById('wap-rr-form');
        if (form) { form.style.display = 'none'; form.innerHTML = ''; }
        _renderRRView();
        _showToast(id ? 'Respuesta actualizada' : 'Respuesta creada');
    } catch { _showToast('Error de conexión', 3000); }
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
        rr.titulo.toLowerCase().includes(query) ||
        rr.texto.toLowerCase().includes(query)
    );

    if (!matches.length) { _hideSlashPicker(); return; }

    const picker = document.getElementById('wap-slash-picker');
    if (!picker) return;

    picker.innerHTML = matches.map((rr, i) => `
        <div class="wap-slash-item${i === 0 ? ' wap-slash-selected' : ''}" data-slash-idx="${i}" data-slash-id="${rr.id}">
            <span class="wap-slash-item-titulo">${_esc(rr.titulo)}</span>
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

function _applySlash(id) {
    const rr    = _state.respuestasRapidas.find(x => x.id === id);
    const input = document.getElementById('wap-input');
    if (!rr || !input) return;

    // Resolver variables
    const c            = _state.conv[_state.activeNum]?.[_state.activeContact];
    const nombreUsuario = c?.nombre || c?.name || _fmtPhone(_state.activeContact);
    const nombreAsesor  = _asesorActual || '';

    input.value = rr.texto
        .replace(/\{nombreUsuario\}/gi, nombreUsuario)
        .replace(/\{nombreAsesor\}/gi, nombreAsesor);
    _autoResizeTextarea(input);
    input.focus();
    _hideSlashPicker();
}

function _hideSlashPicker() {
    const picker = document.getElementById('wap-slash-picker');
    if (picker) { picker.classList.remove('visible'); picker.innerHTML = ''; }
    _slashIdx = -1;
}
