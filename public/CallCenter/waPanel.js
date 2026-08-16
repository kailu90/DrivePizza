/**
 * waPanel.js — WhatsApp Omnicanal Panel
 * Se inicializa con initWaPanel('wa-body', { rol }) desde callcenter-shell.html
 * Renderiza lista de conversaciones + chat inline dentro del panel lateral.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js';

// ── State en memoria (se pierde al recargar — Phase 1) ────────────────────
const SESSION_COLORS = ['#25D366', '#0088cc', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const _state = {
    sesiones:      [],    // [{ numero, sede, status, tieneQr }]
    conv:          {},    // { [numero]: { [phoneContact]: { msgs, unread, lastMsg, lastTs } } }
    activeNum:     null,  // sesión WA activa (pill seleccionada) — null = todas
    activeContact: null,  // conversación abierta
    filterText:    '',
    colorMap:      {},    // { [numero]: colorHex }
    customNames:   {},    // { [numero]: nombre personalizado }
    asignaciones:  {},    // { 'numero:contacto': { asesor, estado } }
    filtroEstado:  null,  // null | 'en_espera' | 'asignado' | 'resuelto'
    filtroAsesor:  null,  // null = todos | 'nombre' = solo ese asesor (admin)
    conteos:       { en_espera: 0, asignado: 0, resuelto: 0 }, // desde Supabase, compartido
};

// ── Helpers de estado ───────────────────────────────────────────────────────
function _getAsig(num, phone)   { return _state.asignaciones[`${num}:${phone}`]; }
function _getEstado(num, phone) { const a = _getAsig(num, phone); return a ? (a.estado || 'asignado') : 'en_espera'; }
function _esMio(num, phone)     { return _getAsig(num, phone)?.asesor === _asesorActual; }

let _editingNum = null;  // numero cuya card está en modo edición

const LS_KEY_META = 'wap_meta_v1';

function _loadMeta() {
    try {
        const raw = localStorage.getItem(LS_KEY_META);
        if (!raw) return;
        const { colorMap, customNames } = JSON.parse(raw);
        if (colorMap)    Object.assign(_state.colorMap,    colorMap);
        if (customNames) Object.assign(_state.customNames, customNames);
    } catch { /* ignorar */ }
}

function _saveMeta() {
    try {
        localStorage.setItem(LS_KEY_META, JSON.stringify({
            colorMap:    _state.colorMap,
            customNames: _state.customNames,
        }));
    } catch { /* ignorar */ }
}

function _sessionLabel(numero) {
    if (_state.customNames[numero]) return _state.customNames[numero];
    const s = _state.sesiones.find(x => x.numero === numero);
    return _capitalizarSede(s?.sede) || _fmtPhone(numero);
}

function _getColor(numero) {
    if (!_state.colorMap[numero]) {
        const used = new Set(Object.values(_state.colorMap));
        const pick = SESSION_COLORS.find(c => !used.has(c))
            || SESSION_COLORS[Object.keys(_state.colorMap).length % SESSION_COLORS.length];
        _state.colorMap[numero] = pick;
    }
    return _state.colorMap[numero];
}

let _rolUsuario   = '';
let _asesorActual = '';
let _ws           = null;
let _qrNumero     = null;   // numero cuyo QR modal esta abierto

const LS_KEY      = 'wap_conv_v2';
const MAX_MSGS    = 200;   // maximos mensajes guardados por conversacion

// ── API pública ────────────────────────────────────────────────────────────
export function initWaPanel(bodyId, { rol = '', asesor = '' } = {}) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    _rolUsuario   = rol;
    _asesorActual = asesor;
    _injectStyles();
    _loadMeta();          // restaurar colores y nombres personalizados
    _loadConv();          // restaurar historial desde localStorage
    _renderShell(body);
    _loadSessions();
    _loadAsignaciones();
    _loadConversaciones();
    _connectWs();
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

