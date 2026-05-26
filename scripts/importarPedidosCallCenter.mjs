import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');
const XLSX = require('xlsx');

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
const RUTA_EXCEL = 'D:\\Kailu\\CallCenter\\Domicilios2026\\Marzo\\ExporteMesMarzo01al08deMarzo.xlsx';
const PESTAÑAS = ['Domi-Cabecera', 'Domi-Piedecuesta', 'Domi-Cañaveral', 'Domi-Megamall', 'Domi-Acropolis'];
const BATCH_SIZE = 400; // Firestore admite máx 500 por batch
// ─────────────────────────────────────────────────────────────────────────────

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const COLECCION = db.collection('CallCenter').doc('principal').collection('PedidosCallCenter');

// ── NORMALIZAR SEDE ───────────────────────────────────────────────────────────
function normalizarSede(sede) {
    if (!sede) return '';
    const s = String(sede).toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
    if (s.includes('cabecera'))    return 'cabecera';
    if (s.includes('piedecuesta')) return 'piedecuesta';
    if (s.includes('cañaveral') || s.includes('canaveral')) return 'cañaveral';
    if (s.includes('megamall'))    return 'megamall';
    if (s.includes('acropolis') || s.includes('acrópolis')) return 'acropolis';
    if (s.includes('unico') || s.includes('único')) return 'unico';
    return s;
}

// ── NORMALIZAR CANAL ──────────────────────────────────────────────────────────
function normalizarCanal(canal) {
    if (!canal) return 'whatsapp';
    const c = String(canal).toLowerCase().trim();
    if (c.includes('ivr')) return 'ivr';
    return 'whatsapp';
}

// ── NORMALIZAR PAGO ───────────────────────────────────────────────────────────
function normalizarPago(pago) {
    if (!pago) return '';
    const p = String(pago).toLowerCase().trim();
    if (p.includes('efectivo'))                    return 'Efectivo';
    if (p.includes('transfer') || p.includes('nequi') || p.includes('daviplata')) return 'Nequi/Daviplata';
    if (p.includes('datafono') || p.includes('datáfono')) return 'Datafono';
    return String(pago).trim();
}

// ── PARSEAR FECHA + HORA ──────────────────────────────────────────────────────
function parsearFecha(fechaRaw, horaRaw) {
    try {
        let fecha;

        // Excel puede dar la fecha como número serial o como string
        if (typeof fechaRaw === 'number') {
            // Número serial de Excel → Date (epoch Excel: 1 = 1900-01-01)
            fecha = new Date(Math.round((fechaRaw - 25569) * 86400 * 1000));
        } else {
            fecha = new Date(fechaRaw);
        }

        if (isNaN(fecha.getTime())) return admin.firestore.Timestamp.now();

        // Parsear hora (ej: "3:30 pm", "15:00", "3:30 PM")
        if (horaRaw) {
            const horaStr = String(horaRaw).trim().toLowerCase();
            const match = horaStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/);
            if (match) {
                let h = parseInt(match[1]);
                const m = parseInt(match[2]);
                const period = match[3];
                if (period === 'pm' && h < 12) h += 12;
                if (period === 'am' && h === 12) h = 0;
                fecha.setHours(h, m, 0, 0);
            }
        }

        return admin.firestore.Timestamp.fromDate(fecha);
    } catch {
        return admin.firestore.Timestamp.now();
    }
}

// ── PARSEAR NÚMERO DE PEDIDO ──────────────────────────────────────────────────
function parsearNPedido(raw) {
    if (!raw) return null;
    const match = String(raw).match(/\d+/);
    return match ? parseInt(match[0]) : null;
}

// ── PARSEAR TOTAL ─────────────────────────────────────────────────────────────
function parsearTotal(raw) {
    if (!raw) return 0;
    const limpio = String(raw).replace(/[^0-9]/g, '');
    return limpio ? parseInt(limpio) : 0;
}

