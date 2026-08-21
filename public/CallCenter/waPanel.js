/**
 * waPanel.js — WhatsApp Omnicanal Panel
 * Se inicializa con initWaPanel('wa-body', { rol }) desde callcenter-shell.html
 * Renderiza lista de conversaciones + chat inline dentro del panel lateral.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js';

// ── State en memoria (se pierde al recargar — Phase 1) ────────────────────
const SESSION_COLORS = ['#25D366', '#0088cc', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

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
    filtroSesiones:  new Set(), // Set<numero> vacío = todas las sesiones
    conteos:         { en_espera: 0, asignado: 0, resuelto: 0 }, // desde Supabase, compartido
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

let _rolUsuario   = '';
let _asesorActual = '';
let _ws           = null;
let _qrNumero     = null;   // numero cuyo QR modal esta abierto
let _waitingQrFor = null;   // numero que este cliente esta esperando escanear (solo quien lo genero)
let _qrStepTimers = [];     // timers de animación de pasos del modal QR

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
    background: #fff;
    border-radius: 10px;
    border-left: 4px solid #ccc;
    box-shadow: 0 1px 4px rgba(0,0,0,.07);
}
.wap-ses-card-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
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

/* ── Sessions colapsable ─────────────────────────── */
.wap-sessions-wrap {
    flex-shrink: 0;
    border-bottom: 1px solid rgba(0,0,0,.08);
}
.wap-sessions-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 7px 12px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.15rem;
    font-weight: 600;
    color: #374151;
    text-align: left;
}
.wap-sessions-toggle:hover { background: rgba(0,0,0,.04); }
.wap-sessions-toggle-label { flex: 1; }
.wap-sessions-toggle-badge {
    background: #e5e7eb;
    color: #6b7280;
    font-size: 1rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 1px 7px;
}
.wap-sessions-toggle-arrow {
    font-size: 1rem;
    color: #9ca3af;
    transition: transform .2s;
}
.wap-sessions-wrap.open .wap-sessions-toggle-arrow { transform: rotate(180deg); }
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
}
.wap-sessions-name { flex: 1; }
.wap-sessions-check {
    width: 14px; height: 14px;
    flex-shrink: 0;
    color: #374151;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 4px;
    flex-shrink: 0;
}
.wap-filtros-wrap .wap-filtros {
    padding: 0;
    flex: 1;
}

/* ── Filtro asesor (admin) ───────────────────────── */
.wap-filtro-asesor {
    display: inline-flex;
    gap: 6px;
}

