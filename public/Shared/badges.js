// ── Badges compartidos — mismo estilo que historialPedidos.js ────

const ESTADO_BADGE = {
    'pendiente':      { bg: '#e53935', color: '#fff' },
    'recibido':       { bg: '#1565c0', color: '#fff' },
    'en preparacion': { bg: '#7b1fa2', color: '#fff' },
    'despachado':     { bg: '#0288d1', color: '#fff' },
    'entregado':      { bg: '#284c22', color: '#fff' },
    'cancelado':      { bg: '#757575', color: '#fff' },
};

export function badgeEstado(estado) {
    const label = estado === 'en preparacion' ? 'En preparación'
                : estado ? estado.charAt(0).toUpperCase() + estado.slice(1) : '—';
    const e = ESTADO_BADGE[estado] || { bg: '#aaa', color: '#fff' };
    return `<span style="background:${e.bg};color:${e.color};padding:3px 8px;border-radius:4px;font-size:1.1rem;font-weight:bold;white-space:nowrap;">${label}</span>`;
}

export function badgeCanal(canal) {
    const map = {
        whatsapp:     '📱 WhatsApp',
        ivr:          '📞 IVR',
        web:          '🌐 Web',
        google:       '🌐 Google',
        rappi:        '🛵 Rappi',
        gastrofusion: '🎪 Gastrofusión',
    };
    return map[canal] || canal || '—';
}