/* ── Sessions strip ──────────────────────────────── */
.wap-sessions {
    display: flex;
    gap: 6px;
    padding: 8px 10px 6px;
    overflow-x: auto;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(0,0,0,.08);
    scrollbar-width: none;
}
.wap-sessions::-webkit-scrollbar { display: none; }
.wap-sessions-empty {
    color: #999;
    font-size: 1.2rem;
    padding: 2px 0;
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
.wap-chat-via { display: none; }
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
                <p class="wap-qr-hint">Abre WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular dispositivo</p>
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
        const view = btn.dataset.view;
        document.querySelectorAll('#wap-nav .wap-nav-icon').forEach(b =>
            b.classList.toggle('wap-nav-icon--active', b.dataset.view === view));
        document.getElementById('wap-view-conv').classList.toggle('wap-view--hidden', view !== 'conv');
        document.getElementById('wap-view-ses').classList.toggle('wap-view--hidden', view !== 'ses');
        if (view === 'ses') _renderSesionesView();
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

// ── Load conversaciones desde Supabase (seed inicial compartido) ───────────
async function _loadConversaciones() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/conversaciones`);
        if (!r.ok) return;
        const convs = await r.json(); // [{ numero, contacto, nombre, ultimo_mensaje, ultimo_ts, asesor, estado }]
        if (!Array.isArray(convs) || !convs.length) return;

        let actualizado = false;
        for (const c of convs) {
            const { numero, contacto, nombre, ultimo_mensaje, ultimo_ts, asesor, estado } = c;
            if (!numero || !contacto) continue;

            if (!_state.conv[numero]) _state.conv[numero] = {};
            if (!_state.conv[numero][contacto]) {
                _state.conv[numero][contacto] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null };
                actualizado = true;
            }
            const conv = _state.conv[numero][contacto];
            // Actualizar metadata solo si Supabase tiene info más reciente
            if (!conv.customName && nombre) conv.name = nombre;
            if ((ultimo_ts || 0) > conv.lastTs) {
                conv.lastMsg = ultimo_mensaje || '';
                conv.lastTs  = ultimo_ts || 0;
                actualizado  = true;
            }
        }

        if (actualizado) {
            _saveConv();
            _renderList();
        }
    } catch { /* sin conexión — se queda con datos locales */ }
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
                if (!_state.conv[numero])        _state.conv[numero]        = {};
                if (!_state.conv[numero][phone])  _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null };
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
        } catch (err) { console.error('[waPanel WS parse error]', err, e.data); }
    };
    _ws.onclose = () => setTimeout(_connectWs, 5000);
}

// ── WS event handlers ──────────────────────────────────────────────────────
function _onMensaje({ numero, remitente, fromMe, pushName, texto, timestamp }) {
    // Descartar fuentes no válidas
    if (!remitente) return;
    if (remitente === 'status@broadcast') return;
    if (remitente.endsWith('@g.us')) return;

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
    c.msgs.push({ text: texto, ts: timestamp || Math.floor(Date.now() / 1000), out });
    c.lastMsg = texto;
    c.lastTs  = timestamp || Math.floor(Date.now() / 1000);

    const isActive = _state.activeContact === phone && _state.activeNum === numero;
    if (!isActive) c.unread++;

    _saveConv();
    _renderList();
    if (isNewConv && !fromMe) _scheduleConteos(); // nueva conv entrante → actualiza en_espera
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

    // Cerrar QR modal si el numero que estaba esperando QR ya se conecto
    if (status === 'conectado' && _qrNumero === numero) {
        _closeQr();
        const sede2 = _state.sesiones.find(s => s.numero === numero)?.sede;
        _showToast(`WhatsApp ${_capitalizarSede(sede2) || _fmtPhone(numero)} conectado`);
    }
}

function _onContacto({ numero, phone, name }) {
    if (!phone || !name) return;
    if (phone === 'status@broadcast') return;
    if (phone.endsWith('@g.us')) return;
    if (!_state.conv[numero])        _state.conv[numero]        = {};
    if (!_state.conv[numero][phone]) _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null };
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

function _onEstado({ numero, contacto, estado }) {
    const key = `${numero}:${contacto}`;
    if (_state.asignaciones[key]) _state.asignaciones[key].estado = estado;
    _renderList();
    _scheduleConteos();
}

function _onQr({ numero, sede, qr }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero);
    if (idx === -1) _state.sesiones.push({ numero, sede: sede || '', status: 'esperando_qr', tieneQr: true });
    else            { _state.sesiones[idx].status = 'esperando_qr'; _state.sesiones[idx].tieneQr = true; }
    _renderSessions();
    _showQr(numero, qr);
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
            const swatches = SESSION_COLORS.map(c =>
                `<button class="wap-color-swatch${c === color ? ' wap-color-swatch--active' : ''}"
                    data-color="${c}" style="background:${c};" title="${c}"></button>`
            ).join('');
            return `<div class="wap-ses-card wap-ses-card--editing" style="border-left:4px solid ${color};" data-num="${s.numero}">
                <div class="wap-ses-edit-form">
                    <label class="wap-ses-edit-label">Nombre</label>
                    <input class="wap-ses-edit-input" id="wap-edit-name-${s.numero}"
                        type="text" value="${_esc(label)}" placeholder="${_fmtPhone(s.numero)}">
                    <label class="wap-ses-edit-label">Color identificador</label>
                    <div class="wap-color-swatches" id="wap-swatches-${s.numero}">${swatches}</div>
                    <div class="wap-ses-edit-btns">
                        <button class="wap-ses-btn-cancel" data-num="${s.numero}">Cancelar</button>
                        <button class="wap-ses-btn-save" data-num="${s.numero}">Guardar</button>
                    </div>
                </div>
            </div>`;
        }

        // ── Card normal ──
        const status = s.status === 'conectado'    ? '<span class="wap-ses-badge wap-ses-badge--green">Conectado</span>'
                     : s.status === 'esperando_qr' ? '<span class="wap-ses-badge wap-ses-badge--yellow">Esperando QR</span>'
                     : '<span class="wap-ses-badge wap-ses-badge--red">Desconectado</span>';
        return `<div class="wap-ses-card" style="border-left:4px solid ${color};">
            <div class="wap-ses-card-dot" style="background:${color};"></div>
            <div class="wap-ses-card-info">
                <span class="wap-ses-card-name">${_esc(label)}</span>
                <span class="wap-ses-card-num">${_fmtPhone(s.numero)}</span>
                ${status}
            </div>
            <div class="wap-ses-card-actions">
                <button class="wap-ses-btn-edit" data-num="${s.numero}" title="Editar">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                ${isAdmin ? `<button class="wap-ses-btn-des" data-num="${s.numero}" title="Desconectar">Desconectar</button>` : ''}
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
    }

    // Listeners card edición
    el.querySelectorAll('.wap-ses-btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => { _editingNum = null; _renderSesionesView(); });
    });
    el.querySelectorAll('.wap-ses-btn-save').forEach(btn => {
        btn.addEventListener('click', () => {
            const num   = btn.dataset.num;
            const name  = document.getElementById(`wap-edit-name-${num}`)?.value.trim() || '';
            _state.customNames[num] = name || null;
            _saveMeta();
            _editingNum = null;
            _renderSesionesView();
            _renderSessions(); // actualizar pills
            _renderList();     // actualizar colores en lista
        });
    });

    // Listeners swatches de color
    el.querySelectorAll('.wap-color-swatches').forEach(wrap => {
        const num = wrap.id.replace('wap-swatches-', '');
        wrap.querySelectorAll('.wap-color-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                _state.colorMap[num] = sw.dataset.color;
                _saveMeta();
                wrap.querySelectorAll('.wap-color-swatch').forEach(s =>
                    s.classList.toggle('wap-color-swatch--active', s.dataset.color === sw.dataset.color));
                // Actualizar borde de la card en tiempo real
                const card = el.querySelector(`.wap-ses-card--editing[data-num="${num}"]`);
                if (card) card.style.borderLeftColor = sw.dataset.color;
            });
        });
    });
}

