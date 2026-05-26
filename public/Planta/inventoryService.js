import { plantaDB } from '../Api/firebaseConfig.js';
import { runTransaction, doc, collection, increment, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = plantaDB.db;

import { HETZNER_URL } from '../Api/config.js';

export function notificarCacheProducto(productId) {
    fetch(`${HETZNER_URL}/planta/cache/producto/${productId}`, { method: 'POST' })
        .catch(() => {});
}

function pushMovimiento(firestoreId, movimiento) {
    const payload = { ...movimiento, firestoreId, fecha: new Date().toISOString() };
    fetch(`${HETZNER_URL}/planta/movimientos/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(() => {});
}

/***************************** FUNCIÓN CENTRALIZADA DE INVENTARIO PARA CREACIÓN DE MOVIMIENTO Y SUMA/DESCUENTO DE STOCK************************/
export async function ejecutarTransaccionStock({
    productId,
    name,
    cantidad,
    tipo,
    tipoMovimiento = null,
    subtipo = null,
    referenciaId,
    notas = "",
    usuario = "Admin",
    sede = null,
    precio = null,
}) {
    try {
        const productRef = doc(db, "Planta", "principal", "Productos", productId);
        const impacto = (tipo === 'ENTRADA') ? cantidad : -cantidad;

        // 1. Transacción SOLO sobre el producto (sin contador compartido)
        await runTransaction(db, async (transaction) => {
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) throw "Producto no encontrado";

            transaction.update(productRef, {
                stock: increment(impacto),
                ultimaActualizacion: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        // 2. Registro del movimiento con addDoc (sin competencia de contador)
        const movimiento = {
            movimientoId:   Date.now(),
            fecha:          serverTimestamp(),
            tipo:           tipoMovimiento || tipo,
            entidad:        'Producto',
            productoId:     productId,
            productoNombre: name,
            cantidad:       cantidad,
            referenciaId:   referenciaId,
            motivo:         tipo === 'SALIDA' ? "Entrega de Pedido" : "Ingreso Manual",
            notas:          notas,
            usuario:        usuario
        };
        if (sede)    movimiento.sede       = sede;
        if (subtipo) movimiento.subtipo   = subtipo;
        if (precio)  movimiento.precio    = precio;
        if (precio && subtipo !== 'correccion') movimiento.valorTotal = cantidad * precio;
        const docRef = await addDoc(collection(db, "Planta", "principal", "Movimientos"), movimiento);
        notificarCacheProducto(productId);
        pushMovimiento(docRef.id, movimiento);

        return true;
    } catch (e) {
        console.error("Error en ejecutarTransaccionStock:", e);
        throw e;
    }
}

// ── FUNCIÓN CENTRALIZADA DE LOG ────────────────────────────────────────────
// Registra cualquier evento del sistema en /Planta/principal/Movimientos
// sin tocar el stock del producto.
//
// Params:
//   tipo            'ENTRADA' | 'SALIDA' | 'MODIFICACION' | 'ELIMINACION' | 'CREACION'
//   entidad         'Producto' (extensible a 'Proveedor', etc.)
//   productoId      ID del documento Firestore del producto
//   productoNombre  Nombre legible
//   campo           (solo MODIFICACION) campo que cambió: 'name','price','stock','active',...
//   valorAnterior   (solo MODIFICACION) valor antes del cambio
//   valorNuevo      (solo MODIFICACION) valor después del cambio
//   cantidad        (solo ENTRADA/SALIDA) unidades
//   proveedorId     (solo ENTRADA) id del proveedor
//   proveedorNombre (solo ENTRADA) nombre del proveedor
//   motivo          texto libre
//   notas           observaciones adicionales
//   usuario         username del usuario logueado

// ── FUNCIÓN PARA SALIDA DE PEDIDO (batch de stocks + 1 movimiento) ──────────
// Descuenta el stock de todos los productos en una sola operación (writeBatch)
// y genera un único documento de movimiento con el array de productos.
//
// Params:
//   productos      [{ productId, name, cantidad }]
//   pedidoId       ID del documento Firestore del pedido
//   pedidoNumero   Número visible del pedido (ej: 1234)
//   notas          Observaciones adicionales
//   usuario        Username del usuario logueado

export async function ejecutarAjusteStock({
    productId,
    name,
    stockNuevo,
    motivo,
    notas = '',
    usuario = 'Admin'
}) {
    try {
        const productRef = doc(db, 'Planta', 'principal', 'Productos', productId);
        let stockAnterior = 0;

        await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(productRef);
            if (!snap.exists()) throw 'Producto no encontrado';
            stockAnterior = snap.data().stock ?? 0;
            transaction.update(productRef, {
                stock: stockNuevo,
                ultimaActualizacion: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        });

        const diferencia = stockNuevo - stockAnterior;
        const movAjuste = {
            movimientoId:   Date.now(),
            fecha:          serverTimestamp(),
            tipo:           'AJUSTE',
            entidad:        'Producto',
            productoId:     productId,
            productoNombre: name,
            stockAnterior,
            stockNuevo,
            diferencia,
            motivo,
            notas,
            usuario
        };
        const docRef = await addDoc(collection(db, 'Planta', 'principal', 'Movimientos'), movAjuste);
        notificarCacheProducto(productId);
        pushMovimiento(docRef.id, movAjuste);

        return { stockAnterior, diferencia };
    } catch (e) {
        console.error('Error en ejecutarAjusteStock:', e);
        throw e;
    }
}

export async function ejecutarSalidaPedido({
    productos,
    pedidoId,
    pedidoNumero,
    notas = '',
    usuario = 'Admin'
}) {
    try {
        // 1. Transacción: lee y actualiza todos los productos (fuerza sync con servidor)
        const refs = productos.map(({ productId }) =>
            doc(db, 'Planta', 'principal', 'Productos', productId));

        await runTransaction(db, async (transaction) => {
            // Reads secuenciales primero (requerido por Firestore)
            const snaps = [];
            for (const ref of refs) {
                snaps.push(await transaction.get(ref));
            }
            // Writes después de todos los reads
            snaps.forEach((snap, i) => {
                if (!snap.exists()) throw new Error(`Producto ${productos[i].productId} no encontrado`);
                transaction.update(refs[i], {
                    stock: increment(-productos[i].cantidad),
                    ultimaActualizacion: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            });
        });

        // 2. Notificar cache de cada producto modificado
        productos.forEach(p => notificarCacheProducto(p.productId));

        // 3. Un único registro de movimiento con el array completo de productos
        await registrarMovimiento({
            tipo: 'SALIDA',
            entidad: 'Pedido',
            productoNombre: `Pedido #${pedidoNumero}`,
            referenciaId: pedidoId,
            pedidoNumero,
            productos: productos.map(p => ({
                productoId:     p.productId,
                productoNombre: p.name,
                cantidad:       p.cantidad
            })),
            motivo: `Entrega de Pedido #${pedidoNumero}`,
            notas,
            usuario
        });

        return true;
    } catch (e) {
        console.error('Error en ejecutarSalidaPedido:', e);
        throw e;
    }
}

