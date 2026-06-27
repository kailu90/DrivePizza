/**
 * pbxPanel.js — UI del softphone (estilo lista de llamadas WhatsApp)
 *
 * Uso:
 *   import { initPbxPanel } from './pbxPanel.js';
 *   const pbx = initPbxPanel('pbx-body');
 *   pbx.update(state, { extension, callerNumber, username, sede, direction });
 *
 * Estados: 'registered' | 'ringing' | 'incall' | 'offline'
 * direction: 'incoming' | 'outgoing'  (default 'incoming')
 */

import { PBX_URL as API_BASE, WS_URL } from '../Api/config.js'

const SEDE_LABELS = {
    cabecera:    'Cabecera',
    cañaveral:   'Cañaveral',
    acropolis:   'Acrópolis',
    piedecuesta: 'Piedecuesta',
    megamall:    'Megamall',
    unico:       'Único',
};

const IVR_SEDE = {
    '801': 'Cabecera', '802': 'Cañaveral', '803': 'Acrópolis',
    '804': 'Piedecuesta', '805': 'Megamall', '806': 'Único',
};

const STATUS_MAP = {
    registered: { label: 'Disponible',   dot: '#22c55e' },
    ringing:    { label: 'Entrante',     dot: '#f59e0b' },
    incall:     { label: 'En llamada',   dot: '#3b82f6' },
    offline:    { label: 'Desconectado', dot: '#94a3b8' },
};