/* ── Filtros de estado ───────────────────────────── */
.wap-filtros {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
}
.wap-filtro {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1.5px solid var(--color-cuaternario);
    background: var(--color-secundario);
    color: var(--color-primario);
    font-size: 1.15rem;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s, color .15s;
    white-space: nowrap;
}
.wap-filtro:hover {
    background: rgba(40,76,34,.08);
}
.wap-filtro--active {
    background: var(--color-primario);
    border-color: var(--color-primario);
    color: var(--color-secundario);
}
.wap-filtro-count {
    background: rgba(40,76,34,.15);
    border-radius: 10px;
    padding: 0 6px;
    font-size: 1.05rem;
    font-weight: 700;
}
.wap-filtro--active .wap-filtro-count {
    background: rgba(244,236,223,.25);
}

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
    border-radius: 14px;
    padding: 3px 10px;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s, color .15s;
}
.wap-resolver-btn {
    margin-left: auto;
    border: 1.5px solid #25D366;
    color: #16a34a;
}
.wap-resolver-btn:hover { background: #dcfce7; }
.wap-liberar-btn {
    border: 1.5px solid rgba(40,76,34,.35);
    color: var(--color-primario);
}
.wap-liberar-btn:hover { background: rgba(40,76,34,.08); }

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
    gap: 8px;
    padding: 10px 12px;
    background: #f4ecdf;
    color: var(--color-terciario);
    flex-shrink: 0;
    border-left: 4px solid transparent;
    border-bottom: 1px solid rgba(40,76,34,.12);
}
.wap-back {
    background: none;
    border: none;
    color: var(--color-primario);
    font-size: 1.8rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
}
.wap-chat-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.wap-chat-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.wap-chat-name {
    font-weight: 700;
    font-size: 1.4rem;
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
.wap-chat-via { font-size: 0.75rem; color: #6b7280; margin-top: 1px; }
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
}
.wap-msg--out {
    background: #d9fdd3;
    align-self: flex-end;
    border-radius: 10px 10px 0 10px;
}
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
.wap-resuelto-bar {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 8px 12px;
    background: #f0fdf4;
    border-top: 1px solid #bbf7d0;
    font-size: 1.1rem;
    color: #16a34a;
    flex-shrink: 0;
}
.wap-resuelto-bar.visible { display: flex; }
.wap-abrir-btn {
    background: #16a34a;
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
.wap-msg-text { color: var(--color-terciario); }
.wap-msg-ts {
    font-size: 1rem;
    color: #9ca3af;
    align-self: flex-end;
}
.wap-input-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background: #f0f0f0;
    flex-shrink: 0;
}
.wap-input-row input {
    flex: 1;
    padding: 8px 12px;
    border: none;
    border-radius: 20px;
    font-size: 1.3rem;
    background: #fff;
}
.wap-input-row input:focus { outline: none; }
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

                <button class="wap-nav-icon wap-nav-icon--active" data-view="conv" title="Conversaciones">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
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
                    <div class="wap-sessions-wrap" id="wap-sessions-wrap">
                        <button class="wap-sessions-toggle" id="wap-sessions-toggle" style="display:none;"></button>
                        <div class="wap-sessions" id="wap-sessions"></div>
                    </div>
                    <div class="wap-search" id="wap-search-wrap">
                        <input type="text" id="wap-search" placeholder="Buscar conversacion...">
                    </div>
                    <div class="wap-filtros-wrap">
                        <div class="wap-filtro-asesor" id="wap-filtro-asesor" style="display:none;"></div>
                        <div class="wap-filtros" id="wap-filtros"></div>
                    </div>
                    <div class="wap-list" id="wap-list">
                        <p class="wap-empty">Esperando mensajes...</p>
                    </div>
                    <div class="wap-chat" id="wap-chat">
                        <div class="wap-chat-header">
                            <button class="wap-back" id="wap-back">&#8592;</button>
                            <div class="wap-chat-info" id="wap-chat-info">
                                <div class="wap-chat-name-row">
                                    <span class="wap-chat-name" id="wap-chat-name"></span>
                                    <button class="wap-edit-name-btn" id="wap-edit-name-btn" title="Editar nombre">&#9998;</button>
                                </div>
                                <span class="wap-chat-via" id="wap-chat-via"></span>
                            </div>
                            <button class="wap-liberar-btn" id="wap-liberar-btn" title="Resolver y liberar a bandeja" style="display:none;">RESOLVER</button>
                        </div>
                        <div class="wap-msgs" id="wap-msgs"></div>
                        <div class="wap-offline-bar" id="wap-offline-bar">
                            ⚠️ Sesión desconectada — reconecta para responder
                        </div>
                        <div class="wap-resuelto-bar" id="wap-resuelto-bar">
                            <span>Chat resuelto — solo lectura</span>
                            <button class="wap-abrir-btn" id="wap-abrir-btn">Abrir</button>
                        </div>
                        <div class="wap-input-row">
                            <input type="text" id="wap-input" placeholder="Escribe un mensaje...">
                            <button id="wap-send">&#10148;</button>
                        </div>
                    </div>
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
    document.getElementById('wap-edit-name-btn').addEventListener('click', _editContactName);
    document.getElementById('wap-send').addEventListener('click', _sendMessage);
    document.getElementById('wap-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') _sendMessage();
    });
    // wap-qr-modal usa position:fixed;inset:0 pero #wa-panel tiene transform,
    // lo que lo convertiría en containing-block. Lo movemos al <body> para que
    // el overlay cubra todo el viewport correctamente.
    const qrModal = document.getElementById('wap-qr-modal');
    if (qrModal) document.body.appendChild(qrModal);

    document.getElementById('wap-qr-close').addEventListener('click', _closeQr);

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
            const { numero, contacto, nombre, ultimo_mensaje, ultimo_ts } = c;
            if (!numero || !contacto) continue;
            if (contacto.includes('@')) continue; // grupos, canales, listas — en Supabase los teléfonos válidos son números puros
            if (!ultimo_mensaje && !ultimo_ts) continue;

            if (!newConv[numero]) newConv[numero] = {};
            const prev = _state.conv[numero]?.[contacto] || {};
            newConv[numero][contacto] = {
                msgs:       prev.msgs?.length ? prev.msgs : [],
                unread:     prev.unread || 0,
                customName: prev.customName || null,
                name:       nombre || prev.name || null,
                lastMsg:    ultimo_mensaje || prev.lastMsg || '',
                lastTs:     ultimo_ts     || prev.lastTs  || 0,
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
                if (!c.customName && c.name !== name) {
                    c.name = name;
                    actualizado = true;
                }
            }
        }
        if (actualizado) { _saveConv(); _renderList(); }
    } catch { /* sin conexion */ }
}

