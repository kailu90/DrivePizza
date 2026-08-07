import { supabase }                                    from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton }            from '../Shared/skeleton.js';
import { mostrarOverlay, actualizarOverlay, ocultarOverlay } from '../Shared/overlay.js';
import { initVersionBanner }                           from '../Shared/components.js';
import { colFechaToUTC }                               from '../Shared/semanas.js';

mostrarSkeleton('pedidos');

;(async () => {
    // ── Auth ──────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '../index.html'; return; }

    const { data: perfil, error: perfilError } = await supabase
        .from('usuarios').select('*').eq('id', user.id).single();

    if (perfilError || !perfil || perfil.rol !== 'gastrofusion') {
        await supabase.auth.signOut();
        window.location.href = '../index.html';
        return;
    }

    // ── Banner nueva versión ──────────────────────────────────────────────
    initVersionBanner();

    // ── Exponer helpers de overlay para gastrofusion-app.js ───────────────
    window.mostrarOverlay    = mostrarOverlay;
    window.actualizarOverlay = actualizarOverlay;
    window.ocultarOverlay    = ocultarOverlay;
    window.asesorGF          = perfil.username;

    // ── Cargar productos del evento desde Supabase ────────────────────────
    const { data: gfProductos, error: prodError } = await supabase
        .from('gastrofusion_productos')
        .select('*')
        .eq('activo', true)
        .order('categoria')
        .order('orden');

    if (prodError) console.error('[GF] Error cargando productos:', prodError);

    // Poblar menuDataGF (var global de gastrofusion-app.js)
    (gfProductos || []).forEach(row => {
        const nombre = row.nombre_display || 'Sin nombre';
        const cat    = row.categoria;
        if (!menuDataGF[cat]) menuDataGF[cat] = [];
        menuDataGF[cat].push({
            nombre,
            descripcion:  row.descripcion || '',
            opciones:     row.opciones || { 'Unidad': Number(row.precio_evento) },
            esAdicionable: cat.toLowerCase() !== 'adiciones',
        });
    });

    // ── Inicializar UI ────────────────────────────────────────────────────
    document.getElementById('username').textContent = `Hola ${perfil.username}`;
    initGF(Object.keys(menuDataGF));

    // ── Toggle acompañamientos ────────────────────────────────────────────
    document.querySelectorAll('#acomp-pills .acomp-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const t = pill.dataset.topping;
            if (_toppingsGF.has(t)) { _toppingsGF.delete(t); pill.classList.remove('active'); }
            else                    { _toppingsGF.add(t);    pill.classList.add('active'); }
        });
    });

    // ── Botones de pago ───────────────────────────────────────────────────
    document.querySelectorAll('.pago-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pago-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // ── Cerrar checkout al hacer click fuera ───────────────────────────────
    const modalCheckout = document.getElementById('modal-checkout');
    let _mousedownTarget = null;
    modalCheckout.addEventListener('mousedown', e => { _mousedownTarget = e.target; });
    modalCheckout.addEventListener('click', e => {
        if (e.target === modalCheckout && _mousedownTarget === modalCheckout) cerrarCheckout();
        _mousedownTarget = null;
    });

    // ── Botón enviar pedido ────────────────────────────────────────────────
    document.getElementById('btn-enviar-pedido').addEventListener('click', () => procesarPedidoGF());

    // ── Cart bar (mobile) ──────────────────────────────────────────────────
    document.getElementById('cart-bar-btn')?.addEventListener('click', () => abrirCartPanel());
    document.getElementById('cart-overlay')?.addEventListener('click', () => cerrarCartPanel());

    // ── Cierre de Caja ────────────────────────────────────────────────────
    const modalCierre  = document.getElementById('modal-cierre');
    const cierreFecha  = document.getElementById('cierre-fecha');
    cierreFecha.value  = hoyEnColombia();

    document.getElementById('btn-cierre').addEventListener('click', async () => {
        modalCierre.style.display = 'flex';
        await cargarCierre(cierreFecha.value, perfil.username);
    });
    document.getElementById('btn-cerrar-cierre').addEventListener('click', () => {
        modalCierre.style.display = 'none';
    });
    modalCierre.addEventListener('click', e => {
        if (e.target === modalCierre) modalCierre.style.display = 'none';
    });
    cierreFecha.addEventListener('change', () => cargarCierre(cierreFecha.value, perfil.username));
    document.getElementById('btn-imprimir-cierre').addEventListener('click', () => {
        const tabla = document.getElementById('cierre-resultado').innerHTML;
        const sw = screen.availWidth;
        const sh = screen.availHeight;
        const win = window.open('', '_blank', `width=${sw},height=${sh},left=0,top=0`);
        win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
    @page { margin: 0; }
    html { margin: 0; padding: 0; }
    body {
        margin: 0;
        padding: 12px 12px 0;
        box-sizing: border-box;
        width: 100%;
        font-family: 'Courier New', monospace;
        font-size: 14px;
    }
    table { width: 100%; border-collapse: collapse; }
    th { background: none; color: #000; font-size: inherit; padding: 4px 6px; border: none; }
    thead tr:first-child th,
    thead tr:nth-child(2) th { text-align: center; padding: 2px 0; text-transform: uppercase; }
    thead tr:nth-child(2) th::after { content: ''; display: block; border-top: 1px dashed #000; margin-top: 4px; }
    thead tr:last-child th { border-top: 1px solid #000; border-bottom: 1px solid #000; }
    td { padding: 4px 6px; border: none; background: none; color: #000; font-size: inherit; }
    .fila-sep td { font-weight: bold; border-top: 1px dashed #000; }
    .fila-total td { font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; }
    .fila-cancelado td { color: #000; }
    tfoot td { border-top: 1px dashed #000; font-size: 0.75em; }
</style>
</head>
<body onload="window.print(); window.close();">${tabla}</body></html>`);
        win.document.close();
    });

    // ── Home ──────────────────────────────────────────────────────────────────
    document.getElementById('btn-home').addEventListener('click', () => {
        window.location.href = '../Pizzerias/pizzerias.html';
    });

    // ── Logout ────────────────────────────────────────────────────────────
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) {
            await supabase.auth.signOut();
            window.location.href = '../index.html';
        }
    });

    // ── enviarAFirebase — inserta en pedidos_callcenter vía Supabase ───────
    window.enviarAFirebase = async (datos) => {
        const { data: nPedido, error: rpcError } = await supabase.rpc('siguiente_n_pedido_callcenter');
        if (rpcError) throw new Error('Error obteniendo número de pedido: ' + rpcError.message);

        const fila = {
            n_pedido:  nPedido,
            nombre:    datos.nombre,
            telefono:  datos.telefono,
            direccion: '',
            sede:      'gastrofusion',
            canal:     'gastrofusion',
            asesor:    perfil.username,
            pago:      datos.pago,
            obs:       datos.obs ?? '',
            acompanamientos: datos.acompanamientos ?? null,
            productos: datos.productos,
            total:     datos.total,
            domicilio: { tipo: 'recoger', valor: 0 },
            impreso:   false,
            estado:    'pendiente',
            fecha:     new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('pedidos_callcenter').insert(fila).select('n_pedido').single();
        if (error) throw new Error('Error creando pedido: ' + error.message);
        return data.n_pedido;
    };

    // ── Mostrar contenido ─────────────────────────────────────────────────
    ocultarSkeleton('contenido-principal');
    document.body.classList.add('loaded');
})();

// ── Cierre de Caja — helpers y lógica ────────────────────────────────────────

function hoyEnColombia() {
    const col = new Date(Date.now() - 5 * 60 * 60 * 1000);
    return col.toISOString().slice(0, 10);
}

function formatCOP(n) {
    return '$' + Math.round(n).toLocaleString('es-CO');
}

function fechaLarga(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

async function cargarCierre(fecha, username) {
    const estadoEl   = document.getElementById('cierre-estado');
    const resultadoEl = document.getElementById('cierre-resultado');
    estadoEl.textContent  = 'Cargando...';
    resultadoEl.innerHTML = '';

    const { data: pedidos, error } = await supabase
        .from('pedidos_callcenter')
        .select('pago, estado, total')
        .eq('canal', 'gastrofusion')
        .eq('sede', 'gastrofusion')
        .gte('fecha', colFechaToUTC(fecha, 'inicio'))
        .lte('fecha', colFechaToUTC(fecha, 'fin'))
        .range(0, 999);

    if (error) { estadoEl.textContent = 'Error al cargar pedidos.'; return; }
    if (!pedidos.length) { estadoEl.textContent = `Sin pedidos para ${fechaLarga(fecha)}.`; return; }

    estadoEl.textContent = '';
    renderTablaCierre(pedidos, fecha, username);
}

function renderTablaCierre(pedidos, fecha, username) {
    const cancelados = pedidos.filter(p => p.estado === 'cancelado');
    const activos    = pedidos.filter(p => p.estado !== 'cancelado');
    const totalNeto  = activos.reduce((s, p) => s + (p.total || 0), 0);
    const totalCanc  = cancelados.reduce((s, p) => s + (p.total || 0), 0);

    const metodos = {};
    for (const p of activos) {
        const k = p.pago || 'Sin definir';
        if (!metodos[k]) metodos[k] = { cantidad: 0, total: 0 };
        metodos[k].cantidad++;
        metodos[k].total += p.total || 0;
    }

    const hora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    let filasPago = '';
    for (const [pago, d] of Object.entries(metodos)) {
        filasPago += `<tr><td>${pago}</td><td class="num">${d.cantidad}</td><td class="num">${formatCOP(d.total)}</td></tr>`;
    }

    const filaCanc = cancelados.length > 0 ? `
        <tr class="fila-sep"><td colspan="3">Cancelados</td></tr>
        <tr class="fila-cancelado">
            <td>Pedidos cancelados</td>
            <td class="num">${cancelados.length}</td>
            <td class="num">${formatCOP(totalCanc)}</td>
        </tr>` : '';

    document.getElementById('cierre-resultado').innerHTML = `
        <table>
            <thead>
                <tr><th colspan="3" style="text-align:center;">CIERRE DE CAJA</th></tr>
                <tr><th colspan="3" style="text-align:center;font-weight:400;text-transform:capitalize;">${fechaLarga(fecha)}</th></tr>
                <tr><th>Concepto</th><th class="num">Pedidos</th><th class="num">Total</th></tr>
            </thead>
            <tbody>
                <tr class="fila-sep"><td colspan="3">Desglose por método de pago</td></tr>
                ${filasPago}
                <tr class="fila-total">
                    <td>Total neto</td>
                    <td class="num">${activos.length}</td>
                    <td class="num">${formatCOP(totalNeto)}</td>
                </tr>
                ${filaCanc}
                <tr class="fila-sep"><td colspan="3"></td></tr>
                <tr><td>Total pedidos</td><td class="num">${pedidos.length}</td><td class="num"></td></tr>
                <tr><td>Ticket promedio</td><td class="num"></td><td class="num">${activos.length ? formatCOP(totalNeto / activos.length) : '—'}</td></tr>
            </tbody>
            <tfoot>
                <tr><td colspan="3">Generado: ${hora} · ${username}</td></tr>
            </tfoot>
        </table>
    `;
}