export function initPbxPanel(containerId = 'pbx-body') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = `
        <div class="pbx-screen">
            <!-- Historial de llamadas -->
            <div class="pbx-history-list" id="pbx-history">
                <p class="pbx-history-empty">Sin llamadas recientes</p>
            </div>
        </div>`;

    // ── Estado interno ──────────────────────────────────────────────
    let currentCall    = null;   // { number, sede, direction, time }
    let _pendingSede   = null;   // { numero, sede } recibido por WS antes de que suene
    const LS_LOG       = 'pbx_calls_log';
    const callHistory  = (() => { try { return JSON.parse(localStorage.getItem(LS_LOG) || '[]'); } catch { return []; } })();
    let currentExt      = null;   // extensión SIP del agente
    let currentUsername = null;   // nombre del asesor
    let sipRegistered   = false;  // ¿SIP registrado?

    // ── Helpers ─────────────────────────────────────────────────────
    function fmtDuration(secs) {
        if (!secs) return '0:00';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        return `${m}:${String(s).padStart(2,'0')}`;
    }

    function fmtTime(ts) {
        return new Date(ts).toLocaleTimeString('es-CO', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'America/Bogota'
        });
    }

    /** Devuelve hasta 2 iniciales si no es un número de teléfono, o null. */
    function getInitials(str) {
        if (!str || str === '—') return null;
        const clean = str.replace(/[\s\-\+\(\)]/g, '');
        if (/^\d+$/.test(clean)) return null;
        return str.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    /** SVG silueta de persona */
    const SILHOUETTE = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
        viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12z"/>
        <path d="M12 14.4c-3.2 0-9.6 1.6-9.6 4.8V21.6h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>`;

    /** Renderiza el círculo avatar (iniciales o silueta) */
    function avatarHtml(label, size = 46) {
        const initials = getInitials(label);
        if (initials) {
            return `<div class="pbx-avatar pbx-avatar--initials" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.33)}px;">${initials}</div>`;
        }
        return `<div class="pbx-avatar" style="width:${size}px;height:${size}px;">${SILHOUETTE}</div>`;
    }

    /** Flecha dirección (abajo-izquierda = entrante, arriba-derecha = saliente) */
    function arrowSvg(direction, size = 13) {
        if (direction === 'outgoing') {
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="3"
                stroke-linecap="round" stroke-linejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"/>
                <polyline points="7 7 17 7 17 17"/>
            </svg>`;
        }
        // incoming: arrow down-left
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="3"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="17" y1="7" x2="7" y2="17"/>
            <polyline points="17 17 7 17 7 7"/>
        </svg>`;
    }

    /** Icono teléfono */
    function phoneSvg(size = 18) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
            viewBox="0 0 24 24" fill="currentColor">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 5.49 5.49l.98-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
        </svg>`;
    }

    /** Icono colgar (teléfono tachado) */
    const HANGUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6M23 1 1 23"/>
    </svg>`;

    // ── Dot del header ───────────────────────────────────────────────
    function updateDot(cls) {
        const dot = document.getElementById('sip-dot-hdr');
        if (!dot) return;
        dot.style.display = 'block';
        dot.className = cls; // reutiliza clases CSS existentes del dot
    }

    async function loadCallsFromServer(ext) {
        try {
            const r = await fetch(`${API_BASE}/pbx/calls/recent`);
            if (!r.ok) return;
            const rows = await r.json();
            // Reemplazar historial completamente con datos del servidor (fuente de verdad)
            callHistory.length = 0;
            rows.forEach(c => {
                callHistory.push({
                    serverId:  c.id,
                    number:    c.numero_cliente || '—',
                    direction: c.direccion === 'entrante' ? 'incoming' : 'outgoing',
                    duration:  c.duracion_seg || 0,
                    missed:    c.estado === 'perdida',
                    estado:    c.estado,
                    username:  c.username || null,
                    extension: c.extension || null,
                    sede:      c.sede || null,
                    time:      new Date(c.hora_inicio).getTime(),
                });
            });
            callHistory.sort((a, b) => b.time - a.time);
            try { localStorage.removeItem(LS_LOG); } catch {}

            renderActiveCalls();
            renderHistory();
        } catch { /* sin red */ }
    }

    // Guarda el último state/data para re-renderizar el badge
    let _lastState = 'offline';
    let _lastData  = {};

    // ── Estado en el header del panel ───────────────────────────────
    function updateStatusBar(state, data) {
        _lastState = state;
        _lastData  = data || {};

        const name  = document.getElementById('pbx-agent-name');
        const ext   = document.getElementById('pbx-agent-ext');
        const badge = document.getElementById('pbx-hdr-badge');
        if (name) name.textContent = data?.username || 'Softphone';
        if (ext)  ext.textContent  = data?.extension ? `Ext. ${data.extension}` : '';
        if (!badge) return;

        if (state === 'ringing') {
            badge.textContent = 'Entrante';
            badge.className   = 'pbx-hdr-badge pbx-hdr-badge--ringing';
            badge.disabled    = true;
            updateDot('ringing');

        } else if (state === 'incall') {
            badge.textContent = 'En llamada';
            badge.className   = 'pbx-hdr-badge pbx-hdr-badge--incall';
            badge.disabled    = true;
            updateDot('incall');

        } else if (state === 'registered') {
            badge.textContent = 'Disponible';
            badge.className   = 'pbx-hdr-badge pbx-hdr-badge--registered';
            badge.disabled    = true;
            updateDot('registered');
        } else {
            badge.textContent = 'Desconectado';
            badge.className   = 'pbx-hdr-badge pbx-hdr-badge--offline';
            badge.disabled    = true;
            updateDot('offline');
        }
    }

    // ── Tarjeta llamada en vivo ──────────────────────────────────────
    function renderLive(call, state) {
        const live = document.getElementById('pbx-live');
        if (!call || !live) { if (live) live.innerHTML = ''; return; }

        const isRinging = state === 'ringing';
        const dir       = call.direction || 'incoming';
        const dirCls    = dir === 'outgoing' ? 'pbx-arrow--out' : 'pbx-arrow--in';
        const sedeLabel = call.sede ? (IVR_SEDE[call.sede] || call.sede) : (isRinging ? (dir === 'outgoing' ? 'Saliente' : 'Entrante') : 'En llamada');

        live.innerHTML = `
            <div class="pbx-ccard pbx-ccard--${isRinging ? 'ringing' : 'active'}">
                ${avatarHtml(call.number)}
                <div class="pbx-ccard__body">
                    <span class="pbx-ccard__name">${call.number || '—'}</span>
                    <span class="pbx-ccard__sub">
                        <span class="pbx-ccard__arrow ${dirCls}">${arrowSvg(dir)}</span>
                        ${sedeLabel}
                    </span>
                </div>
                <div class="pbx-ccard__meta">
                    <span class="pbx-ccard__time">${fmtTime(call.time)}</span>
                    <span class="pbx-ccard__dur" id="pbx-live-dur" ${!isRinging ? `data-hora-inicio="${call.time}"` : ''}>0:00</span>
                </div>
                <div class="pbx-ccard__btns">
                    ${isRinging ? `
                        <button class="pbx-ccard__btn pbx-ccard__btn--decline" id="pbx-btn-decline" title="Rechazar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="3"
                                stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                        <button class="pbx-ccard__btn pbx-ccard__btn--answer" id="pbx-btn-answer" title="Contestar">
                            ${phoneSvg(16)}
                        </button>
                    ` : `
                        <button class="pbx-ccard__btn pbx-ccard__btn--hangup" id="pbx-btn-hangup" title="Colgar">
                            ${HANGUP_SVG}
                        </button>
                    `}
                </div>
            </div>`;

        // Bind botones
        document.getElementById('pbx-btn-answer')?.addEventListener('click', () =>
            window.parent.postMessage({ type: 'sip-answer' }, '*'));

        document.getElementById('pbx-btn-decline')?.addEventListener('click', () => {
            if (currentCall) addToHistory({ ...currentCall, duration: 0 });
            currentCall = null;
            window.parent.postMessage({ type: 'sip-decline' }, '*');
        });

        document.getElementById('pbx-btn-hangup')?.addEventListener('click', () => {
            const secs = stopTimer();
            if (currentCall) addToHistory({ ...currentCall, duration: secs });
            currentCall = null;
            document.getElementById('pbx-live').innerHTML = '';
            window.parent.postMessage({ type: 'sip-hangup' }, '*');
        });
    }

    // ── Fecha estilo WhatsApp ─────────────────────────────────────────
    function getDateLabel(ts) {
        if (!ts) return null;
        const opts      = { timeZone: 'America/Bogota' };
        const dStr      = new Date(ts).toLocaleDateString('es-CO', opts);
        const today     = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (dStr === today.toLocaleDateString('es-CO', opts))     return 'Hoy';
        if (dStr === yesterday.toLocaleDateString('es-CO', opts)) return 'Ayer';
        return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' });
    }

    // ── Llamadas en curso — solo para pbx.html (en pedidosCallCenter el strip ya las muestra)
    function renderActiveCalls() {
        const section = document.getElementById('pbx-active-calls');
        if (!section) return;
        section.style.display = 'none';
        section.innerHTML = '';
    }

    // ── Timer global para llamadas en curso ──────────────────────────
    setInterval(() => {
        document.querySelectorAll('[data-hora-inicio]').forEach(el => {
            const inicio = parseInt(el.dataset.horaInicio, 10);
            if (!isNaN(inicio)) el.textContent = fmtDuration(Math.floor((Date.now() - inicio) / 1000));
        });
    }, 1000);

    // ── Historial ────────────────────────────────────────────────────
    function addToHistory(entry) {
        // No agregar entrada local — el servidor la enviará vía WS pbx:llamada con datos reales
        // Solo re-renderizar para reflejar el fin de la llamada activa
        renderHistory();
    }

    function addEvent(type) {
        addToHistory({ _event: type, time: new Date() });
    }

    function renderHistory() {
        const wrap = document.getElementById('pbx-history');
        if (!wrap) return;

        const all = [...callHistory].sort((a, b) => b.time - a.time).slice(0, 50);

        if (!all.length) {
            wrap.innerHTML = '<p class="pbx-history-empty">Sin actividad reciente</p>';
            return;
        }
        let lastLabel = null;
        wrap.innerHTML = all.map(entry => {
            const label  = getDateLabel(entry.time);
            const header = label && label !== lastLabel
                ? `<div class="pbx-date-sep"><span>${label}</span></div>`
                : '';
            if (label) lastLabel = label;

            // Entrada de evento (conectar / desconectar)
            if (entry._event) {
                const isConnect = entry._event === 'connect';
                const who = entry.username || 'Asesor';
                return header + `
                    <div class="pbx-log-event pbx-log-event--${entry._event}">
                        <span class="pbx-log-event__dot"></span>
                        <span class="pbx-log-event__text">
                            <strong>${who}</strong> ${isConnect ? 'se conectó' : 'se desconectó'}
                        </span>
                        <span class="pbx-log-event__time">${fmtTime(entry.time)}</span>
                    </div>`;
            }
            // Entrada de llamada
            const dir        = entry.direction || 'incoming';
            const dirCls     = dir === 'outgoing' ? 'pbx-arrow--out' : 'pbx-arrow--in';
            const asesLabel  = entry.username || (dir === 'outgoing' ? 'Saliente' : 'Entrante');
            const sedeLabel  = entry.sede ? (IVR_SEDE[entry.sede] || null) : null;
            const estado     = entry.estado || (entry.missed ? 'perdida' : 'contestada');
            const isEnCurso  = estado === 'en_curso';
            const elapsed    = isEnCurso ? Math.floor((Date.now() - entry.time) / 1000) : entry.duration;
            const durAttr    = isEnCurso ? `data-hora-inicio="${entry.time}"` : '';
            const badgeLabel = { en_curso: 'En curso', contestada: 'Contestada', perdida: 'Perdida' }[estado] || estado;
            return header + `
                <div class="pbx-ccard">
                    ${avatarHtml(entry.number)}
                    <div class="pbx-ccard__body">
                        <span class="pbx-ccard__name">${entry.number || '—'}${sedeLabel ? `<span style="font-size:10px;background:rgba(40,76,34,0.1);color:var(--color-primario);padding:2px 6px;border-radius:10px;margin-left:6px;font-weight:500;vertical-align:middle;">${sedeLabel}</span>` : ''}</span>
                        <span class="pbx-ccard__sub">
                            <span class="pbx-ccard__arrow ${dirCls}">${arrowSvg(dir)}</span>
                            ${asesLabel}
                        </span>
                    </div>
                    <div class="pbx-ccard__meta">
                        <span class="pbx-status-badge pbx-status-badge--${estado}">${badgeLabel}</span>
                        <span class="pbx-ccard__dur" ${durAttr}>${fmtDuration(elapsed)}</span>
                    </div>
                </div>`;
        }).join('');
    }

    // ── API pública ──────────────────────────────────────────────────
    function update(state, data = {}) {
        const ext = data?.extension;

        // Al registrar por primera vez: cargar historial de llamadas
        if (state === 'registered' && ext && ext !== currentExt) {
            currentExt      = ext;
            currentUsername = data?.username || null;
            loadCallsFromServer(ext);
        }

        sipRegistered = (state === 'registered' || state === 'ringing' || state === 'incall');
        updateStatusBar(state, data);

        if (state === 'ringing' || state === 'incall') {
            if (!currentCall) {
                const num = data.callerNumber || data.remoteUser || '—';
                const sedeFromPending = (_pendingSede?.numero === num) ? _pendingSede.sede : '';
                currentCall = {
                    number:    num,
                    sede:      data.sede || sedeFromPending || '',
                    direction: data.direction || 'incoming',
                    time:      Date.now(),
                };
            }
        } else {
            // registered / offline — llamada terminó
            const hadCall = !!currentCall;
            currentCall = null;
            if (hadCall) {
                callHistory.forEach(e => { if (e.estado === 'en_curso') e.estado = 'contestada'; });
                renderHistory();
                setTimeout(() => loadCallsFromServer(currentExt), 1500);
            }
        }
    }

    // ── WebSocket — actualizar historial en tiempo real ──────────────
    let _wsFirstOpen = true;
    function conectarWs() {
        const ws = new WebSocket(WS_URL);
        ws.onopen = () => {
            if (_wsFirstOpen) { _wsFirstOpen = false; return; }
            // Reconexión: recargar por si se perdió algún evento
            loadCallsFromServer(currentExt);
        };
        ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                const { tipo } = msg;
                if (tipo === 'pbx:llamada' || tipo === 'pbx:sesion') {
                    loadCallsFromServer(currentExt);
                    setTimeout(() => loadCallsFromServer(currentExt), 1000);
                }
                if (tipo === 'pbx:sede' && msg.numero && msg.sede) {
                    _pendingSede = { numero: msg.numero, sede: msg.sede };
                    // Si ya hay llamada activa con ese número → aplicar sede inmediatamente
                    if (currentCall && currentCall.number === msg.numero) {
                        currentCall.sede = msg.sede;
                        renderLive(currentCall, _lastState);
                    }
                }
            } catch {}
        };
        ws.onclose = () => setTimeout(conectarWs, 5000);
    }
    conectarWs();

    // Cargar historial del servidor al arrancar (sin esperar al registro SIP)
    loadCallsFromServer(null);

    renderHistory();
    return { update };
}