// ── WebSocket ──────────────────────────────────────────────────────────────
function _connectWs() {
    _ws = new WebSocket(WS_URL);
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
            if (msg.tipo === 'wa:merge')      _onMerge(msg);
            if (msg.tipo === 'wa:config')     _onConfig(msg);
        } catch (err) { console.error('[waPanel WS parse error]', err, e.data); }
    };
    _ws.onclose = () => setTimeout(_connectWs, 5000);
}

// ── WS event handlers ──────────────────────────────────────────────────────
function _onMensaje({ numero, remitente, fromMe, pushName, texto, timestamp, asesor, desdeTelefono, tipoMensaje }) {
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
    if (isNewConv) _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null, jidSuffix: '@s.whatsapp.net' };

    const c   = _state.conv[numero][phone];
    c.jidSuffix = jidSuffix;  // actualizar siempre — puede cambiar entre sesiones
    const out = !!fromMe;
    // Actualizar nombre WA solo si el asesor no asigno uno manual
    if (pushName && !out && !c.customName) c.name = pushName;

    // Deduplicar: si es saliente y ya existe en state (optimista), solo actualizar asesor si falta
    if (out) {
        const existing = [...c.msgs].reverse().find(m => m.out && m.text === texto);
        if (existing) {
            if (!existing.asesor && asesor) { existing.asesor = asesor; _saveConv(); if (_state.activeContact === phone && _state.activeNum === numero) _renderMsgs(); }
            return;
        }
    }
    c.msgs.push({ text: texto, ts: timestamp || Math.floor(Date.now() / 1000), out, asesor: asesor || null, celular: !!desdeTelefono, tipo: tipoMensaje || 'mensaje' });
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
    _renderSesionesView(); // actualizar cards en vista Conexiones en tiempo real
    if (_state.activeNum === numero) _updateOfflineBar(); // actualizar banner si el chat activo es de esta sesión

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

