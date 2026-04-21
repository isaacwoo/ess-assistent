/* ========================================
   ESS ASSISTENT — App Initialization
   ======================================== */

const OLLAMA_BASE = 'http://localhost:11434';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initInput();
  initImageUpload();
  initModelSelect();
  initSettings();
  Storage.init();
});

/* --- Theme --- */
function initTheme() {
  const saved = localStorage.getItem('ess-theme') || 'dark';
  applyTheme(saved);

  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('ess-theme', next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const moonIcon = document.querySelector('.icon-moon');
  const sunIcon = document.querySelector('.icon-sun');
  if (theme === 'dark') {
    moonIcon.style.display = '';
    sunIcon.style.display = 'none';
  } else {
    moonIcon.style.display = 'none';
    sunIcon.style.display = '';
  }
}

/* --- Sidebar --- */
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const openBtn = document.getElementById('sidebar-open-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');

  closeBtn.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    openBtn.style.display = '';
  });

  openBtn.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    openBtn.style.display = 'none';
  });

  document.getElementById('new-chat-btn').addEventListener('click', () => {
    Storage.createSession();
  });
}

/* --- Input --- */
function initInput() {
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      Chat.send();
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const pos = input.selectionStart;
      input.value = input.value.slice(0, pos) + '\n' + input.value.slice(pos);
      input.selectionStart = input.selectionEnd = pos + 1;
      input.dispatchEvent(new Event('input'));
    }
  });

  sendBtn.addEventListener('click', () => Chat.send());

  document.getElementById('stop-btn').addEventListener('click', () => {
    Chat.stopGeneration();
  });
}

/* --- Image Upload --- */
function initImageUpload() {
  const imageInput   = document.getElementById('image-input');
  const imageBtn     = document.getElementById('image-btn');
  const removeBtn    = document.getElementById('image-remove-btn');
  const previewArea  = document.getElementById('image-preview-area');
  const thumb        = document.getElementById('image-preview-thumb');

  imageBtn.addEventListener('click', () => imageInput.click());

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files[0];
    if (!file) return;
    imageInput.value = '';
    try {
      const result = await resizeImageToBase64(file);
      Chat.setImage(result);
      thumb.src = result.dataUrl;
      previewArea.style.display = '';
      imageBtn.classList.add('has-image');
    } catch (e) {
      console.error('Image load failed:', e);
    }
  });

  removeBtn.addEventListener('click', () => {
    Chat.clearImage();
    thumb.src = '';
    previewArea.style.display = 'none';
    imageBtn.classList.remove('has-image');
  });
}

function resizeImageToBase64(file, maxSize = 1024) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) { height = Math.round(height * maxSize / width); width = maxSize; }
          else { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ data: dataUrl.split(',')[1], mimeType: 'image/jpeg', dataUrl });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* --- Model Select --- */
async function initModelSelect() {
  const select = document.getElementById('model-select');
  const saved  = localStorage.getItem('ess-model');

  select.innerHTML = '';
  let firstValue = null;

  // Local (Ollama) group
  const localGroup = document.createElement('optgroup');
  localGroup.label = Providers.LOCAL_NAME;
  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!resp.ok) throw new Error();
    const data  = await resp.json();
    const models = data.models || [];
    if (models.length === 0) {
      _addDisabledOpt(localGroup, 'モデルが見つかりません');
    } else {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `local:${m.name}`;
        opt.textContent = m.name;
        localGroup.appendChild(opt);
        if (!firstValue) firstValue = opt.value;
      });
    }
  } catch {
    _addDisabledOpt(localGroup, 'Ollama未接続');
  }
  select.appendChild(localGroup);

  // External providers that have API keys configured
  const active = Providers.getActiveProviders();
  for (const [pKey, p] of Object.entries(active)) {
    const group = document.createElement('optgroup');
    group.label = p.name;
    (p.models || []).forEach(m => {
      const opt = document.createElement('option');
      opt.value = `${pKey}:${m.id}`;
      opt.textContent = m.name;
      group.appendChild(opt);
      if (!firstValue) firstValue = opt.value;
    });
    select.appendChild(group);
  }

  // Restore saved selection
  if (saved && select.querySelector(`option[value="${CSS.escape(saved)}"]`)) {
    select.value = saved;
  } else if (firstValue) {
    select.value = firstValue;
    localStorage.setItem('ess-model', firstValue);
  }

  select.onchange = () => { if (select.value) localStorage.setItem('ess-model', select.value); };
}

