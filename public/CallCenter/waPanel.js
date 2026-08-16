/**
 * waPanel.js — WhatsApp Omnicanal Panel
 * Se inicializa con initWaPanel('wa-body', { rol }) desde pedidosCallCenter.html
 * Renderiza lista de conversaciones + chat inline dentro del panel lateral.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js';

// ── State en memoria (se pierde al recargar — Phase 1) ────────────────────
const _state = {
    sesiones:      [],    // [{ numero, sede, status, tieneQr }]
    conv:          {},    // { [numero]: { [phoneContact]: { msgs, unread, lastMsg, lastTs } } }
    activeNum:     null,  // sesión WA activa (pill seleccionada)
    activeContact: null,  // conversación abierta
    filterText:    '',
};

let _rolUsuario = '';
let _ws         = null;
let _qrNumero   = null;   // numero cuyo QR modal esta abierto

const LS_KEY      = 'wap_conv_v2';
const MAX_MSGS    = 200;   // maximos mensajes guardados por conversacion

// ── API pública ────────────────────────────────────────────────────────────
export function initWaPanel(bodyId, { rol = '' } = {}) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    _rolUsuario = rol;
    _injectStyles();
    _loadConv();          // restaurar historial desde localStorage
    _renderShell(body);
    _loadSessions();
    _connectWs();
}

// ── Styles ─────────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('wap-css')) return;
    const s = document.createElement('style');
    s.id = 'wap-css';
    s.textContent = `
/* ── Panel body override ─────────────────────────── */
#panel-wa .panel-body {
    overflow: hidden;
    padding: 0;
}

/* ── Root ────────────────────────────────────────── */
.wap-root {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-size: 1.3rem;
    background: var(--color-secundario);
}

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
    background: var(--color-primario);
    color: var(--color-secundario);
    border-color: var(--color-primario);
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
    background: var(--color-cuaternario);
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    transition: background .15s;
}
.wap-btn-connect:hover { background: var(--color-primario); }

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
    padding: 10px 12px;
    cursor: pointer;
    border-bottom: 1px solid rgba(0,0,0,.05);
    transition: background .12s;
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
    background: var(--color-primario);
    color: var(--color-secundario);
    flex-shrink: 0;
}
.wap-back {
    background: none;
    border: none;
    color: var(--color-secundario);
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
}
.wap-edit-name-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,.7);
    font-size: 1.3rem;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    transition: color .15s;
}
.wap-edit-name-btn:hover { color: #fff; }
.wap-name-input {
    background: rgba(255,255,255,.15);
    border: 1px solid rgba(255,255,255,.5);
    border-radius: 6px;
    color: #fff;
    font-size: 1.4rem;
    font-weight: 700;
    padding: 2px 8px;
    width: 160px;
}
.wap-name-input::placeholder { color: rgba(255,255,255,.5); }
.wap-name-input:focus { outline: none; background: rgba(255,255,255,.2); }
.wap-chat-via {
    font-size: 1.1rem;
    opacity: .75;
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
            <div class="wap-sessions" id="wap-sessions">
                <span class="wap-sessions-empty">Sin sesiones activas</span>
            </div>
            ${isAdmin ? `<button class="wap-btn-connect" id="wap-btn-connect">+ Conectar numero</button>` : ''}
            <div id="wap-connect-form" style="display:none;"></div>
            <div class="wap-search" id="wap-search-wrap">
                <input type="text" id="wap-search" placeholder="Buscar conversacion...">
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
                </div>
                <div class="wap-msgs" id="wap-msgs"></div>
                <div class="wap-input-row">
                    <input type="text" id="wap-input" placeholder="Escribe un mensaje...">
                    <button id="wap-send">&#10148;</button>
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
    document.getElementById('wap-edit-name-btn').addEventListener('click', _editContactName);
    document.getElementById('wap-send').addEventListener('click', _sendMessage);
    document.getElementById('wap-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') _sendMessage();
    });
    document.getElementById('wap-qr-close').addEventListener('click', _closeQr);

    if (isAdmin) {
        document.getElementById('wap-btn-connect').addEventListener('click', _toggleConnectForm);
    }
}

// ── Load sessions ──────────────────────────────────────────────────────────
async function _loadSessions() {
    try {
        const r = await fetch(`${HETZNER_URL}/wa/sesiones`);
        if (!r.ok) return;
        const data = await r.json();
        _state.sesiones = data;
        if (data.length && !_state.activeNum) {
            _state.activeNum = data[0].numero;
        }
        _renderSessions();
        _renderList();   // pintar historial guardado al cargar
        _loadContactos(); // cargar nombres ya conocidos por el servidor
    } catch { /* sin conexion al backend */ }
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
            if (msg.tipo === 'wa:mensaje')  _onMensaje(msg);
            if (msg.tipo === 'wa:status')   _onStatus(msg);
            if (msg.tipo === 'wa:qr')       _onQr(msg);
            if (msg.tipo === 'wa:contacto') _onContacto(msg);
        } catch { /* parse error */ }
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
    if (!_state.conv[numero][phone]) _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, name: null, customName: null, jidSuffix: '@s.whatsapp.net' };

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
    if (!_state.activeNum && _state.sesiones.length) _state.activeNum = _state.sesiones[0].numero;
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