function _onContacto({ numero, phone, name }) {
    if (!phone || !name) return;
    const _cSuffix = phone.split('@')[1] || '';
    if (_cSuffix !== 's.whatsapp.net' && _cSuffix !== 'lid') return;
    // Solo actualizar nombre si la conversación YA existe — no crear entradas vacías.
    // Sin este guard, miembros de grupos generan chats vacíos porque Baileys emite
    // contacts.upsert con su JID individual (@s.whatsapp.net) al procesar grupos.
    if (!_state.conv[numero]?.[phone]) return;
    const c = _state.conv[numero][phone];
    // Solo actualizar si el asesor no puso un nombre manual
    if (!c.customName) c.name = name;
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

function _onQr({ numero, sede, qr }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero);
    if (idx === -1) _state.sesiones.push({ numero, sede: sede || '', status: 'esperando_qr', tieneQr: true });
    else            { _state.sesiones[idx].status = 'esperando_qr'; _state.sesiones[idx].tieneQr = true; }
    _renderSessions();
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

// ── Render sessions (collapsible filter) ───────────────────────────────────
function _renderSessions() {
    const wrap   = document.getElementById('wap-sessions-wrap');
    const toggle = document.getElementById('wap-sessions-toggle');
    const el     = document.getElementById('wap-sessions');
    if (!wrap || !toggle || !el) return;

    // Solo mostrar si hay más de 1 sesión
    const sesiones = _state.sesiones;
    if (sesiones.length <= 1) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = '';

    // ── Toggle button label según selección ─────────────────────────
    const sel = _state.filtroSesiones;
    const connectedCount = sesiones.filter(s => s.status === 'conectado').length;
    let toggleDot = '';
    let toggleLabel = '';
    if (sel.size === 0) {
        toggleLabel = 'Todas las conexiones';
        toggleDot = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    } else if (sel.size === 1) {
        const num = [...sel][0];
        const c = _getColor(num);
        toggleLabel = _sessionLabel(num);
        toggleDot = `<span class="wap-sessions-active-dot" style="background:${c};"></span>`;
    } else {
        toggleLabel = `${sel.size} conexiones`;
        toggleDot = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;
    }

    toggle.style.display = '';
    toggle.innerHTML = `
        ${toggleDot}
        <span class="wap-sessions-toggle-label">${toggleLabel}</span>
        <span class="wap-sessions-toggle-badge">${connectedCount}/${sesiones.length}</span>
        <span class="wap-sessions-toggle-arrow">&#9660;</span>
    `;

    if (!toggle._hasListener) {
        toggle._hasListener = true;
        toggle.addEventListener('click', () => {
            wrap.classList.toggle('open');
        });
    }

    // ── Lista vertical con multi-selección ──────────────────────────
    const todasCls = sel.size === 0 ? ' wap-sessions-item--active' : '';

    el.innerHTML = `
        <button class="wap-sessions-item${todasCls}" data-num="">
            <span class="wap-sessions-status wap-sessions-status--green"></span>
            <span class="wap-sessions-name">Todas las conexiones</span>
        </button>
        ${sesiones.map(s => {
            const color     = _getColor(s.numero);
            const checked   = sel.has(s.numero);
            const activeCls = checked ? ' wap-sessions-item--active' : '';
            const statusCls = s.status === 'conectado'    ? 'wap-sessions-status--green'
                            : s.status === 'esperando_qr' ? 'wap-sessions-status--yellow'
                            : 'wap-sessions-status--red';
            const label     = _sessionLabel(s.numero);
            const checkIcon = checked
                ? `<svg class="wap-sessions-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : `<span class="wap-sessions-check"></span>`;
            return `<button class="wap-sessions-item${activeCls}" data-num="${s.numero}">
                <span class="wap-sessions-status ${statusCls}"></span>
                <span class="wap-sessions-color-bar" style="background:${color};"></span>
                <span class="wap-sessions-name">${label}</span>
                ${checkIcon}
            </button>`;
        }).join('')}
    `;

    el.querySelectorAll('.wap-sessions-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = btn.dataset.num;
            if (!num) {
                // "Todas" — limpiar filtro y cerrar
                sel.clear();
                wrap.classList.remove('open');
            } else if (sel.has(num)) {
                sel.delete(num);
            } else {
                sel.add(num);
            }
            _renderSessions();
            _renderList();
        });
    });
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

// ── Conteos desde Supabase (badges compartidos) ────────────────────────────
let _conteoTimer = null;

async function _fetchConteos() {
    try {
        const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
        // Admin en modo "Míos" filtra por su propio asesor, igual que un asesor regular
        const filtrarPorAsesor = !isAdmin || _state.filtroAsesor === 'mio';
        const url = filtrarPorAsesor
            ? `${HETZNER_URL}/wa/asignaciones/conteos?asesor=${encodeURIComponent(_asesorActual)}`
            : `${HETZNER_URL}/wa/asignaciones/conteos`;
        const r = await fetch(url);
        if (!r.ok) return;
        const data = await r.json();
        _state.conteos = {
            en_espera: data.en_espera ?? 0,
            asignado:  data.asignado  ?? 0,
            resuelto:  data.resuelto  ?? 0,
        };
        _renderFiltros();
        document.dispatchEvent(new CustomEvent('wa:conteos', { detail: { ..._state.conteos } }));
    } catch { /* sin conexión — mantiene conteos anteriores */ }
}

function _scheduleConteos() {
    clearTimeout(_conteoTimer);
    _conteoTimer = setTimeout(_fetchConteos, 500);
}

// ── Render filtros de estado ───────────────────────────────────────────────
function _renderFiltros() {
    _renderFiltroAsesor();
    const el = document.getElementById('wap-filtros');
    if (!el) return;

    const { en_espera: espera, asignado, resuelto } = _state.conteos;
    const f = _state.filtroEstado;
    const badge = (key, label, count, color) => {
        const activo = f === key ? ' wap-filtro--active' : '';
        return `<button class="wap-filtro${activo}" data-filtro="${key}" style="--fc:${color};">
            ${label} <span class="wap-filtro-count">${count}</span>
        </button>`;
    };

    el.innerHTML =
        badge('en_espera', 'En espera',   espera,   '#f59e0b') +
        badge('asignado',  'En atención', asignado, '#0088cc') +
        badge('resuelto',  'Resuelto',    resuelto, '#25D366');

    el.querySelectorAll('.wap-filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.filtro;
            _state.filtroEstado = (_state.filtroEstado === key) ? null : key;
            _renderFiltros();
            _renderList();
        });
    });
}

// ── Render conversation list ───────────────────────────────────────────────
function _renderList() {
    const el = document.getElementById('wap-list');
    if (!el) return;

    // Recopilar conversaciones de todas las sesiones (o solo la activa si está filtrada)
    const allConvs = [];
    for (const [num, convs] of Object.entries(_state.conv)) {
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

            // Filtro asesor (solo admin)
            if (_state.filtroAsesor === 'mio' && asig?.asesor !== _asesorActual) return false;

            // Filtro activo por badge
            if (_state.filtroEstado === 'en_espera') return estado === 'en_espera';
            if (_state.filtroEstado === 'asignado')  return estado === 'asignado' && (isAdmin || asig?.asesor === _asesorActual);
            if (_state.filtroEstado === 'resuelto')  return estado === 'resuelto' && (isAdmin || asig?.asesor === _asesorActual);

            // Sin filtro: mostrar en_espera + asignado a mí (no resueltos)
            if (estado === 'resuelto') return false;
            if (estado === 'en_espera') return true;
            if (estado === 'asignado' && (isAdmin || asig?.asesor === _asesorActual)) return true;
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
        const display = data.customName || data.name || _fmtPhone(phone);
        const hasName = !!(data.customName || data.name);
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
            <div class="wap-avatar" style="background:${color};">${_initials(display)}</div>
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

    document.getElementById('wap-list').style.display        = 'none';
    document.getElementById('wap-search-wrap').style.display = 'none';
    document.getElementById('wap-chat').style.display        = 'flex';

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
        const supabaseMsgs = msgs.map(m => ({
            text:   m.texto,
            ts:     m.timestamp,
            out:    m.saliente,
            msgId:  m.msg_id,
            asesor: m.asesor || null,
            celular: !!m.desde_telefono,
            tipo:   m.tipo || 'mensaje',
        }));

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
    const display = c?.customName || c?.name || _fmtPhone(phone);
    document.getElementById('wap-chat-name').textContent = display;

    // Sub-línea: estado + asesor asignado
    const asig  = _getAsig(_state.activeNum, phone);
    const viaEl = document.getElementById('wap-chat-via');
    if (viaEl) {
        if (asig?.asesor) {
            const label = asig.estado === 'resuelto' ? 'Resuelto' : 'En atención';
            viaEl.textContent = `${label} · ${asig.asesor}`;
        } else {
            viaEl.textContent = '';
        }
    }

    // Badge de color de la conexión en el borde izquierdo del header
    const color  = _getColor(_state.activeNum);
    const header = document.querySelector('.wap-chat-header');
    if (header) header.style.borderLeftColor = color;
}

function _editContactName() {
    const phone = _state.activeContact;
    const num   = _state.activeNum;
    if (!phone || !num) return;

    const c       = _state.conv[num]?.[phone];
    const current = c?.customName || c?.name || '';
    const nameEl  = document.getElementById('wap-chat-name');
    const editBtn = document.getElementById('wap-edit-name-btn');

    // Reemplazar el span por un input inline
    const input = document.createElement('input');
    input.className   = 'wap-name-input';
    input.value       = current;
    input.placeholder = _fmtPhone(phone);
    nameEl.replaceWith(input);
    editBtn.style.display = 'none';
    input.focus();
    input.select();

    function _guardar() {
        const nuevo = input.value.trim();
        if (_state.conv[num]?.[phone]) {
            _state.conv[num][phone].customName = nuevo || null;
            _saveConv();
        }
        // Restaurar span
        const span = document.createElement('span');
        span.className = 'wap-chat-name';
        span.id        = 'wap-chat-name';
        input.replaceWith(span);
        editBtn.style.display = '';
        _updateChatHeader(phone);
        _renderList();
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
    document.getElementById('wap-view-ses').classList.toggle('wap-view--hidden', view !== 'ses');
    if (view === 'ses') _renderSesionesView();
    if (view === 'conv') _renderList();
}

function _showListView() {
    document.getElementById('wap-list').style.display        = '';
    document.getElementById('wap-search-wrap').style.display = '';
    document.getElementById('wap-chat').style.display        = 'none';
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
        return `<div class="wap-msg ${m.out ? 'wap-msg--out' : 'wap-msg--in'}${m.celular ? ' wap-msg--celular' : ''}">
            ${m.celular ? `<span class="wap-msg-celular-label">📱 Desde celular</span>` : (m.out && m.asesor ? `<span class="wap-msg-asesor">${_esc(m.asesor)}</span>` : '')}
            <span class="wap-msg-text">${_esc(m.text)}</span>
            <span class="wap-msg-ts">${m.ts ? _fmtTs(m.ts) : ''}</span>
        </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
}