function _addDisabledOpt(group, text) {
  const opt = document.createElement('option');
  opt.value = ''; opt.textContent = text; opt.disabled = true;
  group.appendChild(opt);
}

function getSelectedModel() {
  return document.getElementById('model-select').value || 'local:qwen2.5:7b';
}

/* ================================================
   Settings Modal
   ================================================ */
function initSettings() {
  const modal   = document.getElementById('settings-modal');
  if (!modal) return;

  const openBtn  = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('settings-close-btn');

  function openModal() {
    // Reset PAT section
    document.getElementById('settings-pat-input').value = localStorage.getItem('ess-github-pat') || '';
    _setStatus(document.getElementById('settings-pat-status'), '', '');
    // Render provider list
    _renderProviderList();
    // Hide custom form
    const cf = document.getElementById('settings-custom-form');
    if (cf) { cf.style.display = 'none'; cf.innerHTML = ''; }
    modal.classList.add('is-open');
  }
  function closeModal() { modal.classList.remove('is-open'); }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // PAT section
  const patInput  = document.getElementById('settings-pat-input');
  const testBtn   = document.getElementById('settings-test-btn');
  const saveBtn   = document.getElementById('settings-save-btn');
  const clearBtn  = document.getElementById('settings-clear-btn');
  const patStatus = document.getElementById('settings-pat-status');

  testBtn.addEventListener('click', async () => {
    const token = patInput.value.trim();
    if (!token) { _setStatus(patStatus, 'PATを入力してください', 'error'); return; }
    _setStatus(patStatus, '確認中...', '');
    const r = await Relay.testToken(token);
    _setStatus(patStatus, r.ok ? `接続成功: ${r.username}` : `接続失敗: ${r.error}`, r.ok ? 'success' : 'error');
  });

  saveBtn.addEventListener('click', async () => {
    const token = patInput.value.trim();
    if (!token) { _setStatus(patStatus, 'PATを入力してください', 'error'); return; }
    localStorage.setItem('ess-github-pat', token);
    _setStatus(patStatus, '保存しました', 'success');
  });

  clearBtn.addEventListener('click', () => {
    localStorage.removeItem('ess-github-pat');
    localStorage.removeItem('ess-relay-gist-id');
    patInput.value = '';
    _setStatus(patStatus, '削除しました', '');
  });

  // Add custom provider button
  document.getElementById('settings-add-btn').addEventListener('click', () => {
    const form = document.getElementById('settings-custom-form');
    if (form.style.display === 'none' || !form.innerHTML) {
      _renderCustomForm();
      form.style.display = '';
    } else {
      form.style.display = 'none';
      form.innerHTML = '';
    }
  });
}

/* ---- Provider list rendering ---- */
function _renderProviderList() {
  const container = document.getElementById('settings-provider-list');
  container.innerHTML = '';

  // Built-in providers
  for (const [key, def] of Object.entries(Providers.BUILTIN)) {
    container.appendChild(_createProviderRow(key, def.name, false));
  }
  // Custom providers
  for (const [key, def] of Object.entries(Providers.getCustomProviders())) {
    container.appendChild(_createProviderRow(key, def.name, true));
  }
}

function _createProviderRow(key, name, isCustom) {
  const div = document.createElement('div');
  div.className = 'settings-provider-row';

  const currentKey = Providers.getApiKey(key);
  const hasKey = !!currentKey;

  div.innerHTML = `
    <div class="settings-provider-info">
      <span class="settings-provider-name">${_esc(name)}</span>
      <span class="settings-provider-badge ${hasKey ? 'active' : ''}">${hasKey ? '設定済み' : '未設定'}</span>
    </div>
    <div class="settings-provider-controls">
      <input type="password" class="modal-input prov-key-input"
             value="${_escAttr(currentKey)}" placeholder="APIキー" autocomplete="off">
      <button class="modal-btn modal-btn-primary prov-save-btn">保存</button>
      ${isCustom ? '<button class="modal-btn modal-btn-danger prov-del-btn">削除</button>' : ''}
    </div>
    <div class="settings-provider-status settings-status"></div>
  `;

  const keyInput = div.querySelector('.prov-key-input');
  const statusEl = div.querySelector('.settings-provider-status');
  const badge    = div.querySelector('.settings-provider-badge');

  div.querySelector('.prov-save-btn').addEventListener('click', async () => {
    const val = keyInput.value.trim();
    Providers.setApiKey(key, val);
    badge.textContent = val ? '設定済み' : '未設定';
    badge.className = `settings-provider-badge ${val ? 'active' : ''}`;
    _setStatus(statusEl, val ? '保存しました' : 'キーを削除しました', 'success');
    await initModelSelect();
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });

  if (isCustom) {
    div.querySelector('.prov-del-btn').addEventListener('click', async () => {
      if (!confirm(`「${name}」を削除しますか？`)) return;
      Providers.removeCustomProvider(key);
      await initModelSelect();
      _renderProviderList();
    });
  }

  return div;
}

