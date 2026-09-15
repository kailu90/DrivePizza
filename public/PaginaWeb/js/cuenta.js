/* ============================================================
   Drive Pizza — Vista Mi Cuenta (auth-aware)
   ============================================================ */

import { getSession, getCliente, clearClienteCache, registrar, iniciarSesion, cerrarSesion } from './auth.js';
import { initVerificacionView } from './verificacion.js';

/* ── SVGs ─────────────────────────────────────────────────── */
const CHEVRON = `<svg class="pw-cuenta-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

const AVATAR_SVG = `<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/></svg>`;

const AVATAR_LG_SVG = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-1a8 8 0 0116 0v1"/></svg>`;

const EXIT_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

const BACK_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

/* ── Menú de accesos rápidos ─────────────────────────────── */
const MENU_ITEMS = [
  {
    id: 'pedidos',
    titulo: 'Mis pedidos',
    sub: 'Consulta tu historial y detalles',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="17" x2="13" y2="17"/></svg>`,
  },
  {
    id: 'direcciones',
    titulo: 'Mis direcciones',
    sub: 'Gestiona tus direcciones guardadas',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
  },
  {
    id: 'favoritos',
    titulo: 'Favoritos',
    sub: 'Tus productos favoritos',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>`,
  },
  {
    id: 'promos',
    titulo: 'Promociones y beneficios',
    sub: 'Descubre ofertas exclusivas',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  },
  {
    id: 'ayuda',
    titulo: 'Ayuda',
    sub: 'Preguntas frecuentes y soporte',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none"/></svg>`,
  },
];

/* ── Helpers ─────────────────────────────────────────────── */
function _showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function _tradError(msg = '') {
  if (/invalid.*credentials|wrong.*password/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email.*already|already.*registered/i.test(msg)) return 'Este correo ya tiene una cuenta registrada.';
  if (/invalid.*email/i.test(msg)) return 'El correo electrónico no es válido.';
  if (/password.*short|weak.*password/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/network|fetch/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  return 'Algo salió mal. Intenta de nuevo.';
}

/* ── Sincroniza localStorage con datos del cliente ───────── */
function _syncLocalStorage(cliente) {
  if (!cliente) return;
  if (cliente.nombre)   localStorage.setItem('dp_nombre',   cliente.nombre);
  if (cliente.telefono) localStorage.setItem('dp_telefono', cliente.telefono);
}

/* ── Render: no hay sesión ───────────────────────────────── */
function _renderNoSesion(wrap, cbs) {
  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-panel">
        <div class="pw-auth-panel-avatar">${AVATAR_LG_SVG}</div>
        <h2 class="pw-cuenta-titulo">Mi cuenta</h2>
        <p class="pw-auth-panel-desc">
          Inicia sesión para ver tus pedidos, guardar tus direcciones favoritas
          y acceder a beneficios exclusivos.
        </p>
        <button class="pw-btn-primary" id="btn-auth-login">Iniciar sesión</button>
        <button class="pw-btn-outline" id="btn-auth-registro">Crear cuenta</button>
      </div>
    </div>
  `;

  wrap.querySelector('#btn-auth-login').addEventListener('click', () => _renderFormLogin(wrap, cbs));
  wrap.querySelector('#btn-auth-registro').addEventListener('click', () => _renderFormRegistro(wrap, cbs));
}

/* ── Render: formulario login ────────────────────────────── */
function _renderFormLogin(wrap, cbs) {
  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-form-header">
        <button class="pw-auth-back-btn" id="btn-auth-volver">${BACK_SVG}</button>
        <h2 class="pw-cuenta-titulo">Iniciar sesión</h2>
      </div>
      <form class="pw-auth-form" id="form-login" novalidate>
        <div class="pw-auth-field">
          <input type="email" id="auth-email" class="pw-auth-input"
            placeholder="Correo electrónico" autocomplete="email" required>
        </div>
        <div class="pw-auth-field">
          <input type="password" id="auth-password" class="pw-auth-input"
            placeholder="Contraseña" autocomplete="current-password" required>
        </div>
        <p class="pw-auth-error" id="auth-error" hidden></p>
        <button type="submit" class="pw-btn-primary" id="btn-login-submit">Iniciar sesión</button>
      </form>
      <p class="pw-auth-switch">
        ¿No tienes cuenta?
        <button class="pw-auth-link" id="btn-ir-registro">Crear cuenta</button>
      </p>
    </div>
  `;

  wrap.querySelector('#btn-auth-volver').addEventListener('click', () => _renderNoSesion(wrap, cbs));
  wrap.querySelector('#btn-ir-registro').addEventListener('click', () => _renderFormRegistro(wrap, cbs));

  wrap.querySelector('#form-login').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = wrap.querySelector('#auth-email').value.trim();
    const password = wrap.querySelector('#auth-password').value;
    const errEl    = wrap.querySelector('#auth-error');
    const btn      = wrap.querySelector('#btn-login-submit');

    btn.disabled = true;
    btn.textContent = 'Iniciando...';
    errEl.hidden = true;

    try {
      await iniciarSesion({ email, password });
      const cliente = await getCliente();
      _syncLocalStorage(cliente);
      _renderPerfil(wrap, cliente, cbs);
    } catch (err) {
      _showError(errEl, _tradError(err.message));
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
    }
  });
}

