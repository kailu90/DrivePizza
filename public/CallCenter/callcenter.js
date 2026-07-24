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

document.getElementById('btn_pedidos_sedes').addEventListener('click', () => {
    window.location.href = './pedidosCallCenter.html';
});

document.getElementById('btn_historial').addEventListener('click', () => {
    window.location.href = './historialPedidos.html';
});

document.getElementById('btn_reporte_asesores').addEventListener('click', () => {
    window.location.href = './reporteAsesores.html';
});

document.getElementById('btn_reservas').addEventListener('click', () => {
    window.location.href = './historialPedidos.html?tipo=reserva';
});

document.getElementById('btn_pbx').addEventListener('click', () => {
    window.location.href = './pbx.html';
});

document.getElementById('btn_clientes').addEventListener('click', () => {
    window.location.href = './clientesCall.html';
});

document.getElementById('btn_admin_barrios').addEventListener('click', () => {
    window.location.href = './adminBarrios.html';
});
