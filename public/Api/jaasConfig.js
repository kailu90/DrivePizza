import { plantaDB } from './firebaseConfig.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = plantaDB.db;

let _config = null;

async function obtenerConfig() {
    if (_config) return _config;
    const snap = await getDoc(doc(db, 'Config', 'jaas'));
    if (!snap.exists()) throw new Error('JaaS config no encontrada en Firestore.');
    _config = snap.data();
    return _config;
}

function base64url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlBuffer(buffer) {
    let binary = '';
    new Uint8Array(buffer).forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToBinary(pem) {
    const b64 = pem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function generarJWT(usuario) {
    const { appId, keyId, privateKey } = await obtenerConfig();

    const now = Math.floor(Date.now() / 1000);
    const header  = { alg: 'RS256', kid: keyId, typ: 'JWT' };
    const payload = {
        iss:  'chat',
        aud:  'jitsi',
        exp:  now + 7200,
        nbf:  now,
        room: '*',
        sub:  appId,
        context: {
            user: {
                name:      usuario.username,
                email:     usuario.email || `${usuario.username}@drivepizza.com`,
                id:        usuario.uid,
                moderator: 'false'
            },
            features: {
                livestreaming:      'false',
                'outbound-call':    'false',
                transcription:      'false',
                recording:          'false'
            }
        }
    };

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        pemToBinary(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signingInput = `${base64url(header)}.${base64url(payload)}`;
    const signature    = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        new TextEncoder().encode(signingInput)
    );

    return `${signingInput}.${base64urlBuffer(signature)}`;
}

/**
 * Conecta los eventos de participantes y chat al widget.
 * Llama después de iniciarJaaS.
 */
export function configurarWidgetJaaS(api, username) {
    // Toggle abrir/cerrar panel
    const toggle       = document.getElementById('jaas-toggle');
    const panel        = document.getElementById('jaas-panel');
    const unreadBadge  = document.getElementById('jaas-unread-badge');
    let unreadCount = 0;

    const limpiarUnread = () => {
        unreadCount = 0;
        unreadBadge.textContent = '0';
        unreadBadge.classList.remove('visible');
    };

    toggle?.addEventListener('click', () => {
        const abriendo = panel.style.display === 'none';
        panel.style.display = abriendo ? 'flex' : 'none';
        if (abriendo) limpiarUnread();
    });

    // Cerrar al hacer click fuera del widget
    document.addEventListener('click', (e) => {
        const widget = document.getElementById('jaas-widget');
        if (panel.style.display !== 'none' && !widget.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    // Contador de participantes
    const updateCount = () => {
        const badge = document.getElementById('jaas-count-badge');
        if (badge) badge.textContent = api.getNumberOfParticipants();
    };
    api.addEventListener('participantJoined',     updateCount);
    api.addEventListener('participantLeft',       updateCount);
    api.addEventListener('videoConferenceJoined', updateCount);

    // Mensajes recibidos
    api.addEventListener('incomingMessage', ({ nick, message }) => {
        agregarMensaje(nick, message);
        // Badge naranja si el panel está cerrado
        if (panel.style.display === 'none') {
            unreadCount++;
            unreadBadge.textContent = unreadCount;
            unreadBadge.classList.add('visible');
        }
    });

    // Enviar mensaje
    const sendBtn  = document.getElementById('jaas-send-btn');
    const msgInput = document.getElementById('jaas-msg-input');
    const enviar = () => {
        const msg = msgInput.value.trim();
        if (!msg) return;
        api.executeCommand('sendChatMessage', msg);
        agregarMensaje(username, msg, true);
        msgInput.value = '';
    };
    sendBtn?.addEventListener('click', enviar);
    msgInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
}

function agregarMensaje(nick, message, propio = false) {
    const container = document.getElementById('jaas-messages');
    if (!container) return;
    const empty = container.querySelector('.jaas-msg-empty');
    if (empty) empty.remove();
    const msg = document.createElement('div');
    msg.className = 'jaas-msg';
    msg.innerHTML = propio
        ? `<strong style="color:#27ae60;">Tú:</strong> ${message}`
        : `<strong>${nick}:</strong> ${message}`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

/**
 * Inicia la sala JaaS en el elemento container indicado.
 * Devuelve el objeto api de JitsiMeetExternalAPI.
 */
function cargarScriptJitsi() {
    return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://meet.jit.si/external_api.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export async function iniciarJaaS(usuario, container) {
    await cargarScriptJitsi();
    const api = new JitsiMeetExternalAPI('meet.jit.si', {
        roomName: 'DrivePizzaCallCenter',
        parentNode: container,
        width:  '100%',
        height: '100%',
        userInfo: {
            displayName: usuario.username,
            email: usuario.email || `${usuario.username}@drivepizza.com`,
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: true,
            disableDeepLinking:  true,
            prejoinPageEnabled:  false,
            prejoinConfig: { enabled: false },
            readOnlyName: true,
        },
        interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS:       ['microphone', 'camera', 'hangup', 'chat', 'tileview'],
            SHOW_JITSI_WATERMARK:  false,
            SHOW_BRAND_WATERMARK:  false,
            DEFAULT_BACKGROUND:    '#1a1a2e',
        }
    });

    return api;
}