// ── PARSEAR PRODUCTOS DESDE OBSERVACIÓN ──────────────────────────────────────
// Formato estructurado: "1 x Pizza Hawaiana - Grande - notas | 2 x Gaseosa - 400mL"
// Formato libre: "una pizza grande hawaiana"
function parsearProductos(obs, total) {
    if (!obs || String(obs).trim() === '') return [];

    const texto = String(obs).trim();

    // Detectar formato estructurado: contiene " x " o "x "
    const esEstructurado = /\d+\s*x\s+/i.test(texto);

    if (esEstructurado) {
        // Separadores: " | ", " / ", "\n"
        const partes = texto.split(/\s*[|\/]\s*|\n/).filter(p => p.trim());
        const productos = [];

        for (const parte of partes) {
            // Patrón: "N x Nombre - Tamaño - notas"
            const match = parte.trim().match(/^(\d+)\s*x\s+(.+?)(?:\s*-\s*([^-\*]+))?(?:\s*-\s*.*)?$/i);
            if (match) {
                const cantidad = parseInt(match[1]) || 1;
                const nombre   = match[2].trim();
                const tamano   = match[3] ? match[3].trim() : '';
                const nombreCompleto = tamano ? `${nombre} (${tamano})` : nombre;

                // Si hay más de 1 unidad, crear una entrada por unidad
                for (let i = 0; i < cantidad; i++) {
                    productos.push({ nombre: nombreCompleto, precio: 0 });
                }
            } else if (parte.trim()) {
                // Parte que no matchea el patrón pero no está vacía
                productos.push({ nombre: parte.trim(), precio: 0 });
            }
        }

        // Si solo hay un producto, asignarle el total completo
        if (productos.length === 1) productos[0].precio = total;
        return productos;
    }

    // Formato libre → un solo ítem con el texto completo
    return [{ nombre: texto, precio: total }];
}

// ── LEER EXCEL Y PROCESAR ─────────────────────────────────────────────────────
function leerPedidos() {
    const workbook = XLSX.readFile(RUTA_EXCEL);
    const todos = [];

    for (const nombrePestaña of PESTAÑAS) {
        const sheet = workbook.Sheets[nombrePestaña];
        if (!sheet) {
            console.warn(`⚠️  Pestaña no encontrada: ${nombrePestaña}`);
            continue;
        }

        const filas = XLSX.utils.sheet_to_json(sheet, { defval: null });
        console.log(`📄 ${nombrePestaña}: ${filas.length} filas`);

        for (const fila of filas) {
            const nPedido = parsearNPedido(fila['Numero pedido web']);
            const total   = parsearTotal(fila['VALOR (sin domi)']);
            const obs     = fila['OBSERVACIÓN'] ? String(fila['OBSERVACIÓN']).trim() : '';

            const pedido = {
                nPedido:   nPedido,
                fecha:     parsearFecha(fila['FECHA'], fila['HORA DE ORDEN']),
                asesor:    fila['USUARIO'] ? String(fila['USUARIO']).trim().toLowerCase() : '',
                nombre:    fila['NOMBRE']  ? String(fila['NOMBRE']).trim()  : '',
                telefono:  fila['CELULAR'] ? String(fila['CELULAR']).trim() : '',
                direccion: fila['DIRECCIÓN'] ? String(fila['DIRECCIÓN']).trim() : '',
                sede:      normalizarSede(fila['SEDE']),
                canal:     normalizarCanal(fila['CANAL']),
                pago:      normalizarPago(fila['FORMA DE PAGO']),
                obs:       obs,
                productos: parsearProductos(obs, total),
                total:     total,
                estado:    'entregado',
                impreso:   true,
            };

            // Saltar filas sin datos mínimos
            if (!pedido.nombre && !pedido.telefono) continue;

            todos.push(pedido);
        }
    }

    return todos;
}

// ── SUBIR A FIRESTORE EN BATCHES ──────────────────────────────────────────────
async function subirPedidos(pedidos) {
    console.log(`\n🚀 Subiendo ${pedidos.length} pedidos a Firestore...`);
    let subidos = 0;

    for (let i = 0; i < pedidos.length; i += BATCH_SIZE) {
        const lote = pedidos.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const pedido of lote) {
            const ref = COLECCION.doc();
            batch.set(ref, pedido);
        }

        await batch.commit();
        subidos += lote.length;
        console.log(`   ✅ ${subidos} / ${pedidos.length}`);
    }

    console.log(`\n✨ Importación completada: ${subidos} pedidos subidos.`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
try {
    const pedidos = leerPedidos();
    console.log(`\n📦 Total pedidos procesados: ${pedidos.length}`);
    await subirPedidos(pedidos);
} catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
}
