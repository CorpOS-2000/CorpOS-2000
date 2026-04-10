/**
 * In-app text prompt — Electron may disable window.prompt(); use this instead.
 */

function ensurePromptOverlay() {
  let overlay = document.getElementById('corpos-prompt-dialog');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'corpos-prompt-dialog';
  overlay.className = 'corpos-prompt is-hidden';
  overlay.innerHTML = `
    <div class="corpos-prompt__panel" role="dialog" aria-modal="true" aria-labelledby="corpos-prompt-title">
      <div class="corpos-prompt__titlebar">
        <span class="corpos-prompt__title" id="corpos-prompt-title">CorpOS</span>
      </div>
      <div class="corpos-prompt__body">
        <label class="corpos-prompt__label" id="corpos-prompt-label" for="corpos-prompt-input">Name:</label>
        <input type="text" id="corpos-prompt-input" class="corpos-prompt__input" autocomplete="off" spellcheck="false" />
      </div>
      <div class="corpos-prompt__actions">
        <button type="button" class="corpos-prompt__btn corpos-prompt__btn--primary" data-prompt-ok>OK</button>
        <button type="button" class="corpos-prompt__btn" data-prompt-cancel>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * @param {{ title?: string, label?: string, defaultValue?: string }} opts
 * @returns {Promise<string | null>} trimmed string, or null if cancelled
 */
export function showCorpOsPrompt(opts = {}) {
  const title = opts.title || 'CorpOS';
  const label = opts.label || 'Enter text:';
  const defaultValue = opts.defaultValue ?? '';

  return new Promise((resolve) => {
    const overlay = ensurePromptOverlay();
    const titleEl = overlay.querySelector('#corpos-prompt-title');
    const labelEl = overlay.querySelector('#corpos-prompt-label');
    const input = overlay.querySelector('#corpos-prompt-input');
    const ok = overlay.querySelector('[data-prompt-ok]');
    const cancel = overlay.querySelector('[data-prompt-cancel]');
    if (!input || !ok || !cancel) {
      resolve(null);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (labelEl) labelEl.textContent = label;
    input.value = defaultValue;
    overlay.classList.remove('is-hidden');

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('is-hidden');
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      input.removeEventListener('keydown', onKey);
      resolve(val);
    };

    const onOk = () => {
      finish(String(input.value ?? '').trim());
    };
    const onCancel = () => finish(null);
    const onOverlay = (e) => {
      if (e.target === overlay) onCancel();
    };
    const onKey = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onOk();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
    input.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      try {
        input.focus();
        input.select();
      } catch {
        /* ignore */
      }
    });
  });
}
