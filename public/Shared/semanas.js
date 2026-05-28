/**
 * semanas.js — Cálculo de períodos semanales para liquidaciones
 *
 * Regla:
 *   Semana #1 = día 1 del mes → primer domingo del mes (puede ser parcial)
 *   Semanas siguientes = lunes → domingo, recortadas al último día del mes
 */

export function getLunes(fecha) {
    const d = new Date(fecha);
    const dia = d.getDay();
    d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
    d.setHours(0, 0, 0, 0);
    return d;
}

export function primerDomingoDelMes(year, month) {
    const d = new Date(year, month, 1);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function ultimoDiaDelMes(year, month) {
    const d = new Date(year, month + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
}

export function getPeriodoParaFecha(fecha) {
    const y = fecha.getFullYear();
    const m = fecha.getMonth();

    const inicio  = new Date(y, m, 1, 0, 0, 0, 0);
    const primDom = primerDomingoDelMes(y, m);
    const ultDia  = ultimoDiaDelMes(y, m);

    if (fecha <= primDom) {
        return { desde: inicio, hasta: primDom };
    }

    const lunes   = getLunes(fecha);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    domingo.setHours(23, 59, 59, 999);

    return { desde: lunes, hasta: domingo <= ultDia ? domingo : ultDia };
}

export function getPeriodo(offset = 0) {
    let periodo = getPeriodoParaFecha(new Date());
    for (let i = 0; i < Math.abs(offset); i++) {
        const ref = offset < 0
            ? new Date(periodo.desde.getTime() - 1000)
            : new Date(periodo.hasta.getTime() + 1000);
        periodo = getPeriodoParaFecha(ref);
    }
    return periodo;
}

export function getNumeroPeriodo(desde) {
    if (desde.getDate() === 1) return 1;
    const primDom = primerDomingoDelMes(desde.getFullYear(), desde.getMonth());
    return 1 + Math.ceil((desde.getDate() - primDom.getDate()) / 7);
}

/** Filtra pedidos válidos para liquidación: excluye eliminados y cancelados */
export function pedidosLiquidables(pedidos) {
    return pedidos.filter(p => !p.eliminado && p.status !== 'cancelado');
}

/** Filtra devoluciones que afectan liquidación: excluye correcciones de despacho */
export function devolucionesLiquidables(devoluciones) {
    return devoluciones.filter(d => !d.subtipo || d.subtipo === 'devolucion');
}

export function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Convierte una fecha local Colombia 'YYYY-MM-DD' a timestamp UTC para queries Supabase.
 * Colombia siempre UTC-5 (sin cambio de horario).
 * tipo='inicio' → medianoche Colombia = 05:00 UTC
 * tipo='fin'    → 23:59:59.999 Colombia = 04:59:59.999 UTC del día siguiente
 */
export function colFechaToUTC(fechaLocal, tipo = 'inicio') {
    const [y, m, d] = fechaLocal.split('-').map(Number);
    if (tipo === 'inicio') {
        return new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0)).toISOString();
    }
    return new Date(Date.UTC(y, m - 1, d + 1, 5, 0, 0, 0) - 1).toISOString();
}
