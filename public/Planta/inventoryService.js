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

// ── ejecutarOrdenProduccion ───────────────────────────────────────────────────
// Descuenta materias primas, suma producto final y registra la orden.
export async function ejecutarOrdenProduccion({
    ordenId,
    ordenNumero,
    materiales,
    productoSalida,
    usuario = 'Admin'
}) {
    try {
        for (const m of materiales) {
            await _incrementStock(m.productoId, -m.cantidad);
        }
        await _incrementStock(productoSalida.productoId, productoSalida.cantidad);

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
        return true;
    } catch (e) {
        console.error('Error en ejecutarOrdenProduccion:', e);
        throw e;
    }
}
