/* ============================================================
   Drive Pizza — Módulo de autenticación web (Supabase Auth)
   ============================================================ */

import { supabase } from '../../Api/supabaseConfig.js';

let _clienteCache = null;

/** Devuelve la sesión activa o null */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/** Devuelve la fila de `clientes` vinculada al usuario logueado, o null */
export async function getCliente() {
  if (_clienteCache) return _clienteCache;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, email, verificado, created_at')
    .eq('auth_uid', session.user.id)
    .maybeSingle();
  _clienteCache = data;
  return data;
}

export function clearClienteCache() {
  _clienteCache = null;
}

/**
 * Registro: crea usuario en Supabase Auth y vincula / crea fila en `clientes`.
 * Retorna { user, session } — session puede ser null si se requiere confirmación de email.
 */
export async function registrar({ nombre, telefono, email, password }) {
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) throw authError;

  const uid = authData.user.id;

  // Buscar cliente existente por teléfono (puede tener historial de pedidos CC)
  const { data: existing } = await supabase
    .from('clientes')
    .select('id, nombre')
    .eq('telefono', telefono)
    .maybeSingle();

  if (existing) {
    await supabase.from('clientes').update({
      auth_uid: uid,
      email,
      ...(nombre ? { nombre } : {}),
    }).eq('id', existing.id);
  } else {
    await supabase.from('clientes').insert({
      auth_uid: uid,
      nombre,
      telefono,
      email,
    });
  }

  _clienteCache = null;
  return authData;
}

/** Login con email y contraseña */
export async function iniciarSesion({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  _clienteCache = null;
  return data;
}

/** Cierra la sesión actual */
export async function cerrarSesion() {
  _clienteCache = null;
  return supabase.auth.signOut();
}

/** Suscribirse a cambios de sesión (login / logout) */
export function onAuthChange(cb) {
  supabase.auth.onAuthStateChange((event, session) => {
    _clienteCache = null;
    cb(event, session);
  });
}