function _updateOfflineBar() {
    const bar       = document.getElementById('wap-offline-bar');
    const resBar    = document.getElementById('wap-resuelto-bar');
    const input     = document.getElementById('wap-input');
    const sendBtn   = document.getElementById('wap-send');
    if (!bar) return;
    const sesStatus  = _state.sesiones.find(s => s.numero === _state.activeNum)?.status;
    const offline    = sesStatus === 'desconectado' || sesStatus === 'reconectando';
    const resuelto   = _getEstado(_state.activeNum, _state.activeContact) === 'resuelto';
    const bloqueado  = offline || resuelto;
    bar.classList.toggle('visible', offline);
    if (resBar) resBar.classList.toggle('visible', !offline && resuelto);
    if (input)   input.disabled   = bloqueado;
    if (sendBtn) sendBtn.disabled = bloqueado;
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
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    const ts    = Math.floor(Date.now() / 1000);

    // Optimistic update
    if (!_state.conv[num])          _state.conv[num]        = {};
    if (!_state.conv[num][phone])   _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
    const c = _state.conv[num][phone];
    c.msgs.push({ text: texto, ts, out: true, asesor: _asesorActual });
    c.lastMsg = texto;
    c.lastTs  = ts;
    _saveConv();
    _renderMsgs();

    try {
        // Reconstruir JID completo para que Baileys enrute correctamente (@lid o @s.whatsapp.net)
        const destinatario = phone + (c?.jidSuffix || '@s.whatsapp.net');
        const r = await fetch(`${HETZNER_URL}/wa/mensajes`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, destinatario, texto, asesor: _asesorActual }),
        });
        if (!r.ok) {
            // Revertir mensaje optimista y avisar al asesor
            c.msgs.pop();
            c.lastMsg = c.msgs.at(-1)?.text || '';
            c.lastTs  = c.msgs.at(-1)?.ts  || 0;
            _saveConv();
            _renderMsgs();
            const err = await r.json().catch(() => ({}));
            _showToast(err.error?.includes('no disponible') ? '⚠️ Sesión desconectada — mensaje no enviado' : '⚠️ Error al enviar mensaje', 4000);
        }
    } catch { _showToast('⚠️ Sin conexión — mensaje no enviado', 4000); }
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
                if (phone.includes('@')) continue; // en localStorage los teléfonos válidos son números puros
                if (!c.msgs?.length && !c.lastMsg) continue;
                if (!_state.conv[num]) _state.conv[num] = {};
                // Solo msgs y customName — lista y metadata vienen de Supabase
                _state.conv[num][phone] = {
                    msgs:       c.msgs?.slice(-MAX_MSGS) || [],
                    unread:     0,
                    customName: c.customName || null,
                    name:       c.name || null,
                    lastMsg:    c.lastMsg || '',
                    lastTs:     c.lastTs  || 0,
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
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
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
