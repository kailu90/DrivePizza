/**
 * importarReservas.mjs
 * Importa reservas de abril 2026 (Cañaveral + Cabecera) a Firestore.
 * Uso:  node importarReservas.mjs [--dry-run]
 *
 * Requiere: serviceAccountKey.json en la misma carpeta.
 * Fuente:   ReservasMigrarAbril2026(Caña-cabe).xlsx
 */

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── DATOS REALES (extraídos del Excel) ──────────────────────────────────────
// fecha     = fecha de la RESERVA (extraída de la observación)
// asesor    = columna USUARIO del Excel
// horaReserva = hora 24h extraída de la observación
const RESERVAS = [
    // ══ CAÑAVERAL ══
    {
        fecha: '2026-04-05',
        asesor: 'Nicolas',
        sede: 'cañaveral',
        nombre: 'Neyda Torres Rincón',
        telefono: '3133907943',
        horaReserva: '19:00',
        cantidadPersonas: 20,
        obs: 'Neyda Torres Rincón / Domingo 05 de abril 2026 / 7:00 pm / 20 personas / 3133907943',
    },
    {
        fecha: '2026-04-04',
        asesor: 'Daniel',
        sede: 'cañaveral',
        nombre: 'Diana Bohórquez',
        telefono: '3193534467',
        horaReserva: '19:00',
        cantidadPersonas: 15,
        obs: 'Diana Bohórquez / Sábado 4 de Abril / 7:00 PM / 15 personas aprox / 3193534467',
    },
    {
        fecha: '2026-04-04',
        asesor: 'Juan E',
        sede: 'cañaveral',
        nombre: 'Camila Andrea Salinas',
        telefono: '3163966471',
        horaReserva: '20:00',
        cantidadPersonas: 13,
        obs: 'Leidy Quintero / 04 de abril / 8pm / 13 personas / 3163966471',
    },
    {
        fecha: '2026-04-08',
        asesor: 'Daniel',
        sede: 'cañaveral',
        nombre: 'Diego Rivera',
        telefono: '3213403777',
        horaReserva: '17:30',
        cantidadPersonas: 12,
        obs: 'Nombre: Diego Rivera / Fecha y hora: Miércoles 8 de abril 2026 - 5:30pm / Personas: 12 / Contacto: 3213403777',
    },
    {
        fecha: '2026-04-11',
        asesor: 'Nikol',
        sede: 'cañaveral',
        nombre: 'Luz Helena Quintero',
        telefono: '3163343690',
        horaReserva: '18:00',
        cantidadPersonas: 19,
        obs: 'Nombre: Luz Helena Quintero / Día: sábado / Fecha: 11 abril / Hora: 6:00 pm / Cantidad de personas: 19 / Número de contacto: 3163343690',
    },
    {
        fecha: '2026-04-12',
        asesor: 'Miguel Baez',
        sede: 'cañaveral',
        nombre: 'Laura Valentina Fuentes García',
        telefono: '3183950770',
        horaReserva: '19:00',
        cantidadPersonas: 12,
        obs: 'Nombre: Laura Valentina Fuentes García / Fecha: 12/04/2026 / Hora: 7:00 pm / Cantidad de personas: 12 / Número de contacto: 3183950770',
    },
    {
        fecha: '2026-04-20',
        asesor: 'Daniel',
        sede: 'cañaveral',
        nombre: 'Johan Granados',
        telefono: '3166232385',
        horaReserva: '20:15',
        cantidadPersonas: 8,
        obs: 'Johan Granados / 20 de abril / 8:15 pm / 8 personas / 3166232385',
    },
    {
        fecha: '2026-04-22',
        asesor: 'Nicolas',
        sede: 'cañaveral',
        nombre: 'Geymy Acevedo Carrillo',
        telefono: '3163931770',
        horaReserva: '20:00',
        cantidadPersonas: 6,
        obs: 'Geymy Acevedo Carrillo / Miércoles 22 de abril / 8:00 PM / 6 personas / 3163931770',
    },

    // ══ CABECERA ══
    {
        fecha: '2026-04-09',
        asesor: 'Daniel',
        sede: 'cabecera',
        nombre: 'Johanna Galvis',
        telefono: '3178660584',
        horaReserva: '18:00',
        cantidadPersonas: 10,
        obs: 'Nombre: Johanna Galvis / Día: Jueves / Fecha: 9 de abril de 2026 / Hora: 6:00 p.m / Cantidad de personas: 10 / Número de contacto: 3178660584',
    },
    {
        fecha: '2026-04-10',
        asesor: 'Nicolas',
        sede: 'cabecera',
        nombre: 'Dani Mendez Saldarriaga',
        telefono: '3147315125',
        horaReserva: '20:30',
        cantidadPersonas: 8,
        obs: 'Nombre: Dani Mendez Saldarriaga / Día: Viernes 10 de Abril / Hora: 8:30pm / Cantidad de personas: 8 / Número de contacto: 3147315125',
    },
    {
        fecha: '2026-04-14',
        asesor: 'Nicolas',
        sede: 'cabecera',
        nombre: 'Sergio Flores',
        telefono: '3028289502',
        horaReserva: '19:30',
        cantidadPersonas: 12,
        obs: 'Sergio Flores / 14 abril / 7:30 pm / 12 personas / 3028289502',
    },
    {
        fecha: '2026-04-16',
        asesor: 'Nikol',
        sede: 'cabecera',
        nombre: 'Yuly Chaparro',
        telefono: '3185768836',
        horaReserva: '19:00',
        cantidadPersonas: 12,
        obs: 'Yuly Chaparro / 7pm / 12 personas / 3185768836',
    },
    {
        fecha: '2026-04-19',
        asesor: 'Daniel',
        sede: 'cabecera',
        nombre: 'Camilo Andrés Picón Meneses',
        telefono: '3246818155',
        horaReserva: '18:00',
        cantidadPersonas: 7,
        obs: 'Camilo Andrés Picón Meneses / Domingo 19 abril 2026 / Hora 6:00 pm / 7 personas / 3246818155',
    },
];
// ─────────────────────────────────────────────────────────────────────────────

