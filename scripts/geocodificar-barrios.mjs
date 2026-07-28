/**
 * geocodificar-barrios.mjs
 *
 * Geocodifica todos los barrios de barrios_domicilio que no tienen lat/lng
 * usando Nominatim (OpenStreetMap). Respeta el límite de 1 req/seg.
 *
 * Ejecución:
 *   node scripts/geocodificar-barrios.mjs              ← todas las sedes
 *   node scripts/geocodificar-barrios.mjs --sede cabecera
 *
 * Al terminar imprime un listado de los barrios que no encontró (para corregir
 * manualmente desde adminBarrios.html).
 */

const SUPABASE_URL     = 'http://65.109.225.149:8000';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU';
const DELAY_MS         = 1100; // Nominatim: máximo 1 req/s

const HEADERS = {
    'apikey':        SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type':  'application/json',
};

// ── Parsear argumentos ─────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const sedeIdx   = args.indexOf('--sede');
const sedeFilter = sedeIdx >= 0 ? args[sedeIdx + 1] : null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sbGet(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { ...HEADERS, 'Prefer': 'count=exact' },
    });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
    return res.json();
}

async function sbPatch(id, body) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/barrios_domicilio?id=eq.${id}`,
        { method: 'PATCH', headers: { ...HEADERS, 'Prefer': 'return=minimal' }, body: JSON.stringify(body) }
    );
    if (!res.ok) throw new Error(`PATCH id=${id} → ${res.status} ${await res.text()}`);
}

async function geocodificar(barrio) {
    const q   = encodeURIComponent(`${barrio}, Bucaramanga, Santander, Colombia`);
    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`,
        { headers: { 'User-Agent': 'EverestCentral/1.0 geocode-script' } }
    );
    const data = await res.json();
    if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    let query = 'barrios_domicilio?select=id,sede,barrio&lat=is.null&order=sede,barrio';
    if (sedeFilter) query += `&sede=eq.${encodeURIComponent(sedeFilter)}`;

    const barrios = await sbGet(query);

    if (!barrios.length) {
        console.log('No hay barrios sin coordenadas. Todo al dia.');
        return;
    }

    console.log(`\nGeocodificando ${barrios.length} barrios${sedeFilter ? ` (sede: ${sedeFilter})` : ''}...\n`);

    let ok = 0, fallidos = [];

    for (const [i, b] of barrios.entries()) {
        process.stdout.write(`[${String(i + 1).padStart(3)}/${barrios.length}] ${b.sede.padEnd(12)} ${b.barrio} ... `);

        try {
            const coords = await geocodificar(b.barrio);

            if (coords) {
                await sbPatch(b.id, { lat: coords.lat, lng: coords.lng });
                console.log(`OK  ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
                ok++;
            } else {
                console.log('NO ENCONTRADO');
                fallidos.push({ sede: b.sede, barrio: b.barrio });
            }
        } catch (e) {
            console.log(`ERROR: ${e.message}`);
            fallidos.push({ sede: b.sede, barrio: b.barrio });
        }

        if (i < barrios.length - 1) await sleep(DELAY_MS);
    }

    console.log(`\n--- Resumen ---`);
    console.log(`Geocodificados : ${ok}`);
    console.log(`No encontrados : ${fallidos.length}`);

    if (fallidos.length) {
        console.log('\nBarrios a revisar manualmente en adminBarrios.html:');
        fallidos.forEach(b => console.log(`  ${b.sede.padEnd(14)} ${b.barrio}`));
    }
}

main().catch(err => { console.error('\nError fatal:', err.message); process.exit(1); });