// ── Render sessions (pills strip) ──────────────────────────────────────────
function _renderSessions() {
    const el = document.getElementById('wap-sessions');
    if (!el) return;

    if (!_state.sesiones.length) {
        el.innerHTML = `<span class="wap-sessions-empty">Sin sesiones activas</span>`;
        return;
    }

    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);

    el.innerHTML = _state.sesiones.map(s => {
        const color   = _getColor(s.numero);
        const active  = s.numero === _state.activeNum ? ' wap-pill--active' : '';
        const dotCls  = s.status === 'conectado'    ? 'wap-dot--green'
                      : s.status === 'esperando_qr' ? 'wap-dot--yellow'
                      : 'wap-dot--red';
        const label      = _sessionLabel(s.numero);
        const activeStyle = s.numero === _state.activeNum
            ? `background:${color};border-color:${color};color:#fff;`
            : `border-color:${color};color:${color};`;
        return `<div class="wap-pill-wrap">
            <button class="wap-pill${active}" data-num="${s.numero}" style="${activeStyle}">
                <span class="wap-dot ${dotCls}"></span>
                <span>${label}</span>
            </button>
        </div>`;
    }).join('');

    el.querySelectorAll('.wap-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            _state.activeNum     = btn.dataset.num;
            _state.activeContact = null;
            _renderSessions();
            _renderList();
            _showListView();
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
        _renderFiltros();
        _renderList();
    });
}