const CONTADOR_REF = db
    .collection('CallCenter').doc('principal')
    .collection('Contadores').doc('ultimoIdPedidos');

const PEDIDOS_REF = db
    .collection('CallCenter').doc('principal')
    .collection('PedidosCallCenter');

/** "YYYY-MM-DD" → Timestamp medianoche COT (UTC-5 = 05:00 UTC) */
function fechaATimestamp(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return admin.firestore.Timestamp.fromDate(new Date(Date.UTC(y, m - 1, d, 5, 0, 0)));
}

async function importarUna(reserva, idx, total) {
    const { fecha, asesor, sede, nombre, telefono, horaReserva, cantidadPersonas, obs } = reserva;

    if (DRY_RUN) {
        console.log(
            `[DRY-RUN] ${String(idx + 1).padStart(2)}/${total}` +
            ` | ${fecha} | ${horaReserva} | ${String(cantidadPersonas).padStart(2)} pax` +
            ` | ${sede.padEnd(10)} | ${nombre}`,
        );
        return;
    }

    await db.runTransaction(async (t) => {
        const snap = await t.get(CONTADOR_REF);
        if (!snap.exists) throw new Error('Documento contador no existe');

        const nuevoId = (snap.data().ultimoIdPedidos ?? 0) + 1;

        const doc = {
            tipo: 'reserva',
            nPedido: nuevoId,
            nombre,
            telefono: String(telefono),
            sede,
            horaReserva,
            cantidadPersonas,
            obs,
            asesor,
            canal: 'whatsapp',
            fecha: fechaATimestamp(fecha),
            estado: 'entregado',
            impreso: true,
            productos: [],
            total: 0,
            pago: '',
            direccion: '',
            domicilio: { tipo: 'recoger', valor: 0 },
        };

        t.update(CONTADOR_REF, { ultimoIdPedidos: nuevoId });
        t.set(PEDIDOS_REF.doc(), doc);

        console.log(
            `✅ ${String(idx + 1).padStart(2)}/${total}` +
            ` | nPedido=${nuevoId} | ${fecha} | ${horaReserva} | ${cantidadPersonas} pax` +
            ` | ${sede} | ${nombre}`,
        );
    });
}

async function main() {
    console.log(`\n=== importarReservas.mjs${DRY_RUN ? ' [DRY-RUN]' : ''} ===`);
    console.log(`Total: ${RESERVAS.length} reservas\n`);

    let ok = 0;
    let errores = 0;

    for (let i = 0; i < RESERVAS.length; i++) {
        try {
            await importarUna(RESERVAS[i], i, RESERVAS.length);
            ok++;
        } catch (err) {
            errores++;
            console.error(`❌ Error reserva ${i + 1} (${RESERVAS[i].nombre}):`, err.message);
        }
    }

    console.log(`\n=== Resultado: ${ok} importadas, ${errores} errores ===\n`);
    process.exit(0);
}

main();