/* ── Render: formulario registro ─────────────────────────── */
function _renderFormRegistro(wrap, cbs) {
  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-form-header">
        <button class="pw-auth-back-btn" id="btn-auth-volver">${BACK_SVG}</button>
        <h2 class="pw-cuenta-titulo">Crear cuenta</h2>
      </div>
      <form class="pw-auth-form" id="form-registro" novalidate>
        <div class="pw-auth-field">
          <input type="text" id="auth-nombre" class="pw-auth-input"
            placeholder="Tu nombre" autocomplete="name" required>
        </div>
        <div class="pw-auth-field">
          <input type="tel" id="auth-telefono" class="pw-auth-input"
            placeholder="Teléfono (10 dígitos)" autocomplete="tel" inputmode="tel" required>
        </div>
        <div class="pw-auth-field">
          <input type="email" id="auth-email" class="pw-auth-input"
            placeholder="Correo electrónico" autocomplete="email" required>
        </div>
        <div class="pw-auth-field">
          <input type="password" id="auth-password" class="pw-auth-input"
            placeholder="Contraseña (mín. 6 caracteres)" autocomplete="new-password" required minlength="6">
        </div>
        <p class="pw-auth-error" id="auth-error" hidden></p>
        <button type="submit" class="pw-btn-primary" id="btn-registro-submit">Crear cuenta</button>
      </form>
      <p class="pw-auth-switch">
        ¿Ya tienes cuenta?
        <button class="pw-auth-link" id="btn-ir-login">Iniciar sesión</button>
      </p>
    </div>
  `;

  wrap.querySelector('#btn-auth-volver').addEventListener('click', () => _renderNoSesion(wrap, cbs));
  wrap.querySelector('#btn-ir-login').addEventListener('click', () => _renderFormLogin(wrap, cbs));

  wrap.querySelector('#form-registro').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre   = wrap.querySelector('#auth-nombre').value.trim();
    const telefono = wrap.querySelector('#auth-telefono').value.replace(/\D/g, '').slice(-10);
    const email    = wrap.querySelector('#auth-email').value.trim();
    const password = wrap.querySelector('#auth-password').value;
    const errEl    = wrap.querySelector('#auth-error');
    const btn      = wrap.querySelector('#btn-registro-submit');

    if (!nombre)             { _showError(errEl, 'Ingresa tu nombre.');                     return; }
    if (telefono.length < 10) { _showError(errEl, 'Ingresa un teléfono válido de 10 dígitos.'); return; }
    if (!email)              { _showError(errEl, 'Ingresa tu correo electrónico.');          return; }
    if (password.length < 6) { _showError(errEl, 'La contraseña debe tener al menos 6 caracteres.'); return; }

    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';
    errEl.hidden = true;

    try {
      const authData = await registrar({ nombre, telefono, email, password });

      // Si requiere confirmación de email
      if (!authData.session) {
        _renderVerificacion(wrap, email, cbs);
        return;
      }

      localStorage.setItem('dp_nombre',   nombre);
      localStorage.setItem('dp_telefono', telefono);

      const cliente = await getCliente();
      _renderPerfil(wrap, cliente, cbs);
    } catch (err) {
      _showError(errEl, _tradError(err.message));
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
  });
}

/* ── Render: pendiente verificación de email ─────────────── */
function _renderVerificacion(wrap, email, cbs) {
  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-verify">
        <div class="pw-auth-verify-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h2 class="pw-cuenta-titulo">Verifica tu correo</h2>
        <p class="pw-auth-panel-desc">
          Enviamos un enlace a <strong>${email}</strong>.
          Revisa tu bandeja de entrada y da clic en el enlace para activar tu cuenta.
        </p>
        <button class="pw-btn-outline" id="btn-verify-login">Ya verifiqué — Iniciar sesión</button>
      </div>
    </div>
  `;

  wrap.querySelector('#btn-verify-login').addEventListener('click', () => _renderFormLogin(wrap, cbs));
}