function _onQr({ numero, sede, qr }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero);
    if (idx === -1) _state.sesiones.push({ numero, sede: sede || '', status: 'esperando_qr', tieneQr: true });
    else            { _state.sesiones[idx].status = 'esperando_qr'; _state.sesiones[idx].tieneQr = true; }
    _renderSessions();
    _showQr(numero, qr);
}

// ── Render sessions ────────────────────────────────────────────────────────
function _renderSessions() {
    const el = document.getElementById('wap-sessions');
    if (!el) return;

    if (!_state.sesiones.length) {
        el.innerHTML = `<span class="wap-sessions-empty">Sin sesiones activas</span>`;
        return;
    }

    const isAdmin = ['admin', 'callcenter-admin'].includes(_rolUsuario);

    el.innerHTML = _state.sesiones.map(s => {
        const active  = s.numero === _state.activeNum ? ' wap-pill--active' : '';
        const dotCls  = s.status === 'conectado'    ? 'wap-dot--green'
                      : s.status === 'esperando_qr' ? 'wap-dot--yellow'
                      : 'wap-dot--red';
        const label      = _capitalizarSede(s.sede) || _fmtPhone(s.numero);
        const btnDescon  = isAdmin
            ? `<button class="wap-pill-descon" data-num="${s.numero}" title="Desconectar">&#10005;</button>`
            : '';
        return `<div class="wap-pill-wrap">
            <button class="wap-pill${active}" data-num="${s.numero}">
                <span class="wap-dot ${dotCls}"></span>
                <span>${label}</span>
            </button>${btnDescon}
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

    if (isAdmin) {
        el.querySelectorAll('.wap-pill-descon').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                _desconectarSesion(btn.dataset.num);
            });
        });
    }
}

// ── Render conversation list ───────────────────────────────────────────────
function _renderList() {
    const el = document.getElementById('wap-list');
    if (!el) return;

    const num  = _state.activeNum;
    const convs = num && _state.conv[num] ? Object.entries(_state.conv[num]) : [];

    const filtered = convs
        .filter(([phone]) => !_state.filterText || phone.includes(_state.filterText))
        .sort(([, a], [, b]) => b.lastTs - a.lastTs);

    if (!filtered.length) {
        el.innerHTML = `<p class="wap-empty">${num ? 'Sin conversaciones' : 'Selecciona una sesion'}</p>`;
        return;
    }

    el.innerHTML = filtered.map(([phone, data]) => {
        const badge   = data.unread ? `<span class="wap-badge">${data.unread}</span>` : '';
        const ts      = data.lastTs ? _fmtTs(data.lastTs) : '';
        const display = data.customName || data.name || _fmtPhone(phone);
        const hasName = !!(data.customName || data.name);
        const sub     = hasName ? `<span class="wap-conv-phone">${_fmtPhone(phone)}</span>` : '';
        return `<div class="wap-conv-item" data-phone="${phone}">
            <div class="wap-avatar">${_initials(display)}</div>
            <div class="wap-conv-info">
                <div class="wap-conv-row">
                    <span class="wap-conv-name">${_esc(display)}</span>
                    <span class="wap-conv-ts">${ts}</span>
                </div>
                <div class="wap-conv-row">
                    <span class="wap-conv-last">${sub || _esc(data.lastMsg)}</span>
                    ${badge}
                </div>
            </div>
        </div>`;
    }).join('');

    el.querySelectorAll('.wap-conv-item').forEach(item => {
        item.addEventListener('click', () => _openChat(item.dataset.phone));
    });
}

// ── Chat view ──────────────────────────────────────────────────────────────
function _openChat(phone) {
    _state.activeContact = phone;
    const c = _state.conv[_state.activeNum]?.[phone];
    if (c) c.unread = 0;

    _updateChatHeader(phone);

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
    const sesion  = _state.sesiones.find(s => s.numero === _state.activeNum);
    const display = c?.customName || c?.name || _fmtPhone(phone);
    const hasName = !!(c?.customName || c?.name);
    document.getElementById('wap-chat-name').textContent = display;
    document.getElementById('wap-chat-via').textContent  =
        (hasName ? _fmtPhone(phone) + ' · ' : '') +
        (sesion ? `via ${_capitalizarSede(sesion.sede) || _fmtPhone(sesion.numero)}` : '');
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
        await fetch(`${HETZNER_URL}/wa/mensajes`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: num, destinatario, texto }),
        });
    } catch { /* error de red — mensaje ya visible optimistamente */ }
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
    } else {
        imgEl.innerHTML = `<p style="font-size:1.1rem;color:#9ca3af;padding:20px;">QR no disponible<br>Revisa la consola del servidor.</p>`;
    }
    modal.classList.add('active');

    // Abrir el panel si esta colapsado
    const panel = document.getElementById('panel-wa');
    if (panel?.classList.contains('collapsed')) {
        document.getElementById('strip-wa')?.click();
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
        _state.sesiones = _state.sesiones.filter(s => s.numero !== numero);
        if (_state.activeNum === numero) {
            _state.activeNum     = _state.sesiones[0]?.numero || null;
            _state.activeContact = null;
            _showListView();
        }
        _renderSessions();
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
            if (!r.ok) throw new Error((await r.json()).error || 'Error');
            wrap.style.display = 'none';
            wrap.innerHTML = '';
            // El QR llegara por WS automaticamente
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
    const strip = document.getElementById('strip-wa');
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
