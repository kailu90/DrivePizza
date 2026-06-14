/**
 * backfill-direcciones-clientes.mjs
 *
 * Extrae las direcciones de entrega de pedidos_callcenter y las inserta
 * en direcciones_cliente para cada cliente existente en la tabla clientes.
 *
 * Lógica:
 *  - Omite pedidos de tipo "recoger" o sin dirección
 *  - Deduplica por (cliente_id, direccion) — no inserta duplicados
 *  - Marca como predeterminada la dirección más reciente de cada cliente,
 *    solo si ese cliente aún no tiene ninguna predeterminada
 *
 * Ejecución: node scripts/backfill-direcciones-clientes.mjs
 */

const SUPABASE_URL     = 'http://65.109.225.149:8000';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU';

const HEADERS = {
    'apikey':        SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
};

// ── helpers REST ──────────────────────────────────────────────────────────────

async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function sbPost(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method:  'POST',
        headers: HEADERS,
        body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
}

async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method:  'PATCH',
        headers: HEADERS,
        body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
}

// ── paginación ────────────────────────────────────────────────────────────────

async function fetchAllPedidos() {
    const PAGE = 1000;
    let offset = 0;
    let all    = [];

    console.log('Descargando pedidos_callcenter...');
    while (true) {
        const rows = await sbGet(
            `pedidos_callcenter?select=telefono,direccion,domicilio,sede,fecha` +
            `&order=fecha.asc` +
            `&offset=${offset}&limit=${PAGE}`
        );
        all = all.concat(rows);
        process.stdout.write(`  ${all.length} pedidos leídos...\r`);
        if (rows.length < PAGE) break;
        offset += PAGE;
    }
    console.log(`\nTotal pedidos: ${all.length}`);
    return all;
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
    try {
        // 1. Cargar todos los pedidos
        const pedidos = await fetchAllPedidos();

        // 2. Cargar todos los clientes (id, telefono)
        console.log('Cargando clientes...');
        const clientes = await sbGet('clientes?select=id,telefono&limit=50000');
        const clienteMap = new Map(clientes.map(c => [c.telefono, c.id]));
        console.log(`  ${clientes.length} clientes cargados`);

        // 3. Cargar direcciones ya existentes
        console.log('Cargando direcciones existentes...');
        const dirsExistentes = await sbGet('direcciones_cliente?select=cliente_id,direccion&limit=100000');
        // Set de "clienteId|direccion" para deduplicar
        const dirSet = new Set(dirsExistentes.map(d => `${d.cliente_id}|${d.direccion}`));
        console.log(`  ${dirsExistentes.length} direcciones existentes`);

        // 4. Cargar cuáles clientes ya tienen predeterminada
        const predExistentes = await sbGet(
            'direcciones_cliente?select=cliente_id&predeterminada=eq.true&limit=100000'
        );
        const tienePred = new Set(predExistentes.map(d => d.cliente_id));

        // 5. Agrupar direcciones por cliente desde pedidos
        // Estructura: clienteId -> [ {direccion, barrio, sede_id, fecha} ]
        const dirsPorCliente = new Map();

        let omitidos = 0;
        for (const p of pedidos) {
            const tel = (p.telefono || '').replace(/\D/g, '');
            if (!tel) { omitidos++; continue; }

            const clienteId = clienteMap.get(tel);
            if (!clienteId) { omitidos++; continue; } // cliente no existe en la tabla

            // Omitir recoger en sede
            const dom = p.domicilio || {};
            if (dom.tipo === 'recoger') continue;

            const dir = (p.direccion || '').trim();
            if (!dir) continue;

            // barrio viene de domicilio.barrio (nuevos) o queda vacío
            const barrio  = (dom.barrio || '').trim() || null;
            const sede_id = p.sede || null;

            if (!dirsPorCliente.has(clienteId)) dirsPorCliente.set(clienteId, []);

            // Solo guardar si no hay duplicado de direccion para este cliente
            const lista = dirsPorCliente.get(clienteId);
            if (!lista.some(d => d.direccion === dir)) {
                lista.push({ direccion: dir, barrio, sede_id, fecha: p.fecha });
            } else {
                // Actualizar barrio/sede si los nuevos tienen más info
                const existing = lista.find(d => d.direccion === dir);
                if (!existing.barrio && barrio)   existing.barrio  = barrio;
                if (!existing.sede_id && sede_id) existing.sede_id = sede_id;
                // Guardar la fecha más reciente para saber cuál marcar como pred
                if (p.fecha > (existing.fecha || '')) existing.fecha = p.fecha;
            }
        }
        console.log(`Clientes con direcciones para insertar: ${dirsPorCliente.size} (omitidos ${omitidos})`);

        // 6. Insertar nuevas direcciones
        let insertadas   = 0;
        let yaExistian   = 0;
        let predMarcadas = 0;

        for (const [clienteId, dirs] of dirsPorCliente) {
            // Ordenar por fecha descendente → la primera es la más reciente
            dirs.sort((a, b) => (b.fecha || '') > (a.fecha || '') ? 1 : -1);

            for (const d of dirs) {
                const key = `${clienteId}|${d.direccion}`;
                if (dirSet.has(key)) { yaExistian++; continue; }

                await sbPost('direcciones_cliente', {
                    cliente_id:     clienteId,
                    direccion:      d.direccion,
                    barrio:         d.barrio   || null,
                    sede_id:        d.sede_id  || null,
                    predeterminada: false,
                });
                dirSet.add(key);
                insertadas++;
            }

            // Marcar predeterminada: la dirección más reciente, solo si no tiene ninguna
            if (!tienePred.has(clienteId)) {
                const masReciente = dirs[0]; // ya ordenada desc por fecha
                await sbPatch(
                    `direcciones_cliente?cliente_id=eq.${clienteId}&direccion=eq.${encodeURIComponent(masReciente.direccion)}`,
                    { predeterminada: true }
                );
                tienePred.add(clienteId);
                predMarcadas++;
            }
        }

        console.log('\n=== Resultado ===');
        console.log(`  Direcciones insertadas:    ${insertadas}`);
        console.log(`  Ya existían (omitidas):    ${yaExistian}`);
        console.log(`  Predeterminadas marcadas:  ${predMarcadas}`);
        console.log('Listo.');

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