// ── Conteos desde Supabase (badges compartidos) ────────────────────────────
let _conteoTimer = null;

async function _fetchConteos() {
    try {
        const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);
        const url = isAdmin
            ? `${HETZNER_URL}/wa/asignaciones/conteos`
            : `${HETZNER_URL}/wa/asignaciones/conteos?asesor=${encodeURIComponent(_asesorActual)}`;
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
        badge('en_espera', 'En espera', espera,  '#f59e0b') +
        badge('asignado',  'Asignado',  asignado, '#0088cc') +
        badge('resuelto',  'Resuelto',  resuelto, '#25D366');

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
        if (_state.activeNum && _state.activeNum !== num) continue;
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
        .sort((a, b) => b.data.lastTs - a.data.lastTs);

    if (!filtered.length) {
        el.innerHTML = `<p class="wap-empty">${_state.sesiones.length ? 'Sin conversaciones' : 'Sin sesiones activas'}</p>`;
        return;
    }

    el.innerHTML = filtered.map(({ num, phone, data }) => {
        const color   = _getColor(num);
        const estado  = _getEstado(num, phone);
        const asig    = _getAsig(num, phone);
        const esLibre = estado === 'en_espera';
        const esMio   = _esMio(num, phone);
        const unread  = data.unread ? `<span class="wap-badge">${data.unread}</span>` : '';
        const ts      = data.lastTs ? _fmtTs(data.lastTs) : '';
        const display = data.customName || data.name || _fmtPhone(phone);
        const hasName = !!(data.customName || data.name);
        const sub     = hasName ? `<span class="wap-conv-phone">${_fmtPhone(phone)}</span>` : '';

        const estadoTag = esLibre
            ? `<span class="wap-estado-tag wap-estado--espera">En espera</span>`
            : estado === 'resuelto'
                ? `<span class="wap-estado-tag wap-estado--resuelto">Resuelto</span>`
                : asig ? `<span class="wap-estado-tag wap-estado--mio">${_esc(asig.asesor)}</span>` : '';

        const tomarBtn = esLibre
            ? `<button class="wap-tomar-btn" data-num="${num}" data-phone="${phone}">TOMAR</button>`
            : '';

        return `<div class="wap-conv-item${esLibre ? ' wap-conv-item--libre' : ''}" data-phone="${phone}" data-num="${num}" style="border-left:4px solid ${color}; position:relative; padding-right:${esLibre ? '78px' : '12px'};">
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

    // Mostrar RESOLVER solo si el chat es mío y está asignado (no resuelto)
    const esMioAbierto = _esMio(_state.activeNum, phone) && _getEstado(_state.activeNum, phone) === 'asignado';
    const liberarBtn   = document.getElementById('wap-liberar-btn');
    if (liberarBtn) liberarBtn.style.display = esMioAbierto ? '' : 'none';

    document.getElementById('wap-list').style.display        = 'none';
    document.getElementById('wap-search-wrap').style.display = 'none';
    document.getElementById('wap-chat').style.display        = 'flex';

    // Mostrar msgs locales de inmediato, luego reemplazar con Supabase
    _renderMsgs();
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
            text:  m.texto,
            ts:    m.timestamp,
            out:   m.saliente,
            msgId: m.msg_id,
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
    el.innerHTML = c.msgs.map(m => `
        <div class="wap-msg ${m.out ? 'wap-msg--out' : 'wap-msg--in'}">
            <span class="wap-msg-text">${_esc(m.text)}</span>
            <span class="wap-msg-ts">${m.ts ? _fmtTs(m.ts) : ''}</span>
        </div>`).join('');
    el.scrollTop = el.scrollHeight;
}

async function _sendMessage() {
    const input = document.getElementById('wap-input');
    const texto = input?.value.trim();
    if (!texto || !_state.activeNum || !_state.activeContact) return;

    input.value = '';
    const num   = _state.activeNum;
    const phone = _state.activeContact;
    const ts    = Math.floor(Date.now() / 1000);

    // Optimistic update
    if (!_state.conv[num])          _state.conv[num]        = {};
    if (!_state.conv[num][phone])   _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0 };
    const c = _state.conv[num][phone];
    c.msgs.push({ text: texto, ts, out: true });
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
            body:    JSON.stringify({ numero: num, destinatario, texto }),
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
function _showQr(numero, qrData) {
    const modal = document.getElementById('wap-qr-modal');
    const imgEl = document.getElementById('wap-qr-img');
    if (!modal || !imgEl) return;

    _qrNumero = numero;
    document.getElementById('wap-qr-num').textContent = `Numero: ${_fmtPhone(numero)}`;
    if (qrData && qrData.startsWith('data:')) {
        imgEl.innerHTML = `<img src="${qrData}" alt="QR WhatsApp">`;
    } else if (qrData) {
        imgEl.innerHTML = `<img src="${qrData}" alt="QR WhatsApp">`;
    } else {
        imgEl.innerHTML = `<p style="font-size:1.1rem;color:#9ca3af;padding:20px;">⏳ Generando QR...<br>Espera un momento.</p>`;
    }
    modal.classList.add('active');

    // Abrir el panel si esta colapsado
    const panel = document.getElementById('wa-panel');
    if (panel && !panel.classList.contains('expanded')) {
        document.getElementById('wa-strip')?.click();
    }
}

function _closeQr() {
    document.getElementById('wap-qr-modal')?.classList.remove('active');
    _qrNumero = null;
}

// ── Desconectar sesión (admin) ─────────────────────────────────────────────
async function _desconectarSesion(numero) {
    if (!confirm(`¿Desconectar sesión ${_fmtPhone(numero)}?`)) return;
    try {
        await fetch(`${HETZNER_URL}/wa/sesiones/${encodeURIComponent(numero)}`, { method: 'DELETE' });

        // Limpiar toda la data de esta sesión en estado y localStorage
        delete _state.conv[numero];
        for (const key of Object.keys(_state.asignaciones)) {
            if (key.startsWith(`${numero}:`)) delete _state.asignaciones[key];
        }
        _saveConv();

        _state.sesiones = _state.sesiones.filter(s => s.numero !== numero);
        if (_state.activeNum === numero) {
            _state.activeNum     = _state.sesiones[0]?.numero || null;
            _state.activeContact = null;
            _showListView();
        }
        _renderSessions();
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
            // Mostrar modal de inmediato (QR llegará por WS o viene en la respuesta)
            _onQr({ numero, sede, qr: data.qr || null });
            // Polling fallback: si el WS no entrega el QR, lo buscamos en GET /wa/sesiones
            let _pollTries = 0;
            const _pollQr = setInterval(async () => {
                _pollTries++;
                if (_pollTries > 15 || !document.getElementById('wap-qr-modal')?.classList.contains('active')) {
                    clearInterval(_pollQr); return;
                }
                try {
                    const pr = await fetch(`${HETZNER_URL}/wa/sesiones`);
                    if (!pr.ok) return;
                    const sesiones = await pr.json();
                    const s = sesiones.find(s => s.numero === numero);
                    console.log('[waPanel poll]', s);
                    if (s?.qr) { clearInterval(_pollQr); _showQr(numero, s.qr); }
                } catch { /* ignore */ }
            }, 2000);
        } catch (e) {
            alert('Error al conectar: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Conectar';
        }
    });
}

// ── Persistencia localStorage ──────────────────────────────────────────────
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

function _loadConv() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        // Filtrar phones contaminados que pudieron guardarse en versiones anteriores
        for (const num of Object.keys(parsed)) {
            const convs = parsed[num];
            for (const phone of Object.keys(convs)) {
                if (phone === 'status@broadcast' || phone.endsWith('@g.us') || phone.includes('@')) {
                    delete convs[phone];
                }
            }
        }
        Object.assign(_state.conv, parsed);
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
