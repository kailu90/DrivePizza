/**
 * backfill-dirs-faltantes.mjs
 *
 * Busca clientes que NO tienen ninguna dirección registrada y trata de
 * recuperarlas desde pedidos_callcenter normalizando el teléfono.
 *
 * Ejecución: node scripts/backfill-dirs-faltantes.mjs
 */

const SUPABASE_URL     = 'http://65.109.225.149:8000';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU';

const HEADERS = {
    'apikey':        SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
};

async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function sbPost(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
}

async function sbPatch(path, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method: 'PATCH', headers: HEADERS, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${await res.text()}`);
}

function norm(t) { return (t || '').replace(/\D/g, ''); }

// ── Paginación ─────────────────────────────────────────────────────────────────
async function fetchAll(base) {
    const PAGE = 1000;
    let offset = 0, all = [];
    while (true) {
        const rows = await sbGet(`${base}&offset=${offset}&limit=${PAGE}`);
        all = all.concat(rows);
        if (rows.length < PAGE) break;
        offset += PAGE;
    }
    return all;
}

(async () => {
    try {
        // 1. Todos los clientes
        console.log('Cargando clientes...');
        const clientes = await fetchAll('clientes?select=id,telefono&order=id.asc');
        console.log(`  ${clientes.length} clientes`);

        // 2. IDs que ya tienen al menos una dirección
        console.log('Cargando clientes con dirección...');
        const conDir = await fetchAll('direcciones_cliente?select=cliente_id&order=cliente_id.asc');
        const idsConDir = new Set(conDir.map(d => d.cliente_id));
        console.log(`  ${idsConDir.size} clientes con dirección`);

        // 3. Clientes SIN dirección
        const sinDir = clientes.filter(c => !idsConDir.has(c.id));
        console.log(`  ${sinDir.length} clientes SIN dirección\n`);

        if (!sinDir.length) { console.log('Todos los clientes tienen dirección. Nada que hacer.'); return; }

        // 4. Todos los pedidos de entrega (no recoger, con dirección)
        console.log('Descargando pedidos de entrega...');
        const pedidos = await fetchAll(
            'pedidos_callcenter?select=telefono,direccion,domicilio,sede,fecha&order=fecha.asc'
        );
        console.log(`  ${pedidos.length} pedidos totales`);

        // Agrupar pedidos por teléfono normalizado → lista de direcciones únicas
        const pedidosPorTel = new Map();
        for (const p of pedidos) {
            const tel = norm(p.telefono);
            if (!tel) continue;
            const dom = p.domicilio || {};
            if (dom.tipo === 'recoger') continue;
            const dir = (p.direccion || '').trim();
            if (!dir) continue;

            if (!pedidosPorTel.has(tel)) pedidosPorTel.set(tel, []);
            const lista = pedidosPorTel.get(tel);
            const existe = lista.find(d => d.direccion === dir);
            if (!existe) {
                lista.push({ direccion: dir, barrio: (dom.barrio || '').trim() || null, sede_id: p.sede || null, fecha: p.fecha });
            } else {
                if (!existe.barrio && dom.barrio) existe.barrio = dom.barrio.trim();
                if (p.fecha > (existe.fecha || '')) existe.fecha = p.fecha;
            }
        }

        // 5. Construir batch de inserciones
        const batch = [];
        let sinMatch = 0;
        const sinMatchLista = [];

        for (const cli of sinDir) {
            const telNorm = norm(cli.telefono);
            const dirs    = pedidosPorTel.get(telNorm);

            if (!dirs || !dirs.length) {
                sinMatch++;
                sinMatchLista.push(cli.telefono);
                continue;
            }

            dirs.sort((a, b) => (b.fecha || '') > (a.fecha || '') ? 1 : -1);

            dirs.forEach((d, i) => batch.push({
                cliente_id:     cli.id,
                direccion:      d.direccion,
                barrio:         d.barrio  || null,
                sede_id:        d.sede_id || null,
                predeterminada: i === 0,
            }));
        }

        console.log(`  Direcciones a insertar: ${batch.length}`);

        // Insertar en lotes de 500
        const BATCH_SIZE = 500;
        let insertadas = 0;
        for (let i = 0; i < batch.length; i += BATCH_SIZE) {
            const lote = batch.slice(i, i + BATCH_SIZE);
            await sbPost('direcciones_cliente', lote);
            insertadas += lote.length;
            process.stdout.write(`  Insertadas ${insertadas}/${batch.length}...\r`);
        }
        console.log();

        console.log('\n=== Resultado ===');
        console.log(`  Clientes sin dirección procesados: ${sinDir.length}`);
        console.log(`  Direcciones insertadas:            ${insertadas}`);
        console.log(`  Sin match en pedidos:              ${sinMatch}`);
        if (sinMatchLista.length) {
            console.log('\n  Teléfonos sin pedidos de entrega:');
            sinMatchLista.slice(0, 20).forEach(t => console.log(`    ${t}`));
            if (sinMatchLista.length > 20) console.log(`    ... y ${sinMatchLista.length - 20} más`);
        }
        console.log('\nListo.');

    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
})();
