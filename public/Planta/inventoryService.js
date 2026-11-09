import { supabase } from '../Api/supabaseConfig.js';

// ── Helpers internos ──────────────────────────────────────────────────────────

async function _incrementStock(productId, delta) {
    const { error } = await supabase.rpc('increment_stock', {
        p_id: parseInt(productId), p_delta: delta
    });
    if (error) throw error;
}

async function _insertMovimiento(data) {
    const { error } = await supabase.from('movimientos').insert(data);
    if (error) {
        console.error('Error al insertar movimiento:', error);
        throw error;
    }
}

// ── ejecutarTransaccionStock ──────────────────────────────────────────────────
// Suma o descuenta stock de un producto y registra el movimiento.
export async function ejecutarTransaccionStock({
    productId,
    name,
    cantidad,
    tipo,
    tipoMovimiento = null,
    subtipo = null,
    referenciaId,
    notas = '',
    usuario = 'Admin',
    sede = null,
    precio = null,
}) {
    try {
        const impacto = tipo === 'ENTRADA' ? cantidad : -cantidad;
        await _incrementStock(productId, impacto);

        const movData = {
            movimiento_id:   Date.now(),
            fecha:           new Date().toISOString(),
            tipo:            tipoMovimiento || tipo,
            entidad:         'Producto',
            producto_id:     parseInt(productId) || null,
            producto_nombre: name,
            cantidad,
            motivo:          tipo === 'SALIDA' ? 'Entrega de Pedido' : 'Ingreso Manual',
            notas:           notas || null,
            usuario,
            referencia_id:   referenciaId || null,
        };
        if (sede)    movData.sede    = sede;
        if (subtipo) movData.subtipo = subtipo;
        if (precio)  movData.precio  = precio;
        if (precio && subtipo !== 'correccion') movData.valor_total = cantidad * precio;
        await _insertMovimiento(movData);
        return true;
    } catch (e) {
        console.error('Error en ejecutarTransaccionStock:', e);
        throw e;
    }
}

// ── ejecutarAjusteStock ───────────────────────────────────────────────────────
// Fija el stock de un producto al valor exacto y registra el ajuste.
export async function ejecutarAjusteStock({
    productId,
    name,
    stockNuevo,
    motivo,
    notas = '',
    usuario = 'Admin'
}) {
    try {
        const { data: stockAnterior, error } = await supabase.rpc('ajuste_stock', {
            p_id: parseInt(productId), p_nuevo: stockNuevo
        });
        if (error) throw error;

        const diferencia = stockNuevo - stockAnterior;
        await _insertMovimiento({
            movimiento_id:   Date.now(),
            fecha:           new Date().toISOString(),
            tipo:            'AJUSTE',
            entidad:         'Producto',
            producto_id:     parseInt(productId) || null,
            producto_nombre: name,
            stock_anterior:  stockAnterior,
            stock_nuevo:     stockNuevo,
            diferencia,
            motivo,
            notas:           notas || null,
            usuario,
        });

        return { stockAnterior, diferencia };
    } catch (e) {
        console.error('Error en ejecutarAjusteStock:', e);
        throw e;
    }
}

// ── ejecutarSalidaPedido ──────────────────────────────────────────────────────
// Descuenta stock de todos los productos de un pedido y genera un movimiento.
export async function ejecutarSalidaPedido({
    productos,
    pedidoId,
    pedidoNumero,
    notas = '',
    usuario = 'Admin'
}) {
    try {
        for (const p of productos) {
            await _incrementStock(p.productId, -p.cantidad);
        }

        await registrarMovimiento({
            tipo:           'SALIDA',
            entidad:        'Pedido',
            productoNombre: `Pedido #${pedidoNumero}`,
            referenciaId:   pedidoId,
            pedidoNumero,
            productos:      productos.map(p => ({
                productoId:     p.productId,
                productoNombre: p.name,
                cantidad:       p.cantidad,
            })),
            motivo:  `Entrega de Pedido #${pedidoNumero}`,
            notas,
            usuario,
        });

        return true;
    } catch (e) {
        console.error('Error en ejecutarSalidaPedido:', e);
        throw e;
    }
}

// ── registrarMovimiento ───────────────────────────────────────────────────────
// Registra cualquier evento del sistema en movimientos sin tocar el stock.
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
        const movData = {
            movimiento_id:   Date.now(),
            fecha:           new Date().toISOString(),
            tipo,
            entidad,
            producto_id:     productoId ? (parseInt(productoId) || null) : null,
            producto_nombre: productoNombre,
            usuario,
        };

        if (tipo === 'MODIFICACION') {
            if (cambios?.length > 0) {
                movData.cambios = cambios;
            } else {
                movData.campo          = campo;
                movData.valor_anterior = String(valorAnterior);
                movData.valor_nuevo    = String(valorNuevo);
            }
        }
        if (tipo === 'ELIMINACION' && productos?.length > 0) {
            movData.productos = productos;
        }
        if (tipo === 'CREACION' && entidad === 'Pedido' && productos?.length > 0) {
            movData.productos = productos;
        }
        if (tipo === 'ENTRADA' || tipo === 'SALIDA') {
            if (productos?.length > 0) {
                movData.productos = productos;
            } else {
                movData.cantidad         = cantidad;
                movData.proveedor_id     = proveedorId ? (parseInt(proveedorId) || null) : null;
                movData.proveedor_nombre = proveedorNombre || null;
                if (unidadMedida) movData.unidad_medida = unidadMedida;
            }
        }
        if (referenciaId) movData.referencia_id = referenciaId;
        if (pedidoNumero)  movData.pedido_numero = pedidoNumero;
        if (motivo) movData.motivo = motivo;
        if (notas)  movData.notas  = notas;

        const { error } = await supabase.from('movimientos').insert(movData);
        if (error) throw error;
        return movData.movimiento_id;
    } catch (e) {
        console.error('❌ registrarMovimiento error:', e);
        throw e;
    }
}

