/* ============================================================
   Drive Pizza — Vista Mis Direcciones
   ============================================================ */

const LS_KEY = 'dp_user_direcciones';

const ALIAS_ICONS = {
  home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  work: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg>`,
  heart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>`,
  star:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
};

const ICON_DEL = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
const ICON_EDIT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

function getDirs() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}

function saveDirs(dirs) {
  localStorage.setItem(LS_KEY, JSON.stringify(dirs));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function dirCard(d) {
  const icon = ALIAS_ICONS[d.icono] || ALIAS_ICONS.home;
  return `
    <div class="pw-dirs-card" data-id="${d.id}">
      <div class="pw-dirs-card-icon">${icon}</div>
      <div class="pw-dirs-card-info">
        <div class="pw-dirs-card-head">
          <span class="pw-dirs-alias">${d.alias || 'Mi direcci\u00f3n'}</span>
          ${d.predeterminada ? '<span class="pw-dirs-badge-principal">Principal</span>' : ''}
        </div>
        <p class="pw-dirs-dir">${d.direccion}</p>
        <p class="pw-dirs-sub">${[d.barrio, d.ciudad].filter(Boolean).join(' \u00b7 ')}</p>
        ${d.telefono ? `<p class="pw-dirs-tel">${d.telefono}</p>` : ''}
        ${!d.predeterminada ? `
          <label class="pw-dirs-default-label">
            <input type="checkbox" class="js-dirs-default" data-id="${d.id}">
            Establecer como principal
          </label>` : ''}
      </div>
      <div class="pw-dirs-card-actions">
        <button class="pw-dirs-btn-edit js-dirs-edit" data-id="${d.id}" aria-label="Editar">${ICON_EDIT}</button>
        <button class="pw-dirs-btn-del js-dirs-del" data-id="${d.id}" aria-label="Eliminar">${ICON_DEL}</button>
      </div>
    </div>`;
}

function formHTML(d = {}) {
  return `
    <div class="pw-dirs-form" id="dirs-form">
      <h4 class="pw-dirs-form-title">${d.id ? 'Editar direcci\u00f3n' : 'Nueva direcci\u00f3n'}</h4>
      <input type="hidden" id="df-id" value="${d.id || ''}">
      <div class="pw-dirs-form-icono-pick">
        ${Object.keys(ALIAS_ICONS).map(k => `
          <label class="pw-dirs-ico-opt${(d.icono || 'home') === k ? ' selected' : ''}">
            <input type="radio" name="df-icono" value="${k}" ${(d.icono || 'home') === k ? 'checked' : ''}>
            ${ALIAS_ICONS[k]}
          </label>`).join('')}
      </div>
      <div class="pw-input-group" style="margin-bottom:.75rem">
        <div class="pw-input-row">
          <input class="pw-group-input" id="df-alias" type="text"
                 placeholder="Nombre (Ej: Casa, Oficina)" maxlength="30" value="${d.alias || ''}">
        </div>
        <div class="pw-input-row">
          <input class="pw-group-input" id="df-dir" type="text"
                 placeholder="Direcci\u00f3n *" value="${d.direccion || ''}">
        </div>
        <div class="pw-input-row">
          <input class="pw-group-input" id="df-barrio" type="text"
                 placeholder="Barrio" value="${d.barrio || ''}">
        </div>
        <div class="pw-input-row">
          <input class="pw-group-input" id="df-ciudad" type="text"
                 placeholder="Ciudad" value="${d.ciudad || 'Bucaramanga'}">
        </div>
        <div class="pw-input-row">
          <input class="pw-group-input" id="df-tel" type="tel" inputmode="numeric"
                 maxlength="10" placeholder="Tel\u00e9fono (opcional)" value="${d.telefono || ''}">
        </div>
      </div>
      <label class="pw-dirs-form-check">
        <input type="checkbox" id="df-principal" ${d.predeterminada ? 'checked' : ''}>
        Establecer como principal
      </label>
      <div class="pw-dirs-form-btns">
        <button class="pw-btn-secondary" id="btn-dirs-cancel">Cancelar</button>
        <button class="pw-btn-primary" id="btn-dirs-save">Guardar</button>
      </div>
    </div>`;
}

export function initMisDireccionesView({ onVolver } = {}) {
  const wrap = document.getElementById('direcciones-wrap');

  wrap.innerHTML = `
    <div class="pw-subview-wrap">
      <div class="pw-subview-header">
        <button class="pw-subview-back" id="btn-dirs-back" aria-label="Volver">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span class="pw-subview-title">Mis direcciones</span>
        <button class="pw-subview-action" id="btn-dirs-agregar">+ Agregar</button>
      </div>
      <div class="pw-subview-inner" id="dirs-inner"></div>
    </div>`;

  wrap.querySelector('#btn-dirs-back').addEventListener('click', () => onVolver?.());
  wrap.querySelector('#btn-dirs-agregar').addEventListener('click', () => mostrarForm());

  render();

  function render() {
    const dirs  = getDirs();
    const inner = document.getElementById('dirs-inner');
    inner.innerHTML = '';

    if (!dirs.length) {
      inner.innerHTML = `
        <div class="pw-subview-info-card">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--dp-green)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <h3>Tus direcciones guardadas</h3>
          <p>Guarda tus direcciones favoritas para pedir m\u00e1s r\u00e1pido.</p>
        </div>
        <button class="pw-btn-primary" id="btn-dirs-primera">+ Agregar mi primera direcci\u00f3n</button>`;
      inner.querySelector('#btn-dirs-primera')?.addEventListener('click', () => mostrarForm());
      return;
    }

    const list = document.createElement('div');
    list.className = 'pw-dirs-list';
    list.innerHTML  = dirs.map(dirCard).join('');
    inner.appendChild(list);

    list.querySelectorAll('.js-dirs-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = getDirs().find(x => x.id === btn.dataset.id);
        if (d) mostrarForm(d);
      });
    });

    list.querySelectorAll('.js-dirs-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.pw-dirs-card');
        if (card.classList.contains('pw-dirs-card--confirm')) {
          saveDirs(getDirs().filter(x => x.id !== btn.dataset.id));
          render();
        } else {
          card.classList.add('pw-dirs-card--confirm');
          btn.textContent = 'Confirmar';
          setTimeout(() => {
            if (card.classList.contains('pw-dirs-card--confirm')) {
              card.classList.remove('pw-dirs-card--confirm');
              btn.innerHTML = ICON_DEL;
            }
          }, 3000);
        }
      });
    });

    list.querySelectorAll('.js-dirs-default').forEach(chk => {
      chk.addEventListener('change', () => {
        saveDirs(getDirs().map(x => ({ ...x, predeterminada: x.id === chk.dataset.id })));
        render();
      });
    });

    const cta = document.createElement('div');
    cta.className = 'pw-dirs-cta-bottom';
    cta.innerHTML = `
      <p>\u00bfTienes una nueva direcci\u00f3n?</p>
      <button class="pw-btn-secondary" id="btn-dirs-otra">+ Agregar direcci\u00f3n</button>`;
    inner.appendChild(cta);
    cta.querySelector('#btn-dirs-otra').addEventListener('click', () => mostrarForm());
  }

  function mostrarForm(d = null) {
    const inner = document.getElementById('dirs-inner');
    inner.innerHTML = formHTML(d || {});

    // Selector de icono visual
    inner.querySelectorAll('.pw-dirs-ico-opt input').forEach(radio => {
      radio.addEventListener('change', () => {
        inner.querySelectorAll('.pw-dirs-ico-opt').forEach(l => l.classList.remove('selected'));
        radio.closest('.pw-dirs-ico-opt').classList.add('selected');
      });
    });

    document.getElementById('btn-dirs-cancel').addEventListener('click', render);

    document.getElementById('btn-dirs-save').addEventListener('click', () => {
      const dirVal = document.getElementById('df-dir').value.trim();
      if (!dirVal) {
        document.getElementById('df-dir').classList.add('pw-input-error');
        return;
      }
      const icono    = inner.querySelector('input[name="df-icono"]:checked')?.value || 'home';
      const alias    = document.getElementById('df-alias').value.trim() || 'Mi direcci\u00f3n';
      const barrio   = document.getElementById('df-barrio').value.trim();
      const ciudad   = document.getElementById('df-ciudad').value.trim() || 'Bucaramanga';
      const telefono = document.getElementById('df-tel').value.replace(/\D/g, '').slice(-10);
      const principal = document.getElementById('df-principal').checked;
      const id       = document.getElementById('df-id').value;

      let dirs = getDirs();
      if (id) {
        dirs = dirs.map(x => {
          if (x.id === id) return { ...x, alias, icono, direccion: dirVal, barrio, ciudad, telefono, predeterminada: principal || x.predeterminada };
          return principal ? { ...x, predeterminada: false } : x;
        });
      } else {
        if (principal) dirs = dirs.map(x => ({ ...x, predeterminada: false }));
        dirs.push({ id: genId(), alias, icono, direccion: dirVal, barrio, ciudad, telefono, predeterminada: principal || !dirs.length });
      }
      saveDirs(dirs);
      render();
    });
  }
}