export async function registrarMovimiento({
    tipo,
    entidad = 'Producto',
    productoId = '',
    productoNombre = '',
    campo = '',
    valorAnterior = '',
    valorNuevo = '',
    cambios = null,
    productos = null,
    cantidad = 0,
    unidadMedida = '',
    proveedorId = '',
    proveedorNombre = '',
    referenciaId = '',
    pedidoNumero = null,
    motivo = '',
    notas = '',
    usuario = 'Admin'
}) {
    try {
        const movimiento = {
            movimientoId:  Date.now(),
            fecha:         serverTimestamp(),
            tipo,
            entidad,
            productoId,
            productoNombre,
            usuario,
        };

        if (tipo === 'MODIFICACION') {
            if (cambios && cambios.length > 0) {
                // Formato nuevo: array de cambios (múltiples campos en una sola escritura)
                movimiento.cambios = cambios;
            } else {
                // Formato anterior: campo único (toggle activo/inactivo)
                movimiento.campo         = campo;
                movimiento.valorAnterior = String(valorAnterior);
                movimiento.valorNuevo    = String(valorNuevo);
            }
        }
        if (tipo === 'ELIMINACION' && productos?.length > 0) {
            movimiento.productos = productos;
        }
        if (tipo === 'CREACION' && entidad === 'Pedido' && productos?.length > 0) {
            movimiento.productos = productos;
        }
        if (tipo === 'ENTRADA' || tipo === 'SALIDA') {
            if (productos && productos.length > 0) {
                // Formato nuevo: array de productos (salida de pedido)
                movimiento.productos = productos;
            } else {
                // Formato anterior: producto único
                movimiento.cantidad        = cantidad;
                movimiento.proveedorId     = proveedorId;
                movimiento.proveedorNombre = proveedorNombre;
                if (unidadMedida) movimiento.unidadMedida = unidadMedida;
            }
        }
        if (referenciaId) movimiento.referenciaId = referenciaId;
        if (pedidoNumero)  movimiento.pedidoNumero = pedidoNumero;
        if (motivo) movimiento.motivo = motivo;
        if (notas)  movimiento.notas  = notas;

        const docRef = await addDoc(collection(db, 'Planta', 'principal', 'Movimientos'), movimiento);
        pushMovimiento(docRef.id, movimiento);

        return movimiento.movimientoId;
    } catch (e) {
        console.error('❌ registrarMovimiento error:', e);
        throw e;
    }
}