/* ── Render: perfil (sesión activa) ──────────────────────── */
function _renderPerfil(wrap, cliente, { onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu } = {}) {
  const nombre     = cliente?.nombre     || localStorage.getItem('dp_nombre') || 'amigo';
  const email      = cliente?.email      || '';
  const telefono   = cliente?.telefono   || '';
  const verificado = cliente?.verificado ?? false;

  const telBadge = telefono
    ? verificado
      ? `<span class="pw-cuenta-tel-row">
           ${telefono}
           <span class="pw-cuenta-verified-badge">
             <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="#314B27"/><polyline points="4.5,8.5 7,11 11.5,5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
             Verificado
           </span>
         </span>`
      : `<span class="pw-cuenta-tel-row">
           ${telefono}
           <button class="pw-cuenta-verify-btn" id="btn-perfil-verificar">Verificar →</button>
         </span>`
    : '';

  const itemsHTML = MENU_ITEMS.map(item => `
    <button class="pw-cuenta-menu-item" data-cuenta-action="${item.id}">
      <div class="pw-cuenta-menu-icon">${item.icon}</div>
      <div class="pw-cuenta-menu-text">
        <span class="pw-cuenta-menu-titulo">${item.titulo}</span>
        <span class="pw-cuenta-menu-sub">${item.sub}</span>
      </div>
      ${CHEVRON}
    </button>
  `).join('');

  wrap.innerHTML = `
    <div class="pw-cuenta-inner">

      <div class="pw-cuenta-perfil">
        <div class="pw-cuenta-avatar">${AVATAR_SVG}</div>
        <div class="pw-cuenta-perfil-info">
          <h2 class="pw-cuenta-titulo">Mi cuenta</h2>
          <p class="pw-cuenta-hola">Hola, ${nombre} <span aria-hidden="true">👋</span></p>
          ${email ? `<span class="pw-cuenta-sub">${email}</span>` : ''}
          ${telBadge}
        </div>
      </div>

      <div class="pw-cuenta-cta-card">
        <div class="pw-cuenta-cta-text">
          <p class="pw-cuenta-cta-titulo">¿Listo para tu próximo pedido?</p>
          <p class="pw-cuenta-cta-sub">Pide de nuevo en segundos</p>
          <button class="pw-cuenta-cta-btn" id="btn-cuenta-pedir">Pedir de nuevo</button>
        </div>
        <img class="pw-cuenta-cta-img" src="../Imagenes/productos/pizza-suprema-pepperoni.jpg" alt="" aria-hidden="true">
      </div>

      <h3 class="pw-cuenta-section-title">Accesos rápidos</h3>

      <div class="pw-cuenta-menu-list">
        ${itemsHTML}
        <div class="pw-cuenta-menu-separator"></div>
        <button class="pw-cuenta-menu-item pw-cuenta-menu-item--danger" id="btn-cuenta-salir">
          <div class="pw-cuenta-menu-icon pw-cuenta-menu-icon--danger">${EXIT_SVG}</div>
          <div class="pw-cuenta-menu-text">
            <span class="pw-cuenta-menu-titulo">Cerrar sesión</span>
          </div>
          ${CHEVRON}
        </button>
      </div>

    </div>
  `;

  // Accesos rápidos
  wrap.querySelector('[data-cuenta-action="pedidos"]')?.addEventListener('click', () => onMisPedidos?.());
  wrap.querySelector('[data-cuenta-action="direcciones"]')?.addEventListener('click', () => onMisDirecciones?.());
  wrap.querySelector('[data-cuenta-action="favoritos"]')?.addEventListener('click', () => onFavoritos?.());

  wrap.querySelector('#btn-cuenta-pedir')?.addEventListener('click', () => onIrAlMenu?.());

  // Botón verificar teléfono (solo visible si no verificado)
  wrap.querySelector('#btn-perfil-verificar')?.addEventListener('click', () => {
    const tel = (cliente?.telefono || '').replace(/\D/g, '').slice(-10);
    if (!tel) return;
    initVerificacionView(wrap, tel, {
      onVerificado: clienteActualizado => {
        _renderPerfil(wrap, clienteActualizado, { onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu });
      },
      onCancelar: () => {
        _renderPerfil(wrap, cliente, { onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu });
      },
    });
  });

  wrap.querySelector('#btn-cuenta-salir')?.addEventListener('click', async () => {
    await cerrarSesion();
    ['dp_sede', 'dp_direccion', 'dp_nombre', 'dp_telefono'].forEach(k => localStorage.removeItem(k));
    _renderNoSesion(wrap, { onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu });
  });
}

