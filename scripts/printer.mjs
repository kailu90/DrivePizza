import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pdf-to-printer';
import puppeteer from 'puppeteer';
import notifier from 'node-notifier';
import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logoPath = path.join(__dirname, 'logo.png');
const logoBase64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

const { print } = pkg;

// ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
const MI_SEDE = 'acropolis';
const NOMBRE_IMPRESORA = 'PIZZEROS';
const LOG_FILE = 'printer_log.txt';
const HETZNER_URL = 'https://api.everest-central.com';
// ─────────────────────────────────────────────────────────────────────────────

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function log(mensaje) {
    const ahora = new Intl.DateTimeFormat('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).format(new Date());
    const linea = `[${ahora}] ${mensaje}\n`;
    fs.appendFileSync(LOG_FILE, linea, 'utf8');
    console.log(linea.trim());
}

function formatearPrecio(numero) {
    return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(numero);
}

function formatearHora12(hora24) {
    if (!hora24) return '—';
    const [h, m] = hora24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatearFecha(fecha) {
    const d = fecha?.toDate ? fecha.toDate() : new Date(fecha);
    return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
}

function generarHTML(pedido) {
    const productosHTML = pedido.productos.map(item => {
        const qty = (item.qty || 1);
        const subtotal = item.precio * qty;
        const qtyLabel = `${qty}× `;

        const adicionesHTML = Array.isArray(item.adiciones) && item.adiciones.length > 0
            ? item.adiciones.map(a => {
                const aqty = (a.qty || 1);
                const nombreAdicion = a.nombre.replace(/\s*\([^)]*\)\s*$/, '').trim();
                return `
                <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:11pt; padding-left:12px; color:black; font-weight:700;">
                    <span>+ ${nombreAdicion}</span>
                    <span>$${formatearPrecio(a.precio * aqty)}</span>
                </div>`;
            }).join('')
            : '';

        const obsHTML = item.obs
            ? `<div style="padding-left:10px; font-size:11pt; font-weight:700; color:black;">📝 ${item.obs}</div>`
            : '';

        return `
        <div style="margin-bottom:6px;">
            <div style="display:flex; justify-content:space-between; font-size:11pt;">
                <span style="font-weight:bold;">${qtyLabel}${item.nombre}</span>
                <span style="font-weight:bold;">$${formatearPrecio(subtotal)}</span>
            </div>
            ${obsHTML}
            ${adicionesHTML}
        </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    html, body { margin: 0; padding: 0; }
</style>
</head>
<body>
        <div style="width:280px; font-family:'Courier New',monospace; color:black; background:white; padding:5px; margin:0 auto; font-weight:700;">
            <div style="text-align:center; margin-bottom:4px;">
                <img src="${logoBase64}" style="max-width:180px; height:auto; filter:invert(1);" />
            </div>
            <p style="text-align:center; margin:5px 0; font-size:12pt; font-weight:bold;">${pedido.sede.toUpperCase()}</p>

            <div style="border:4px solid black; display:flex; align-items:center; justify-content:center; gap:10px; padding:6px 10px; margin:10px 0;">
                <span style="font-size:14pt; font-weight:bold;">PEDIDO N°</span>
                <span style="font-size:24pt; font-weight:900;">#${pedido.nPedido || '---'}</span>
            </div>

            <div style="border-top:2px dashed black; margin:10px 0;"></div>

            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>CLIENTE:</strong> ${pedido.nombre}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>TEL:</strong> ${pedido.telefono}</p>
            ${pedido.domicilio?.tipo !== 'recoger' ? `<p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>DIR:</strong> ${pedido.direccion}</p>` : `<p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>ENTREGA:</strong> Recoge en tienda</p>`}
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>PAGO:</strong> ${pedido.pago}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>CANAL:</strong> ${pedido.canal || '---'}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>ASESOR:</strong> ${pedido.asesor || '---'}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>FECHA:</strong> ${pedido.fecha ? formatearFecha(pedido.fecha) : '---'}</p>

            <div style="border-top:1px solid black; margin:10px 0;"></div>
            <p style="text-align:center; font-weight:bold; margin-bottom:10px; font-size:12pt;">DETALLE DEL PEDIDO</p>

            <div style="width:100%;">
                ${productosHTML}
            </div>

            ${pedido.obs ? `<div style="border-top:1px dashed black; margin:10px 0; padding-top:6px;"><p style="margin:0; font-size:11pt; font-weight:700;"><strong>OBS:</strong> ${pedido.obs}</p></div>` : ''}

            <div style="border-top:3px solid black; margin-top:10px; padding-top:5px; text-align:right;">
                <span style="font-size:16pt; font-weight:bold;">TOTAL: $${formatearPrecio(pedido.total)}</span>
                ${pedido.domicilio
                    ? pedido.domicilio.tipo === 'recoger'
                        ? `<div style="font-size:11pt; margin-top:4px;">RECOGER: <strong>Recoge en tienda</strong></div>`
                        : `<div style="font-size:11pt; margin-top:4px;">DOMICILIO: <strong>$${formatearPrecio(pedido.domicilio.valor)}</strong></div>`
                    : ''}
            </div>

            <p style="text-align:center; margin-top:20px; font-size:9pt; font-weight:700;">*** COMPROBANTE DE SEDE ***</p>
        </div>
</body>
</html>`;
}

function generarHTMLReserva(pedido) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
    html, body { margin: 0; padding: 0; }
</style>
</head>
<body>
        <div style="width:280px; font-family:'Courier New',monospace; color:black; background:white; padding:5px; margin:0 auto; font-weight:700;">
            <div style="text-align:center; margin-bottom:4px;">
                <img src="${logoBase64}" style="max-width:180px; height:auto; filter:invert(1);" />
            </div>
            <p style="text-align:center; margin:5px 0; font-size:12pt; font-weight:bold;">${pedido.sede.toUpperCase()}</p>

            <div style="border:4px solid black; display:flex; align-items:center; justify-content:center; gap:10px; padding:6px 10px; margin:10px 0; background:#f0e6ff;">
                <span style="font-size:13pt; font-weight:bold;">🗓 RESERVA N°</span>
                <span style="font-size:24pt; font-weight:900;">#${pedido.nPedido || '---'}</span>
            </div>

            <div style="border-top:2px dashed black; margin:10px 0;"></div>

            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>CLIENTE:</strong> ${pedido.nombre}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>TEL:</strong> ${pedido.telefono}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>CANAL:</strong> ${pedido.canal || '---'}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>ASESOR:</strong> ${pedido.asesor || '---'}</p>
            <p style="margin:5px 0; font-size:11pt; font-weight:700;"><strong>FECHA:</strong> ${pedido.fecha ? formatearFecha(pedido.fecha) : '---'}</p>

            <div style="border-top:3px solid black; margin:12px 0; padding-top:8px; text-align:center;">
                ${pedido.fechaReserva ? `<div style="font-size:13pt; font-weight:900; margin-bottom:6px;">📅 FECHA RESERVA: ${pedido.fechaReserva.split('-').reverse().join('/')}</div>` : ''}
                <div style="font-size:16pt; font-weight:900; margin-bottom:4px;">🕐 ${formatearHora12(pedido.horaReserva)}</div>
                <div style="font-size:20pt; font-weight:900;">👥 ${pedido.cantidadPersonas ?? '—'} PERSONAS</div>
            </div>

            ${pedido.obs ? `<div style="border-top:1px dashed black; margin:10px 0; padding-top:6px;"><p style="margin:0; font-size:11pt; font-weight:700;"><strong>OBS:</strong> ${pedido.obs}</p></div>` : ''}

            <p style="text-align:center; margin-top:20px; font-size:9pt; font-weight:700;">*** RESERVA DE MESA ***</p>
        </div>
</body>
</html>`;
}

async function convertirHTMLaPDF(html, rutaPDF) {
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 302, height: 800, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'load' });
        const altura = await page.evaluate(() => document.body.scrollHeight + 20);
        await page.pdf({
            path: rutaPDF,
            width: '80mm',
            height: `${altura}px`,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
            printBackground: true,
        });
        log('PDF generado correctamente');
    } catch (error) {
        log(`Error al generar PDF: ${error.message}`);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

async function imprimirPDF(rutaPDF) {
    await print(rutaPDF, { printer: NOMBRE_IMPRESORA });
    log('Copia 1 impresa correctamente');
    await print(rutaPDF, { printer: NOMBRE_IMPRESORA });
    log('Copia 2 impresa correctamente');
}

// Notifica a Hetzner para que actualice su caché — no bloquea el flujo principal.
// Reintenta cada 30s indefinidamente hasta que Hetzner responda.
function notificarHetzner(id, datos) {
    (async () => {
        for (let i = 1; ; i++) {
            try {
                const res = await fetch(`${HETZNER_URL}/callcenter/cache/pedido/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos),
                });
                if (res.ok) {
                    log(`Caché Hetzner actualizado para pedido #${datos.nPedido}`);
                    return;
                }
                const err = await res.json().catch(() => ({}));
                log(`Intento ${i} fallido al notificar Hetzner: ${err.error ?? res.status}. Reintentando en 30s...`);
            } catch (e) {
                log(`Intento ${i} fallido al notificar Hetzner: ${e.message}. Reintentando en 30s...`);
            }
            await new Promise(r => setTimeout(r, 30000));
        }
    })();
}