/* ---- Custom provider add form ---- */
function _renderCustomForm() {
  const form = document.getElementById('settings-custom-form');
  form.innerHTML = `
    <div class="custom-form-inner">
      <div class="custom-form-title">カスタムプロバイダーを追加</div>
      <select id="custom-preset" class="modal-input">
        <option value="">-- プリセットを選択 (任意) --</option>
        ${Providers.PRESETS.map(p => `<option value="${p.id}">${_esc(p.name)}</option>`).join('')}
        <option value="_custom">カスタム</option>
      </select>
      <input id="custom-name" type="text" class="modal-input" placeholder="プロバイダー名 *">
      <input id="custom-base" type="text" class="modal-input" placeholder="APIエンドポイント * 例: https://api.openai.com/v1">
      <input id="custom-key"  type="password" class="modal-input" placeholder="APIキー *" autocomplete="off">
      <textarea id="custom-models" class="modal-input" rows="4"
        placeholder="モデルリスト * (1行1モデル)&#10;形式: モデルID=表示名&#10;例: gpt-4o=GPT-4o&#10;    gpt-4o-mini=GPT-4o Mini"></textarea>
      <div class="modal-actions">
        <button id="custom-add-btn" class="modal-btn modal-btn-primary">追加</button>
        <button id="custom-cancel-btn" class="modal-btn">キャンセル</button>
      </div>
      <div id="custom-status" class="settings-status"></div>
    </div>
  `;

  // Preset fill
  document.getElementById('custom-preset').addEventListener('change', e => {
    const preset = Providers.PRESETS.find(p => p.id === e.target.value);
    if (!preset) return;
    document.getElementById('custom-name').value = preset.name;
    document.getElementById('custom-base').value = preset.apiBase;
    document.getElementById('custom-models').value = preset.defaultModels;
  });

  document.getElementById('custom-cancel-btn').addEventListener('click', () => {
    form.style.display = 'none';
    form.innerHTML = '';
  });

  document.getElementById('custom-add-btn').addEventListener('click', async () => {
    const name   = document.getElementById('custom-name').value.trim();
    const base   = document.getElementById('custom-base').value.trim();
    const key    = document.getElementById('custom-key').value.trim();
    const raw    = document.getElementById('custom-models').value.trim();
    const status = document.getElementById('custom-status');

    if (!name || !base || !key || !raw) {
      _setStatus(status, 'すべての必須項目を入力してください', 'error'); return;
    }

    const models = raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const eq = l.indexOf('=');
      return eq > 0 ? { id: l.slice(0, eq).trim(), name: l.slice(eq + 1).trim() } : { id: l, name: l };
    });

    if (models.length === 0) {
      _setStatus(status, 'モデルを1つ以上入力してください', 'error'); return;
    }

    // Use preset id if preset was selected, else generate unique id
    const presetId = document.getElementById('custom-preset').value;
    const id = (presetId && presetId !== '_custom')
      ? presetId
      : 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) + '_' + Date.now().toString(36);

    Providers.saveCustomProvider(id, { name, workflowType: 'openai', apiBase: base, models });
    Providers.setApiKey(id, key);

    _setStatus(status, `「${name}」を追加しました`, 'success');
    await initModelSelect();
    _renderProviderList();
    setTimeout(() => { form.style.display = 'none'; form.innerHTML = ''; }, 800);
  });
}

/* ---- Utilities ---- */
function _setStatus(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'settings-status' + (type ? ` ${type}` : '');
}
function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _escAttr(str) {
  return String(str).replace(/"/g, '&quot;');
}