/* ── Render: completar perfil (usuario auth sin fila en clientes) ── */
function _renderCompletarPerfil(wrap, session, cbs) {
  const emailSugerido = session.user.email || '';

  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-form-header">
        <h2 class="pw-cuenta-titulo">Completa tu perfil</h2>
      </div>
      <p class="pw-auth-panel-desc" style="text-align:left;margin-bottom:.5rem">
        Tu cuenta existe pero falta vincularla. Ingresa tu nombre y teléfono para continuar.
      </p>
      <form class="pw-auth-form" id="form-completar" novalidate>
        <div class="pw-auth-field">
          <input type="text" id="auth-nombre" class="pw-auth-input"
            placeholder="Tu nombre" autocomplete="name" required>
        </div>
        <div class="pw-auth-field">
          <input type="tel" id="auth-telefono" class="pw-auth-input"
            placeholder="Teléfono (10 dígitos)" autocomplete="tel" inputmode="tel" required>
        </div>
        <p class="pw-auth-error" id="auth-error" hidden></p>
        <button type="submit" class="pw-btn-primary" id="btn-completar-submit">Guardar y continuar</button>
      </form>
    </div>
  `;

  wrap.querySelector('#form-completar').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre   = wrap.querySelector('#auth-nombre').value.trim();
    const telefono = wrap.querySelector('#auth-telefono').value.replace(/\D/g, '').slice(-10);
    const errEl    = wrap.querySelector('#auth-error');
    const btn      = wrap.querySelector('#btn-completar-submit');

    if (!nombre)              { _showError(errEl, 'Ingresa tu nombre.');                         return; }
    if (telefono.length < 10) { _showError(errEl, 'Ingresa un teléfono válido de 10 dígitos.'); return; }

    btn.disabled = true;
    btn.textContent = 'Guardando...';
    errEl.hidden = true;

    try {
      const { supabase } = await import('../../Api/supabaseConfig.js');
      const uid = session.user.id;

      // ¿ya existe cliente con este teléfono? → vincular
      const { data: existing } = await supabase
        .from('clientes').select('id').eq('telefono', telefono).maybeSingle();

      if (existing) {
        await supabase.from('clientes').update({ auth_uid: uid, nombre, email: emailSugerido })
          .eq('id', existing.id);
      } else {
        await supabase.from('clientes').insert({
          auth_uid: uid, nombre, telefono, email: emailSugerido,
        });
      }

      localStorage.setItem('dp_nombre',   nombre);
      localStorage.setItem('dp_telefono', telefono);

      clearClienteCache();
      const cliente = await getCliente();
      _renderPerfil(wrap, cliente, cbs);
    } catch (err) {
      _showError(errEl, _tradError(err.message));
      btn.disabled = false;
      btn.textContent = 'Guardar y continuar';
    }
  });
}

/* ── Entrada principal ───────────────────────────────────── */
export async function initCuentaView({ onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu } = {}) {
  const wrap = document.getElementById('cuenta-wrap');
  const cbs  = { onMisPedidos, onMisDirecciones, onFavoritos, onIrAlMenu };

  const session = await getSession();
  if (!session) {
    _renderNoSesion(wrap, cbs);
    return;
  }

  const cliente = await getCliente();

  // Usuario autenticado pero sin fila en clientes (ej: agente CC)
  if (!cliente) {
    _renderCompletarPerfil(wrap, session, cbs);
    return;
  }

  _syncLocalStorage(cliente);
  _renderPerfil(wrap, cliente, cbs);
}