async function procesarPedido(docSnap) {
    const pedido = docSnap.data();
    const id = docSnap.id;
    const esReserva = pedido.tipo === 'reserva';

    log(`${esReserva ? 'Nueva reserva' : 'Nuevo pedido'} detectado: #${pedido.nPedido} (${id})`);

    notifier.notify({
        title: esReserva ? 'Nueva Reserva' : 'Nuevo Pedido',
        message: `${esReserva ? 'Reserva' : 'Pedido'} #${pedido.nPedido} - ${pedido.nombre}`,
        sound: true,
    });

    try {
        const html = esReserva ? generarHTMLReserva(pedido) : generarHTML(pedido);
        const rutaPDF = `ticket_${id}.pdf`;

        await convertirHTMLaPDF(html, rutaPDF);

        // Reintentar impresión hasta 20 intentos (~10 min)
        const MAX_INTENTOS_IMPRESION = 20;
        let imprimioOK = false;
        for (let intentoImp = 1; intentoImp <= MAX_INTENTOS_IMPRESION; intentoImp++) {
            try {
                await imprimirPDF(rutaPDF);
                imprimioOK = true;
                break;
            } catch (error) {
                log(`Error al imprimir (intento ${intentoImp}/${MAX_INTENTOS_IMPRESION}): ${error.message}. Reintentando en 30s...`);
                if (intentoImp < MAX_INTENTOS_IMPRESION) await new Promise(r => setTimeout(r, 30000));
            }
        }
        if (!imprimioOK) {
            log(`Pedido #${pedido.nPedido} — impresión fallida tras ${MAX_INTENTOS_IMPRESION} intentos. Revisar impresora.`);
            notifier.notify({
                title: 'ERROR DE IMPRESIÓN',
                message: `Pedido #${pedido.nPedido} no se pudo imprimir. Revisar impresora.`,
                sound: true,
            });
            fs.unlinkSync(rutaPDF);
            return;
        }

        // Marcar en Firestore directamente (fuente de verdad, independiente de Hetzner)
        const ahora = new Date();
        const update = { impreso: true, estado: 'recibido', tsRecibido: ahora, updatedAt: ahora };
        await db.collection('CallCenter').doc('principal')
            .collection('PedidosCallCenter').doc(id)
            .update(update);
        log(`${esReserva ? 'Reserva' : 'Pedido'} #${pedido.nPedido} marcado en Firestore como recibido`);

        // Notificar a Hetzner en background para actualizar caché (no bloquea el flujo)
        notificarHetzner(id, { ...pedido, id, ...update });

        // Limpiar PDF temporal
        fs.unlinkSync(rutaPDF);

    } catch (error) {
        log(`Error procesando pedido ${id}: ${error.message}`);
    }
}

function iniciar() {
    log(`Monitor iniciado — Sede: ${MI_SEDE}`);

    const query = db
        .collection('CallCenter').doc('principal')
        .collection('PedidosCallCenter')
        .where('sede', '==', MI_SEDE)
        .where('impreso', '==', false);

    query.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                procesarPedido(change.doc);
            }
        });
    }, (error) => {
        log(`Error en el listener de Firestore: ${error.message}`);
    });
}

iniciar();
