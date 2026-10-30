// ═══════════════════════════════════════════════════════
// Shared/stepper.js — Stepper de cambio de estado
// Usado por: pedidosPizzeria.js, pizzerias.js
// ═══════════════════════════════════════════════════════

const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
    </svg>`;

const STEPS = [
    {
        key: 'en preparacion',
        label: 'Preparando',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
               </svg>`
    },
    {
        key: 'despachado',
        label: 'Despachar',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="5.5" cy="17.5" r="2.5"/>
                <circle cx="17.5" cy="17.5" r="2.5"/>
                <path d="M15 6h-4l-2 6H3l2-4h8"/>
                <path d="M15 6l2 6h2l1-3h-5"/>
               </svg>`
    },
    {
        key: 'entregado',
        label: 'Entregado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
               </svg>`
    },
];

const STEPS_RESERVA = [
    {
        key: 'en preparacion',
        label: 'Confirmar',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <polyline points="9 16 11 18 15 14"/>
               </svg>`
    },
    {
        key: 'entregado',
        label: 'Completado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
               </svg>`
    },
];

const TS_MAP = {
    'en preparacion': 'ts_preparacion',
    'despachado':     'ts_despachado',
    'entregado':      'ts_entregado',
};

/**
 * Genera el HTML del stepper para un pedido.
 * @param {object} p  Pedido normalizado (normalizarPedido)
 */
export function renderStepper(p) {
    const steps      = p.tipo === 'reserva' ? STEPS_RESERVA : STEPS;
    const currentIdx = steps.findIndex(s => s.key === p.estado);
    let html = '<div class="stepper">';

    steps.forEach((step, i) => {
        let cls = '', onclick = '', icon = step.icon;

        if (i < currentIdx) {
            cls  = 'step-done';
            icon = ICON_CHECK;
        } else if (i === currentIdx) {
            cls = 'step-active';
        } else if (i === currentIdx + 1) {
            cls    = 'step-next';
            onclick = `onclick="cambiarEstado('${p.id}', '${step.key}')"`;
        } else {
            cls = 'step-locked';
        }

        html += `<div class="step ${cls}" ${onclick}>
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
        </div>`;

        if (i < steps.length - 1) {
            html += `<div class="step-connector ${i < currentIdx ? 'active' : ''}"></div>`;
        }
    });

    html += '</div>';
    return html;
}

/**
 * Actualiza el estado de un pedido en Supabase.
 * @param {object}   supabase    Cliente Supabase
 * @param {string}   pedidoId    ID del pedido
 * @param {string}   nuevoEstado Nuevo estado
 * @param {function} [onSuccess] Callback opcional tras éxito
 */
export async function cambiarEstado(supabase, pedidoId, nuevoEstado, onSuccess) {
    try {
        const campos = { estado: nuevoEstado };
        if (TS_MAP[nuevoEstado]) campos[TS_MAP[nuevoEstado]] = new Date().toISOString();

        const { error } = await supabase
            .from('pedidos_callcenter')
            .update(campos)
            .eq('id', pedidoId);

        if (error) throw error;
        onSuccess?.();
    } catch (e) {
        alert('Error al actualizar el estado. Intenta de nuevo.');
        console.error(e);
    }
}
