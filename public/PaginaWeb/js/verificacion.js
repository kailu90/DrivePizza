/* ============================================================
   Drive Pizza — Flujo de verificación de teléfono por OTP
   ============================================================ */
import { HETZNER_URL }              from '../../Api/config.js';
import { clearClienteCache, getCliente } from './auth.js';

/**
 * Renderiza el flujo de verificación OTP dentro de `wrap`.
 * Al completarse con éxito llama `onVerificado(cliente)`.
 * Al cancelar llama `onCancelar()`.
 */
export function initVerificacionView(wrap, telefono, { onVerificado, onCancelar } = {}) {
  _renderSolicitar(wrap, telefono, { onVerificado, onCancelar });
}

/* ── Paso 1: solicitar código ──────────────────────────────── */
function _renderSolicitar(wrap, telefono, cbs) {
  const telFmt = telefono.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-form-header">
        <button class="pw-auth-back-btn" id="btn-vrf-cancelar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 class="pw-cuenta-titulo">Verificar número</h2>
      </div>
      <div class="pw-vrf-info">
        <div class="pw-vrf-info-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 .92h3a2 2 0 012 1.72c.16.96.4 1.9.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.3 1.85.54 2.81.7A2 2 0 0122 16.92z"/></svg>
        </div>
        <p class="pw-auth-panel-desc" style="text-align:left">
          Enviaremos un código de 6 dígitos a tu WhatsApp
          <strong>${telFmt}</strong>.
        </p>
      </div>
      <p class="pw-auth-error" id="vrf-error" hidden></p>
      <button class="pw-btn-primary" id="btn-vrf-enviar">Enviar código por WhatsApp</button>
    </div>`;

  wrap.querySelector('#btn-vrf-cancelar').addEventListener('click', () => cbs.onCancelar?.());

  wrap.querySelector('#btn-vrf-enviar').addEventListener('click', async () => {
    const btn   = wrap.querySelector('#btn-vrf-enviar');
    const errEl = wrap.querySelector('#vrf-error');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    errEl.hidden = true;

    try {
      const res = await fetch(`${HETZNER_URL}/web/verificar/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono }),
      });
      const json = await res.json();

      if (!res.ok) {
        errEl.textContent = json.error || 'No se pudo enviar el código.';
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Enviar código por WhatsApp';
        return;
      }

      if (json.yaVerificado) {
        // Ya estaba verificado (race condition) — refrescar y salir
        clearClienteCache();
        const cliente = await getCliente();
        cbs.onVerificado?.(cliente);
        return;
      }

      _renderConfirmar(wrap, telefono, cbs);
    } catch {
      errEl.textContent = 'Error de conexión. Intenta de nuevo.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Enviar código por WhatsApp';
    }
  });
}

/* ── Paso 2: ingresar código ───────────────────────────────── */
function _renderConfirmar(wrap, telefono, cbs) {
  const telFmt = telefono.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

  wrap.innerHTML = `
    <div class="pw-cuenta-inner">
      <div class="pw-auth-form-header">
        <button class="pw-auth-back-btn" id="btn-vrf-back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h2 class="pw-cuenta-titulo">Ingresa el código</h2>
      </div>
      <p class="pw-auth-panel-desc" style="text-align:left;margin-bottom:1rem">
        Enviamos un código a <strong>${telFmt}</strong> vía WhatsApp. Válido por 10 minutos.
      </p>
      <div class="pw-auth-field">
        <input type="text" id="vrf-codigo" class="pw-auth-input pw-vrf-codigo-input"
          inputmode="numeric" maxlength="6" placeholder="______" autocomplete="one-time-code">
      </div>
      <p class="pw-auth-error" id="vrf-error" hidden></p>
      <button class="pw-btn-primary" id="btn-vrf-confirmar">Verificar</button>
      <p class="pw-auth-switch">
        ¿No llegó el código?
        <button class="pw-auth-link" id="btn-vrf-reenviar">Reenviar</button>
      </p>
    </div>`;

  const input = wrap.querySelector('#vrf-codigo');
  // Auto-submit al completar 6 dígitos
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) confirmar();
  });

  wrap.querySelector('#btn-vrf-back').addEventListener('click',
    () => _renderSolicitar(wrap, telefono, cbs));

  wrap.querySelector('#btn-vrf-reenviar').addEventListener('click',
    () => _renderSolicitar(wrap, telefono, cbs));

  wrap.querySelector('#btn-vrf-confirmar').addEventListener('click', confirmar);

  async function confirmar() {
    const codigo = wrap.querySelector('#vrf-codigo').value.trim();
    const btn    = wrap.querySelector('#btn-vrf-confirmar');
    const errEl  = wrap.querySelector('#vrf-error');

    if (codigo.length !== 6) {
      errEl.textContent = 'Ingresa el código de 6 dígitos.';
      errEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Verificando...';
    errEl.hidden = true;

    try {
      const res = await fetch(`${HETZNER_URL}/web/verificar/confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono, codigo }),
      });
      const json = await res.json();

      if (!res.ok) {
        errEl.textContent = json.error || 'Código incorrecto.';
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Verificar';
        return;
      }

      // Éxito: refrescar cliente y notificar
      clearClienteCache();
      const cliente = await getCliente();
      cbs.onVerificado?.(cliente);
    } catch {
      errEl.textContent = 'Error de conexión. Intenta de nuevo.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Verificar';
    }
  }
}
