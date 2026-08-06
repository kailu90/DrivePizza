import { supabase }                                    from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton }            from '../Shared/skeleton.js';
import { mostrarOverlay, actualizarOverlay, ocultarOverlay } from '../Shared/overlay.js';

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
