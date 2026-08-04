/* ============================================================
   Drive Pizza — Confirmación y seguimiento de pedido en tiempo real
   ============================================================ */

import { supabase } from '../../Api/supabaseConfig.js';

// Orden de estados para el tracker
const PASOS = [
  { estado: 'pendiente',      stepId: 'step-pendiente'   },
  { estado: 'recibido',       stepId: 'step-recibido'    },
  { estado: 'en preparacion', stepId: 'step-preparacion' },
  { estado: 'despachado',     stepId: 'step-despachado'  },
  { estado: 'entregado',      stepId: 'step-entregado'   },
];

let channelRef = null;

async function init() {
  // Leer n_pedido de la URL
  const params  = new URLSearchParams(window.location.search);
  const nPedido = params.get('n');

  if (!nPedido) { window.location.href = 'index.html'; return; }

  document.getElementById('confirm-n').textContent = `Pedido #${nPedido}`;

  // Carga inicial
  const pedido = await cargarPedido(nPedido);
  if (pedido) {
    actualizarTracker(pedido.estado, pedido.domicilio);
    // Meta Pixel — Purchase
    if (typeof fbq !== 'undefined') {
      fbq('track', 'Purchase', {
        value:        pedido.total ?? 0,
        currency:     'COP',
        content_type: 'product',
      });
    }
    escucharCambios(pedido.id, pedido.domicilio);
  }
}

async function cargarPedido(nPedido) {
  const { data, error } = await supabase
    .from('pedidos_callcenter')
    .select('id, estado, domicilio, total')
    .eq('n_pedido', nPedido)
    .single();

  if (error || !data) {
    document.getElementById('confirm-sub').textContent =
      'No encontramos este pedido. Contacta a la sede.';
    return null;
  }
  return data;
}

function actualizarTracker(estadoActual, domicilio) {
  // Si es para recoger, cambiar texto del paso de despacho
  if (domicilio?.tipo === 'recoger') {
    const detail = document.getElementById('step-despachado-detail');
    if (detail) detail.textContent = 'Tu pedido está listo para recoger';
    const label = document.querySelector('#step-despachado .pw-status-label');
    if (label) label.textContent = 'Listo para recoger';
  }

  const idx = PASOS.findIndex(p => p.estado === estadoActual);

  PASOS.forEach((paso, i) => {
    const el = document.getElementById(paso.stepId);
    if (!el) return;
    el.classList.remove('done', 'active');
    if (i < idx)       el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });

  // Actualizar ícono principal al estado entregado
  if (estadoActual === 'entregado') {
    const icon = document.getElementById('confirm-icon');
    if (icon) icon.style.background = 'rgba(49,75,39,.15)';
  }
}

function escucharCambios(pedidoId, domicilio) {
  channelRef = supabase
    .channel(`pedido-${pedidoId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pedidos_callcenter', filter: `id=eq.${pedidoId}` },
      payload => {
        const nuevoEstado = payload.new?.estado;
        if (nuevoEstado) actualizarTracker(nuevoEstado, domicilio);

        // Dejar de escuchar cuando ya está entregado o cancelado
        if (nuevoEstado === 'entregado' || nuevoEstado === 'cancelado') {
          channelRef?.unsubscribe();
          if (nuevoEstado === 'cancelado') mostrarCancelado();
        }
      }
    )
    .subscribe();
}

function mostrarCancelado() {
  document.getElementById('confirm-icon').textContent = '✕';
  document.getElementById('confirm-icon').style.background = 'rgba(231,76,60,.1)';
  document.getElementById('confirm-icon').style.color = '#e74c3c';
  document.getElementById('confirm-n').style.color = '#e74c3c';
  document.getElementById('confirm-sub').textContent =
    'Tu pedido fue cancelado. Contáctanos si tienes dudas.';
  document.getElementById('status-track').style.display = 'none';
}

init();