// ── ejecutarRecepcionMercancia ────────────────────────────────────────────────
// Registra una recepción de mercancía (factura con múltiples productos).
// Crea 1 registro en `recepciones` y 1 ENTRADA en `movimientos` por producto.
export async function ejecutarRecepcionMercancia({
    proveedorId,
    proveedorNombre,
    fecha,
    numeroFactura,
    valorTotal,
    metodoPago,
    notas,
    productos,   // [{ productoId, productoNombre, cantidad, unidadMedida }]
    usuario,
}) {
    // 1. Crear registro de recepción
    const { data: recepcion, error: errRec } = await supabase
        .from('recepciones')
        .insert({
            proveedor_id:     proveedorId    || null,
            proveedor_nombre: proveedorNombre || null,
            fecha,
            numero_factura:   numeroFactura  || null,
            valor_total:      valorTotal     || null,
            metodo_pago:      metodoPago,
            notas:            notas          || null,
            usuario,
            productos:        productos.map(p => ({
                productoId:     p.productoId,
                productoNombre: p.productoNombre,
                cantidad:       p.cantidad,
                unidadMedida:   p.unidadMedida,
            })),
        })
        .select('id')
        .single();
    if (errRec) throw errRec;

    const recepcionId = recepcion.id;
    const notaBase    = `Recepción #${recepcionId}${numeroFactura ? ' · Factura: ' + numeroFactura : ''}`;

    // 2. Por cada producto: movimiento primero, luego stock (evita stock huérfano)
    for (let i = 0; i < productos.length; i++) {
        const p = productos[i];
        await _insertMovimiento({
            movimiento_id:    Date.now() + i,
            fecha:            new Date().toISOString(),
            tipo:             'ENTRADA',
            entidad:          'Producto',
            producto_id:      parseInt(p.productoId) || null,
            producto_nombre:  p.productoNombre,
            cantidad:         p.cantidad,
            unidad_medida:    p.unidadMedida || null,
            proveedor_id:     proveedorId ? (parseInt(proveedorId) || null) : null,
            proveedor_nombre: proveedorNombre || null,
            referencia_id:    recepcionId,
            motivo:           'Recepción de Mercancía',
            notas:            notaBase,
            usuario,
        });
        await _incrementStock(p.productoId, p.cantidad);
    }

    return recepcionId;
}

// ── ejecutarOrdenProduccionMulti ──────────────────────────────────────────────
// Descuenta materias primas, suma múltiples productos salida y registra 1 movimiento.
export async function ejecutarOrdenProduccionMulti({
    ordenId,
    ordenNumero,
    materiales,
    productosSalida,
    usuario = 'Admin',
}) {
    try {
        const movData = {
            movimiento_id:    Date.now(),
            fecha:            new Date().toISOString(),
            tipo:             'PRODUCCION',
            entidad:          'OrdenProduccion',
            producto_nombre:  `Orden #${ordenNumero}`,
            referencia_id:    ordenId,
            orden_numero:     ordenNumero,
            materiales:       materiales.map(m => ({
                productoId:     m.productoId,
                productoNombre: m.productoNombre,
                cantidad:       m.cantidad,
                costoUnitario:  m.costoUnitario,
            })),
            productos_salida: productosSalida.map(ps => ({
                productoId:     ps.productoId,
                productoNombre: ps.productoNombre,
                cantidad:       ps.cantidad,
            })),
            usuario,
        };
        const { error } = await supabase.from('movimientos').insert(movData);
        if (error) throw error;

        for (const m of materiales) {
            if (m.soloProduccion) continue;
            await _incrementStock(m.productoId, -m.cantidad);
        }
        for (const ps of productosSalida) {
            await _incrementStock(ps.productoId, ps.cantidad);
        }
        return true;
    } catch (e) {
        console.error('Error en ejecutarOrdenProduccionMulti:', e);
        throw e;
    }
}

// ── ejecutarOrdenProduccion ───────────────────────────────────────────────────
// Descuenta materias primas, suma producto final y registra la orden.
export async function ejecutarOrdenProduccion({
    ordenId,
    ordenNumero,
    materiales,
    productoSalida,
    usuario = 'Admin',
    deducirIngredientes = true,
}) {
    try {
        const movData = {
            movimiento_id:   Date.now(),
            fecha:           new Date().toISOString(),
            tipo:            'PRODUCCION',
            entidad:         'OrdenProduccion',
            producto_nombre: `Orden #${ordenNumero}`,
            referencia_id:   ordenId,
            orden_numero:    ordenNumero,
            materiales:      materiales.map(m => ({
                productoId:     m.productoId,
                productoNombre: m.productoNombre,
                cantidad:       m.cantidad,
                costoUnitario:  m.costoUnitario,
            })),
            producto_salida: {
                productoId:     productoSalida.productoId,
                productoNombre: productoSalida.productoNombre,
                cantidad:       productoSalida.cantidad,
            },
            usuario,
        };
        const { error } = await supabase.from('movimientos').insert(movData);
        if (error) throw error;

        if (deducirIngredientes) {
            for (const m of materiales) {
                if (m.soloProduccion) continue;
                await _incrementStock(m.productoId, -m.cantidad);
            }
        }
        await _incrementStock(productoSalida.productoId, productoSalida.cantidad);
        return true;
    } catch (e) {
        console.error('Error en ejecutarOrdenProduccion:', e);
        throw e;
    }
}
