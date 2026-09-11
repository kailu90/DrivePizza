import {
  iniciarSesion,
  cerrarSesion,
  enviarMensaje,
  enviarMedia,
  getSesiones,
  getContactos,
  initWsClients,
  autoReconectarSesiones,
  broadcast,
  registrarLidManual,
  eliminarMensaje,
  editarMensaje,
} from './whatsapp.service.js'
import { supabase } from '../../config/supabase.js'

export async function whatsappRoutes(fastify, options) {
  const { wsClients } = options
  initWsClients(wsClients)

  // Al arrancar el backend, reconectar sesiones que estaban activas
  autoReconectarSesiones()

  // GET /wa/sesiones — sesiones vivas + desconectadas desde Supabase
  fastify.get('/wa/sesiones', async (req, reply) => {
    const vivas = getSesiones()
    if (!supabase) return vivas
    try {
      const numerosVivos = new Set(vivas.map(s => s.numero))
      const [{ data: sesionesBD }, { data: configs }] = await Promise.all([
        supabase.from('sesiones_wa').select('numero, sede, status, color'),
        supabase.from('config_conexiones_wa').select('numero, respuesta_inicial, activo'),
      ])
      const colorMap  = {}
      const configMap = {}
      const desconectadas = []
      for (const s of (sesionesBD || [])) {
        colorMap[s.numero] = s.color
        if (!numerosVivos.has(s.numero))
          desconectadas.push({ numero: s.numero, sede: s.sede, status: 'desconectado', tieneQr: false, color: s.color })
      }
      for (const c of (configs || [])) configMap[c.numero] = c

      const enrich = s => ({
        ...s,
        color: colorMap[s.numero] || null,
        respuesta_inicial: configMap[s.numero]?.activo ? (configMap[s.numero]?.respuesta_inicial || null) : null,
      })
      return [...vivas.map(enrich), ...desconectadas.map(enrich)]
    } catch {
      return vivas
    }
  })

  // PATCH /wa/contactos/:numero/:contacto — guardar nombre en clientes (fuente de verdad)
  fastify.patch('/wa/contactos/:numero/:contacto', async (req, reply) => {
    const { numero } = req.params
    const contacto = decodeURIComponent(req.params.contacto)
    const { nombre } = req.body ?? {}
    if (!nombre?.trim()) return reply.code(400).send({ error: 'nombre requerido' })
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })

    const telefono = (contacto.length === 12 && contacto.startsWith('57'))
      ? contacto.slice(2)
      : contacto

    const { error } = await supabase.from('clientes')
      .upsert({ telefono, nombre: nombre.trim(), updated_at: new Date().toISOString() },
               { onConflict: 'telefono' })
    if (error) return reply.code(500).send({ error: error.message })

    broadcast({ tipo: 'wa:contacto', numero, phone: contacto, name: nombre.trim(), fuente: 'clientes' })
    return { ok: true }
  })

  // GET /wa/contactos — todos los contactos conocidos por sesion
  fastify.get('/wa/contactos', async (req, reply) => {
    return getContactos()
  })

  // PATCH /wa/contactos/:numero/:contacto/vincular — vincular @lid a número real manualmente
  fastify.patch('/wa/contactos/:numero/:contacto/vincular', async (req, reply) => {
    const { numero } = req.params
    const lid = decodeURIComponent(req.params.contacto)
    const { realPhone: rawPhone } = req.body ?? {}
    if (!rawPhone?.trim()) return reply.code(400).send({ error: 'realPhone requerido' })
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })

    // Normalizar: si es 10 dígitos → agregar prefijo 57
    const rawClean  = rawPhone.trim().replace(/\D/g, '')
    const realPhone = rawClean.length === 10 ? '57' + rawClean : rawClean
    const telefono  = realPhone.startsWith('57') ? realPhone.slice(2) : realPhone

    if (!realPhone || realPhone.length < 10)
      return reply.code(400).send({ error: 'Número inválido' })

    // 1. Persistir en wa_identidades — fuente de verdad lid↔teléfono
    //    upsert seguro: sin dependencias de esquema de clientes ni restricciones NOT NULL
    const { error: e1 } = await supabase.from('wa_identidades')
      .upsert({ lid, telefono, numero_sesion: numero }, { onConflict: 'lid' })
    if (e1) return reply.code(500).send({ error: 'Error guardando identidad: ' + e1.message })

    // 2. Verificar colisión: si realPhone ya tiene mensajes, requerir ?force=true explícito
    const force = req.query?.force === 'true'
    if (!force) {
      const { count: existentes } = await supabase.from('mensajes_wa')
        .select('id', { count: 'exact', head: true })
        .eq('numero', numero).eq('contacto', realPhone)
      if (existentes > 0) {
        return reply.code(409).send({
          error:    'IDENTITY_CONFLICT',
          message:  `El número ${realPhone} ya tiene ${existentes} mensajes propios. Si estás seguro, repite la petición con ?force=true.`,
          existing: existentes,
          lidPhone: lid,
          realPhone,
        })
      }
    }

    // 3. Migrar mensajes que llegaron bajo el lid
    await supabase.from('mensajes_wa')
      .update({ contacto: realPhone })
      .eq('numero', numero).eq('contacto', lid)

    // 3. Traspasar asignación del lid al teléfono real (si existía) y desactivar la del lid
    const { data: asigLid } = await supabase.from('asignaciones_wa')
      .select('asesor, estado')
      .eq('numero', numero).eq('contacto', lid).eq('activo', true)
      .single()
    await supabase.from('asignaciones_wa')
      .update({ activo: false })
      .eq('numero', numero).eq('contacto', lid)
    if (asigLid?.asesor) {
      await supabase.from('asignaciones_wa')
        .upsert(
          { numero, contacto: realPhone, asesor: asigLid.asesor, estado: asigLid.estado || 'asignado', activo: true },
          { onConflict: 'numero,contacto' }
        )
    }

    // 4. Actualizar mapa en memoria
    registrarLidManual(numero, lid, realPhone)

    // 5. Broadcast — el frontend fusiona las conversaciones
    broadcast({ tipo: 'wa:merge', numero, lidPhone: lid, realPhone })

    console.log('[WA] Vincular manual:', lid, '→', realPhone, '(', telefono, ')')
    return { ok: true, realPhone }
  })

  // GET /wa/mensajes/:numero/:contacto — historial paginado desde Supabase
  // Query params: limit (default 50, max 100), before (id para paginar hacia atrás)
  fastify.get('/wa/mensajes/:numero/:contacto', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })

    const { numero, contacto } = req.params
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100)
    const before = req.query.before ? parseInt(req.query.before) : null

    let query = supabase
      .from('mensajes_wa')
      .select('id, numero, contacto, nombre, texto, timestamp, saliente, msg_id, desde_telefono, tipo, status, sin_ack, media_url, reactions, quoted_msg_id, quoted_texto, quoted_from_me, asesor, editado, created_at')
      .eq('numero', numero)
      .eq('contacto', contacto)
      .order('id', { ascending: false })
      .limit(limit)

    if (before) query = query.lt('id', before)

    const { data, error } = await query
    if (error) return reply.code(500).send({ error: error.message })

    // Devolver en orden cronológico (el frontend muestra de más viejo a más nuevo)
    return (data || []).reverse()
  })

  // GET /wa/historial/:numero/:contacto — historial filtrado por fechas + paginación cursor
  // Query params: desde (ISO), hasta (ISO), before_id (int cursor), limit (default 50, max 100), busqueda (string)
  fastify.get('/wa/historial/:numero/:contacto', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })

    const { numero, contacto } = req.params
    const limit    = Math.min(parseInt(req.query.limit) || 50, 100)
    const beforeId = req.query.before_id ? parseInt(req.query.before_id) : null
    const busqueda = req.query.busqueda?.trim() || null

    // Rango de fechas en segundos Unix (timestamp en BD está en segundos)
    const hastaTs = req.query.hasta
      ? Math.floor(new Date(req.query.hasta).getTime() / 1000)
      : Math.floor(Date.now() / 1000)
    const desdeTs = req.query.desde
      ? Math.floor(new Date(req.query.desde).getTime() / 1000)
      : hastaTs - (30 * 86400) // default 30 días

    let query = supabase
      .from('mensajes_wa')
      .select('id, numero, contacto, nombre, texto, timestamp, saliente, msg_id, desde_telefono, tipo, status, sin_ack, media_url, reactions, quoted_msg_id, quoted_texto, quoted_from_me, asesor, editado, created_at')
      .eq('numero', numero)
      .eq('contacto', contacto)
      .gte('timestamp', desdeTs)
      .lte('timestamp', hastaTs)
      .order('id', { ascending: false })
      .limit(limit)

    if (beforeId) query = query.lt('id', beforeId)
    if (busqueda) query = query.ilike('texto', `%${busqueda}%`)

    const { data, error } = await query
    if (error) return reply.code(500).send({ error: error.message })

    // Devolver en orden cronológico (más viejo → más nuevo)
    return (data || []).reverse()
  })

  // POST /wa/sesiones — conectar nuevo número
  fastify.post('/wa/sesiones', async (req, reply) => {
    const { numero, sede } = req.body ?? {}
    if (!numero || !sede) {
      return reply.code(400).send({ error: 'numero y sede son requeridos' })
    }
    await iniciarSesion(numero, sede)
    return { ok: true, mensaje: `Sesión ${numero} iniciando — el QR llega por WebSocket (tipo: wa:qr)` }
  })

  // PATCH /wa/sesiones/:numero/config — actualizar color y/o respuesta_inicial (solo admin)
  fastify.patch('/wa/sesiones/:numero/config', async (req, reply) => {
    const { numero } = req.params
    const { color, respuesta_inicial } = req.body ?? {}
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    if (color !== undefined) {
      const { error } = await supabase.from('sesiones_wa').update({ color }).eq('numero', numero)
      if (error) return reply.code(500).send({ error: error.message })
    }
    if (respuesta_inicial !== undefined) {
      const { error } = await supabase.from('config_conexiones_wa')
        .upsert({ numero, respuesta_inicial, activo: true, updated_at: new Date().toISOString() }, { onConflict: 'numero' })
      if (error) return reply.code(500).send({ error: error.message })
    }
    broadcast({ tipo: 'wa:config', numero, color, respuesta_inicial })
    return { ok: true }
  })

  // DELETE /wa/sesiones/:numero — cerrar sesión
  fastify.delete('/wa/sesiones/:numero', async (req, reply) => {
    const numero = req.params.numero
    await cerrarSesion(numero)
    if (req.query.eliminar === 'true' && supabase) {
      await supabase.from('sesiones_wa').delete().eq('numero', numero)
      broadcast({ tipo: 'wa:eliminado', numero })
    }
    return { ok: true }
  })

  // GET /wa/asignaciones — obtener todos los chats asignados activos (paginado, sin límite PGRST)
  fastify.get('/wa/asignaciones', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const PAGE = 1000
    let all = [], offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('asignaciones_wa')
        .select('numero, contacto, asesor, estado')
        .eq('activo', true)
        .range(offset, offset + PAGE - 1)
      if (error) return reply.code(500).send({ error: error.message })
      all = all.concat(data || [])
      if (!data || data.length < PAGE) break
      offset += PAGE
    }
    return all
  })

  // POST /wa/asignaciones — tomar un chat
  fastify.post('/wa/asignaciones', async (req, reply) => {
    const { numero, contacto, asesor } = req.body ?? {}
    if (!numero || !contacto || !asesor)
      return reply.code(400).send({ error: 'numero, contacto y asesor son requeridos' })

    // Guard: si el mismo contacto (por contact_id) ya tiene una asignacion activa con otro JID, rechazar
    const { data: jidRowCheck } = await supabase
      .from('wa_contact_jids')
      .select('contact_id')
      .eq('numero_sesion', numero)
      .eq('jid', contacto)
      .maybeSingle()
    if (jidRowCheck?.contact_id) {
      const { data: existing } = await supabase
        .from('asignaciones_wa')
        .select('contacto, asesor, estado')
        .eq('numero', numero)
        .eq('contact_id', jidRowCheck.contact_id)
        .eq('activo', true)
        .neq('contacto', contacto)
        .maybeSingle()
      if (existing) {
        return reply.code(409).send({
          error: 'CONTACT_ALREADY_ASSIGNED',
          existing_contacto: existing.contacto,
          existing_asesor:   existing.asesor,
          message: `Este contacto ya tiene una conversación activa bajo ${existing.contacto}`,
        })
      }
    }

    const { error } = await supabase
      .from('asignaciones_wa')
      .upsert({ numero, contacto, asesor, activo: true, estado: 'asignado' }, { onConflict: 'numero,contacto' })
    if (error) return reply.code(500).send({ error: error.message })
    const ts1 = Math.floor(Date.now() / 1000)
    const texto1 = asesor + ' tomó la conversación'
    if (supabase) await supabase.from('mensajes_wa').insert({
      numero, contacto, nombre: null, texto: texto1, timestamp: ts1,
      saliente: false, desde_telefono: false, tipo: 'sistema'
    })
    broadcast({ tipo: 'wa:asignacion', numero, contacto, asesor })
    broadcast({ tipo: 'wa:mensaje', numero, sede: '', remitente: contacto, fromMe: false,
                pushName: null, texto: texto1, timestamp: ts1, msgId: null, tipoMensaje: 'sistema' })
    return { ok: true }
  })

  // POST /wa/admin/unificar-identidad — fusionar dos JIDs (phone + LID) en un único contact_id
  fastify.post('/wa/admin/unificar-identidad', async (req, reply) => {
    const { numero, jid_a, jid_b } = req.body ?? {}
    if (!numero || !jid_a || !jid_b)
      return reply.code(400).send({ error: 'numero, jid_a y jid_b son requeridos' })
    if (jid_a === jid_b)
      return reply.code(400).send({ error: 'Los dos JIDs deben ser distintos' })

    // 1. Buscar entradas existentes en wa_contact_jids
    const { data: jidRows, error: jidErr } = await supabase
      .from('wa_contact_jids')
      .select('id, jid, jid_type, contact_id')
      .eq('numero_sesion', numero)
      .in('jid', [jid_a, jid_b])
    if (jidErr) return reply.code(500).send({ error: jidErr.message })

    const rowA = jidRows?.find(r => r.jid === jid_a)
    const rowB = jidRows?.find(r => r.jid === jid_b)

    // 2. Determinar contact_id canónico (winner) y el que se fusiona (loser)
    let winnerContactId = null
    let loserContactId  = null

    if (rowA?.contact_id && rowB?.contact_id) {
      if (rowA.contact_id === rowB.contact_id) {
        winnerContactId = rowA.contact_id
        // Ya están unificados — solo limpiar asignaciones duplicadas
      } else {
        // Preferir el de tipo phone; si ambos o ninguno es phone, preferir el de id menor (más antiguo)
        const preferA = rowA.jid_type === 'phone' || (rowB.jid_type !== 'phone' && rowA.contact_id < rowB.contact_id)
        winnerContactId = preferA ? rowA.contact_id : rowB.contact_id
        loserContactId  = preferA ? rowB.contact_id : rowA.contact_id
      }
    } else if (rowA?.contact_id) {
      winnerContactId = rowA.contact_id
    } else if (rowB?.contact_id) {
      winnerContactId = rowB.contact_id
    } else {
      // Ninguno tiene contact — crear uno nuevo
      const { data: newC, error: newErr } = await supabase
        .from('wa_contacts')
        .insert({ numero_sesion: numero })
        .select('id').single()
      if (newErr) return reply.code(500).send({ error: newErr.message })
      winnerContactId = newC.id
    }

    // 3. Migrar referencias del loser al winner (si hay loser)
    if (loserContactId) {
      // a. NULL preferred_identity_id del loser para evitar FK circular
      await supabase.from('wa_contacts')
        .update({ preferred_identity_id: null })
        .eq('id', loserContactId)
      // b. Redirigir wa_contact_jids del loser al winner
      await supabase.from('wa_contact_jids')
        .update({ contact_id: winnerContactId })
        .eq('contact_id', loserContactId)
        .eq('numero_sesion', numero)
      // c. Redirigir mensajes_wa
      await supabase.from('mensajes_wa')
        .update({ contact_id: winnerContactId })
        .eq('contact_id', loserContactId)
        .eq('numero', numero)
      // d. Redirigir asignaciones_wa
      await supabase.from('asignaciones_wa')
        .update({ contact_id: winnerContactId })
        .eq('contact_id', loserContactId)
        .eq('numero', numero)
      // e. Eliminar wa_contacts loser (ya sin hijos)
      await supabase.from('wa_contacts').delete().eq('id', loserContactId)
    }

    // 4. Upsert ambos JIDs en wa_contact_jids apuntando al winner (trust_level confirmed)
    for (const jid of [jid_a, jid_b]) {
      const jid_type = /^\d{13,}$/.test(jid) ? 'lid' : 'phone'
      await supabase.from('wa_contact_jids').upsert(
        { contact_id: winnerContactId, numero_sesion: numero, jid, jid_type, trust_level: 'confirmed', source: 'manual' },
        { onConflict: 'numero_sesion,jid' }
      )
    }

    // 5. Asegurar contact_id en mensajes de ambos JIDs
    for (const jid of [jid_a, jid_b]) {
      await supabase.from('mensajes_wa')
        .update({ contact_id: winnerContactId })
        .eq('numero', numero)
        .eq('contacto', jid)
        .neq('contact_id', winnerContactId)
    }

    // 6. Asegurar contact_id en asignaciones de ambos JIDs
    for (const jid of [jid_a, jid_b]) {
      await supabase.from('asignaciones_wa')
        .update({ contact_id: winnerContactId })
        .eq('numero', numero)
        .eq('contacto', jid)
    }

    // 7. Cerrar asignaciones activas duplicadas — mantener la del JID phone, cerrar la del LID
    const { data: activeAsigs } = await supabase
      .from('asignaciones_wa')
      .select('id, contacto, asesor, estado')
      .eq('numero', numero)
      .in('contacto', [jid_a, jid_b])
      .eq('activo', true)

    if (activeAsigs && activeAsigs.length > 1) {
      const phoneJid  = /^57\d{10}$/.test(jid_a) ? jid_a : jid_b
      const primary   = activeAsigs.find(a => a.contacto === phoneJid) || activeAsigs[0]
      const toClose   = activeAsigs.filter(a => a.id !== primary.id)
      for (const asig of toClose) {
        await supabase.from('asignaciones_wa')
          .update({ activo: false, estado: 'resuelto' })
          .eq('id', asig.id)
      }
    }

    // 8. Sincronizar wa_identidades — fuente de verdad de _resolverLid en el backend
    // Necesario para que _resolverLid nivel 2 resuelva correctamente sin pasar por wa_contact_jids
    const _phonePair = [jid_a, jid_b].find(j => /^57\d{10}$/.test(j))
    const _lidPair   = [jid_a, jid_b].find(j => /^\d{13,}$/.test(j) && !/^57\d{10}$/.test(j))
    if (_phonePair && _lidPair) {
      await supabase.from('wa_identidades')
        .upsert({ lid: _lidPair, telefono: _phonePair, numero_sesion: numero }, { onConflict: 'lid' })
    }

    // 9. Auditoría
    console.log(`[WA:IDENTITY_MANUAL_MERGE] ${JSON.stringify({ numero, jid_a, jid_b, contact_id: winnerContactId, merged_from_id: loserContactId ?? null, operator: req.headers['x-asesor'] ?? 'unknown' })}`)

    return { ok: true, contact_id: winnerContactId, merged_from_id: loserContactId ?? null }
  })

  // DELETE /wa/asignaciones/:numero/:contacto — liberar chat
  fastify.delete('/wa/asignaciones/:numero/:contacto', async (req, reply) => {
    const { numero, contacto } = req.params
    const { error } = await supabase
      .from('asignaciones_wa')
      .update({ activo: false })
      .eq('numero', numero)
      .eq('contacto', decodeURIComponent(contacto))
    if (error) return reply.code(500).send({ error: error.message })
    broadcast({ tipo: 'wa:liberacion', numero, contacto })
    return { ok: true }
  })

  // PUT /wa/asignaciones/:numero/:contacto — cambiar estado (asignado -> resuelto)
  fastify.put('/wa/asignaciones/:numero/:contacto', async (req, reply) => {
    const { numero, contacto } = req.params
    const { estado } = req.body ?? {}
    if (!estado) return reply.code(400).send({ error: 'estado es requerido' })
    const { data, error } = await supabase
      .from('asignaciones_wa')
      .update({ estado })
      .eq('numero', numero)
      .eq('contacto', decodeURIComponent(contacto))
      .eq('activo', true)
      .select('asesor')
      .single()
    if (error) return reply.code(500).send({ error: error.message })
    const ts2 = Math.floor(Date.now() / 1000)
    const texto2 = (data?.asesor || 'Asesor') + ' resolvió la conversación'
    if (supabase) await supabase.from('mensajes_wa').insert({
      numero, contacto: decodeURIComponent(contacto), nombre: null, texto: texto2, timestamp: ts2,
      saliente: false, desde_telefono: false, tipo: 'sistema'
    })
    broadcast({ tipo: 'wa:estado', numero, contacto, asesor: data?.asesor, estado })
    broadcast({ tipo: 'wa:mensaje', numero, sede: '', remitente: decodeURIComponent(contacto), fromMe: false,
                pushName: null, texto: texto2, timestamp: ts2, msgId: null, tipoMensaje: 'sistema' })
    return { ok: true }
  })

  // PATCH /wa/asignaciones/:numero/:contacto — transferir chat a otro asesor
  fastify.patch('/wa/asignaciones/:numero/:contacto', async (req, reply) => {
    const { numero, contacto } = req.params
    const { asesor_nuevo, asesor_actual, nota } = req.body ?? {}
    if (!asesor_nuevo) return reply.code(400).send({ error: 'asesor_nuevo requerido' })
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { data, error } = await supabase.from('asignaciones_wa')
      .update({ asesor: asesor_nuevo })
      .eq('numero', numero).eq('contacto', decodeURIComponent(contacto)).eq('activo', true)
      .select('asesor').single()
    if (error) return reply.code(500).send({ error: error.message })
    const ts = Math.floor(Date.now() / 1000)
    const contactoDec = decodeURIComponent(contacto)
    const texto = (asesor_actual || 'Asesor') + ' transfirió la conversación a ' + asesor_nuevo
    await supabase.from('mensajes_wa').insert({ numero, contacto: contactoDec, nombre: null, texto, timestamp: ts, saliente: false, desde_telefono: false, tipo: 'sistema' })
    broadcast({ tipo: 'wa:mensaje', numero, sede: '', remitente: contactoDec, fromMe: false, pushName: null, texto, timestamp: ts, msgId: null, tipoMensaje: 'sistema' })
    // Nota de gestión interna (opcional)
    if (nota?.trim()) {
      await supabase.from('mensajes_wa').insert({ numero, contacto: contactoDec, nombre: null,
        texto: nota.trim(), timestamp: ts + 1, saliente: false, desde_telefono: false,
        tipo: 'nota', asesor: asesor_actual || null })
      broadcast({ tipo: 'wa:mensaje', numero, sede: '', remitente: contactoDec, fromMe: false,
        pushName: null, texto: nota.trim(), timestamp: ts + 1, msgId: null,
        tipoMensaje: 'nota', asesor: asesor_actual || null })
    }
    broadcast({ tipo: 'wa:transferencia', numero, contacto: contactoDec, asesor_nuevo })
    return { ok: true }
  })

  // GET /wa/asesores — lista de asesores activos con rol callcenter
  fastify.get('/wa/asesores', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { data, error } = await supabase.from('usuarios')
      .select('username, rol')
      .in('rol', ['callcenter', 'callcenter-admin', 'admin'])
      .eq('active', true)
      .order('username')
    if (error) return reply.code(500).send({ error: error.message })
    return data
  })

  // GET /wa/asignaciones/conteos — conteos desde Supabase (compartido entre asesores)
  fastify.get('/wa/asignaciones/conteos', async (req, reply) => {
    if (!supabase) return { en_espera: 0, asignado: 0, resuelto: 0 }
    const { asesor } = req.query
    try {
      // Solo contar asignaciones que tienen mensajes reales (evita huerfanas inflando el conteo)
      const [{ data: asigs, error: e1 }, { data: convs, error: e2 }] = await Promise.all([
        supabase.from('asignaciones_wa').select('numero, contacto, estado, asesor').eq('activo', true),
        supabase.rpc('wa_conversaciones_activas'),
      ])
      if (e1) throw e1
      const convsSet  = new Set((convs || []).map(c => c.numero + ':' + c.contacto))
      const validas   = (asigs || []).filter(a => convsSet.has(a.numero + ':' + a.contacto))
      const filtradas = asesor ? validas.filter(a => a.asesor === asesor) : validas
      const asignado  = filtradas.filter(a => a.estado === 'asignado').length
      const resuelto  = filtradas.filter(a => a.estado === 'resuelto').length
      const { data: rpc, error: e3 } = await supabase.rpc('wa_en_espera_count')
      const en_espera = e3 ? 0 : (typeof rpc === 'number' ? rpc : 0)
      return { en_espera, asignado, resuelto }
    } catch (e) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // GET /wa/conversaciones — lista de conversaciones activas desde Supabase
  fastify.get('/wa/conversaciones', async (req, reply) => {
    if (!supabase) return []
    const { data: convs, error } = await supabase.rpc('wa_conversaciones_activas')
    if (error) return reply.code(500).send({ error: error.message })
    if (!convs?.length) return []

    // Enriquecer con nombres desde tabla clientes (fuente de verdad)
    const toTel = c => (c?.length === 12 && c?.startsWith('57')) ? c.slice(2) : c
    const telefonos = [...new Set(convs.map(c => toTel(c.contacto)).filter(Boolean))]
    const { data: clientes } = await supabase
      .from('clientes').select('telefono, nombre').in('telefono', telefonos)
    const clienteMap = Object.fromEntries((clientes || []).map(c => [c.telefono, c.nombre]))

    return convs.map(c => ({ ...c, nombre_cliente: clienteMap[toTel(c.contacto)] || null }))
  })

// GET /wa/conversaciones/resueltas -- lista paginada de chats resueltos  // ?offset=0&limit=20&asesor=nombre  fastify.get("/wa/conversaciones/resueltas", async (req, reply) => {    if (!supabase) return []    const offset = parseInt(req.query.offset) || 0    const limit  = Math.min(parseInt(req.query.limit) || 20, 50)    const asesor = req.query.asesor || null    try {      let q = supabase.from("asignaciones_wa")        .select("numero, contacto, asesor")        .eq("activo", true).eq("estado", "resuelto")      if (asesor) q = q.eq("asesor", asesor)      const { data: asigs, error: e1 } = await q      if (e1) throw e1      if (!asigs?.length) return []      // Ultimo mensaje de cada asignacion via Supabase      const pares = asigs.map(a => ).join(",")      const { data: msgs, error: e2 } = await supabase        .from("mensajes_wa")        .select("numero, contacto, nombre, texto, timestamp")        .filter("(numero,contacto)", "in", )        .order("timestamp", { ascending: false })      if (e2) throw e2      // DISTINCT ON por (numero, contacto) -- el primero es el mas reciente      const seen = new Set()      const lastMsg = {}      for (const m of (msgs || [])) {        const k = m.numero + ":" + m.contacto        if (!seen.has(k)) { seen.add(k); lastMsg[k] = m }      }      // Combinar asigs + lastMsg, ordenar por ultimo_ts DESC, paginar      const result = asigs.map(a => {        const k = a.numero + ":" + a.contacto        const m = lastMsg[k] || {}        return { numero: a.numero, contacto: a.contacto, asesor: a.asesor,                 nombre: m.nombre || null, ultimo_mensaje: m.texto || null, ultimo_ts: m.timestamp || 0 }      }).sort((a, b) => b.ultimo_ts - a.ultimo_ts)        .slice(offset, offset + limit)      // Enriquecer con nombres desde clientes      const toTel = c => (c?.length === 12 && c?.startsWith("57")) ? c.slice(2) : c      const tels  = [...new Set(result.map(c => toTel(c.contacto)).filter(Boolean))]      const { data: clientes } = await supabase.from("clientes").select("telefono, nombre").in("telefono", tels)      const clienteMap = Object.fromEntries((clientes || []).map(c => [c.telefono, c.nombre]))      return result.map(c => ({ ...c, nombre_cliente: clienteMap[toTel(c.contacto)] || null }))    } catch (e) {      return reply.code(500).send({ error: e.message })    }  })

  // GET /wa/conversaciones/resueltas — lista paginada de chats resueltos
  // ?offset=0&limit=20&asesor=nombre&busqueda=texto
  fastify.get('/wa/conversaciones/resueltas', async (req, reply) => {
    if (!supabase) return []
    const offset   = parseInt(req.query.offset) || 0
    const limit    = Math.min(parseInt(req.query.limit) || 20, 50)
    const asesor   = req.query.asesor    || null
    const busqueda = req.query.busqueda  || null
    try {
      const { data, error } = await supabase.rpc('wa_conversaciones_resueltas', {
        p_offset: offset, p_limit: limit, p_asesor: asesor, p_busqueda: busqueda
      })
      if (error) throw error
      if (!data?.length) return []
      // Enriquecer con nombres desde clientes
      const toTel = c => (c?.length === 12 && c?.startsWith('57')) ? c.slice(2) : c
      const tels  = [...new Set(data.map(c => toTel(c.contacto)).filter(Boolean))]
      const { data: clientes } = await supabase.from('clientes').select('telefono, nombre').in('telefono', tels)
      const clienteMap = Object.fromEntries((clientes || []).map(c => [c.telefono, c.nombre]))
      return data.map(c => ({ ...c, nombre_cliente: clienteMap[toTel(c.contacto)] || null }))
    } catch (e) {
      return reply.code(500).send({ error: e.message })
    }
  })

  // POST /wa/asignaciones/:numero/:contacto/reabrir — reabrir chat resuelto
  fastify.post('/wa/asignaciones/:numero/:contacto/reabrir', async (req, reply) => {
    const { numero, contacto: raw } = req.params
    const contacto = decodeURIComponent(raw)
    const { asesor } = req.body ?? {}
    if (!asesor) return reply.code(400).send({ error: 'asesor es requerido' })
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { error: e1 } = await supabase
      .from('asignaciones_wa').update({ estado: 'asignado', asesor })
      .eq('numero', numero).eq('contacto', contacto).eq('activo', true)
    if (e1) return reply.code(500).send({ error: e1.message })
    const ts = Math.floor(Date.now() / 1000)
    const texto = asesor + ' abrió la conversación'
    await supabase.from('mensajes_wa').insert({
      numero, contacto, nombre: null, texto, timestamp: ts,
      saliente: false, desde_telefono: false, tipo: 'sistema'
    })
    broadcast({ tipo: 'wa:estado',  numero, contacto, asesor, estado: 'asignado' })
    broadcast({ tipo: 'wa:mensaje', numero, sede: '', remitente: contacto, fromMe: false,
                pushName: null, texto, timestamp: ts, msgId: null, tipoMensaje: 'sistema' })
    return { ok: true }
  })

  // POST /wa/mensajes — enviar mensaje de texto
  fastify.post('/wa/mensajes', async (req, reply) => {
    const { numero, destinatario, texto, asesor, quoted } = req.body ?? {}
    if (!numero || !destinatario || !texto) {
      return reply.code(400).send({ error: 'numero, destinatario y texto son requeridos' })
    }
    try {
      const result = await enviarMensaje(numero, destinatario, texto, asesor || null, quoted || null)
      return { ok: true, msgId: result?.msgId || null }
    } catch (e) {
      return reply.code(503).send({ error: e.message })
    }
  })

  // POST /wa/mensajes/media — enviar archivo (imagen, audio, documento, video)
  // multipart: numero, destinatario, asesor (optional), caption (optional) + file
  fastify.post('/wa/mensajes/media', async (req, reply) => {
    try {
      const parts   = req.parts()
      const fields  = {}
      let fileBuffer = null
      let mimetype   = null
      let fileName   = null

      for await (const part of parts) {
        if (part.file) {
          const chunks = []
          for await (const chunk of part.file) chunks.push(chunk)
          fileBuffer = Buffer.concat(chunks)
          mimetype   = part.mimetype || 'application/octet-stream'
          fileName   = part.filename || 'archivo'
        } else {
          fields[part.fieldname] = part.value
        }
      }

      const { numero, destinatario, asesor, caption } = fields
      if (!numero || !destinatario || !fileBuffer)
        return reply.code(400).send({ error: 'numero, destinatario y archivo son requeridos' })

      const result = await enviarMedia(numero, destinatario, fileBuffer, mimetype, fileName, caption || null, asesor || null)
      return result
    } catch (e) {
      return reply.code(503).send({ error: e.message })
    }
  })

  // ── Respuestas rápidas ────────────────────────────────────────────────────

  // GET /wa/respuestas-rapidas — listar todas las activas
  fastify.get('/wa/respuestas-rapidas', async (req, reply) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('respuestas_rapidas')
      .select('id, titulo, texto, media_url, media_tipo, media_nombre')
      .eq('activo', true)
      .order('titulo', { ascending: true })
    if (error) return reply.code(500).send({ error: error.message })
    return data || []
  })

  // Helper — subir media de una RR a Storage
  async function _subirRRMedia(buffer, mimetype, id) {
    const base = (mimetype || '').split(';')[0].trim()
    const extMap = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif',
      'video/mp4':'mp4','video/3gpp':'3gp','audio/ogg':'ogg','audio/mpeg':'mp3',
      'audio/mp4':'m4a','audio/webm':'webm','application/pdf':'pdf' }
    const ext  = extMap[base] || 'bin'
    const tipo = base.startsWith('image/') ? 'imagen' : base.startsWith('video/') ? 'video'
               : base.startsWith('audio/') ? 'audio' : 'documento'
    const storagePath = `respuestas-rapidas/${id}.${ext}`
    const { error } = await supabase.storage.from('wa-media').upload(storagePath, buffer, { contentType: base, upsert: true })
    if (error) throw new Error('Upload error: ' + error.message)
    const { data: urlData } = supabase.storage.from('wa-media').getPublicUrl(storagePath)
    const raw = urlData?.publicUrl || null
    const url = raw ? raw.replace('http://localhost:8000', 'https://supabase.everest-central.com') : null
    return { url, tipo }
  }

  // Helper — parsear body (multipart o JSON)
  async function _parseRRBody(req) {
    if (req.isMultipart()) {
      const fields = {}
      let fileBuffer = null, mimetype = null, fileName = null
      for await (const part of req.parts()) {
        if (part.file) {
          const chunks = []
          for await (const chunk of part.file) chunks.push(chunk)
          fileBuffer = Buffer.concat(chunks)
          mimetype   = part.mimetype || 'application/octet-stream'
          fileName   = part.filename || 'archivo'
        } else { fields[part.fieldname] = part.value }
      }
      return { ...fields, fileBuffer, mimetype, fileName }
    }
    return req.body ?? {}
  }

  // POST /wa/respuestas-rapidas — crear
  fastify.post('/wa/respuestas-rapidas', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { titulo, texto, fileBuffer, mimetype, fileName } = await _parseRRBody(req)
    if (!titulo?.trim() || !texto?.trim())
      return reply.code(400).send({ error: 'titulo y texto son requeridos' })
    const { data, error } = await supabase
      .from('respuestas_rapidas')
      .insert({ titulo: titulo.trim(), texto: texto.trim() })
      .select('id, titulo, texto, media_url, media_tipo, media_nombre')
      .single()
    if (error) return reply.code(500).send({ error: error.message })
    if (fileBuffer) {
      try {
        const { url, tipo } = await _subirRRMedia(fileBuffer, mimetype, data.id)
        await supabase.from('respuestas_rapidas').update({ media_url: url, media_tipo: tipo, media_nombre: fileName }).eq('id', data.id)
        data.media_url = url; data.media_tipo = tipo; data.media_nombre = fileName
      } catch (e) { console.error('[WA RR] Error media:', e.message) }
    }
    broadcast({ tipo: 'wa:rr_update' })
    return data
  })

  // PUT /wa/respuestas-rapidas/:id — editar
  fastify.put('/wa/respuestas-rapidas/:id', async (req, reply) => {
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const id = parseInt(req.params.id)
    const { titulo, texto, fileBuffer, mimetype, fileName } = await _parseRRBody(req)
    if (!titulo?.trim() || !texto?.trim())
      return reply.code(400).send({ error: 'titulo y texto son requeridos' })
    const updates = { titulo: titulo.trim(), texto: texto.trim() }
    if (fileBuffer) {
      try {
        const { url, tipo } = await _subirRRMedia(fileBuffer, mimetype, id)
        updates.media_url = url; updates.media_tipo = tipo; updates.media_nombre = fileName
      } catch (e) { console.error('[WA RR] Error media:', e.message) }
    }
    const { data, error } = await supabase
      .from('respuestas_rapidas').update(updates).eq('id', id)
      .select('id, titulo, texto, media_url, media_tipo, media_nombre').single()
    if (error) return reply.code(500).send({ error: error.message })
    broadcast({ tipo: 'wa:rr_update' })
    return data
  })

  // DELETE /wa/respuestas-rapidas/:id/media — quitar solo el adjunto
  fastify.delete('/wa/respuestas-rapidas/:id/media', async (req, reply) => {
    const id = parseInt(req.params.id)
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { data: rr } = await supabase.from('respuestas_rapidas').select('media_url').eq('id', id).single()
    if (rr?.media_url) {
      const marker = '/object/public/wa-media/'
      const storagePath = rr.media_url.includes(marker) ? rr.media_url.split(marker)[1] : null
      if (storagePath) await supabase.storage.from('wa-media').remove([storagePath])
    }
    await supabase.from('respuestas_rapidas').update({ media_url: null, media_tipo: null, media_nombre: null }).eq('id', id)
    broadcast({ tipo: 'wa:rr_update' })
    return { ok: true }
  })

  // DELETE /wa/respuestas-rapidas/:id — eliminar (soft delete)
  fastify.delete('/wa/respuestas-rapidas/:id', async (req, reply) => {
    const id = parseInt(req.params.id)
    if (!supabase) return reply.code(503).send({ error: 'Supabase no disponible' })
    const { error } = await supabase
      .from('respuestas_rapidas')
      .update({ activo: false })
      .eq('id', id)
    if (error) return reply.code(500).send({ error: error.message })
    broadcast({ tipo: 'wa:rr_update' })
    return { ok: true }
  })

  // DELETE /wa/mensajes/:numero/:contacto/:msgId — eliminar mensaje (WA + Supabase)
  fastify.delete('/wa/mensajes/:numero/:contacto/:msgId', async (req, reply) => {
    const { numero, msgId } = req.params
    const contacto = decodeURIComponent(req.params.contacto)
    if (!numero || !contacto || !msgId)
      return reply.code(400).send({ error: 'numero, contacto y msgId son requeridos' })
    try {
      await eliminarMensaje(numero, msgId, contacto)
      broadcast({ tipo: 'wa:msg_eliminado', numero, contacto, msgId })
      return { ok: true }
    } catch (e) {
      return reply.code(503).send({ error: e.message })
    }
  })

  // PATCH /wa/mensajes/:numero/:contacto/:msgId — editar mensaje
  fastify.patch('/wa/mensajes/:numero/:contacto/:msgId', async (req, reply) => {
    const { numero, msgId } = req.params
    const contacto = decodeURIComponent(req.params.contacto)
    const { texto, asesor } = req.body ?? {}
    if (!texto?.trim()) return reply.code(400).send({ error: 'texto es requerido' })
    try {
      await editarMensaje(numero, msgId, contacto, texto.trim(), asesor || null)
      broadcast({ tipo: 'wa:msg_editado', numero, contacto, msgId, texto: texto.trim() })
      return { ok: true }
    } catch (e) {
      return reply.code(503).send({ error: e.message })
    }
  })
}
