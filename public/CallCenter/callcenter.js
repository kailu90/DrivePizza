import { supabase } from '../Api/supabaseConfig.js';

// Mostrar card de admin barrios solo para roles con permisos
(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
        .from('usuarios')
        .select('rol')
        .eq('id', user.id)
        .single();
    if (data && ['admin', 'callcenter-admin'].includes(data.rol)) {
        document.getElementById('btn_admin_barrios').style.display = '';
    }
})();

function navTo(href) {
    window.location.href = href;
}

document.getElementById('btn_pedidos_sedes').addEventListener('click', () => navTo('./pedidosCallCenter.html'));
document.getElementById('btn_historial').addEventListener('click', () => window.parent.postMessage({ type: 'nav-switch', page: 'historial' }, '*'));
document.getElementById('btn_reporte_asesores').addEventListener('click', () => navTo('./reporteAsesores.html'));
document.getElementById('btn_reservas').addEventListener('click', () => navTo('./historialPedidos.html?tipo=reserva'));
document.getElementById('btn_pbx').addEventListener('click', () => navTo('./pbx.html'));
document.getElementById('btn_clientes').addEventListener('click', () => navTo('./clientesCall.html'));
document.getElementById('btn_admin_barrios').addEventListener('click', () => navTo('./adminBarrios.html'));
