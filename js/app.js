/* ========================================
   ESS ASSISTENT — App Initialization
   ======================================== */

const OLLAMA_BASE = 'http://localhost:11434';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initInput();
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

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });

  // Enter to send; Shift+Enter or Alt+Enter for newline
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
      input.dispatchEvent(new Event('input')); // trigger auto-resize
    }
  });

  sendBtn.addEventListener('click', () => Chat.send());

  document.getElementById('stop-btn').addEventListener('click', () => {
    Chat.stopGeneration();
  });
}

/* --- Model Select --- */
async function initModelSelect() {
  const select = document.getElementById('model-select');
  const saved = localStorage.getItem('ess-model');

  select.innerHTML = '';
  let firstValue = null;

  // --- Local (Ollama) optgroup ---
  const localGroup = document.createElement('optgroup');
  localGroup.label = Providers.PROVIDERS.local.name;

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    const models = data.models || [];

    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'モデルが見つかりません';
      opt.disabled = true;
      localGroup.appendChild(opt);
    } else {
      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `local:${m.name}`;
        opt.textContent = m.name;
        localGroup.appendChild(opt);
        if (!firstValue) firstValue = opt.value;
      });
    }
  } catch (e) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Ollama未接続';
    opt.disabled = true;
    localGroup.appendChild(opt);
  }
  select.appendChild(localGroup);

  // --- External providers (only if PAT configured) ---
  const hasPAT = !!localStorage.getItem('ess-github-pat');
  if (hasPAT) {
    ['gemini', 'groq', 'deepseek'].forEach(pKey => {
      const p = Providers.PROVIDERS[pKey];
      if (!p || !p.models.length) return;
      const group = document.createElement('optgroup');
      group.label = p.name;
      p.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = `${pKey}:${m.id}`;
        opt.textContent = m.name;
        group.appendChild(opt);
        if (!firstValue) firstValue = opt.value;
      });
      select.appendChild(group);
    });
  }

  // Restore selection
  if (saved && select.querySelector(`option[value="${CSS.escape(saved)}"]`)) {
    select.value = saved;
  } else if (firstValue) {
    select.value = firstValue;
    localStorage.setItem('ess-model', firstValue);
  }

  select.onchange = () => {
    if (select.value) localStorage.setItem('ess-model', select.value);
  };
}

function getSelectedModel() {
  return document.getElementById('model-select').value || 'local:qwen2.5:7b';
}

/* --- Settings modal (GitHub PAT for relay) --- */
function initSettings() {
  const openBtn = document.getElementById('settings-btn');
  const modal = document.getElementById('settings-modal');
  if (!openBtn || !modal) return;

  const closeBtn = document.getElementById('settings-close-btn');
  const patInput = document.getElementById('settings-pat-input');
  const testBtn = document.getElementById('settings-test-btn');
  const saveBtn = document.getElementById('settings-save-btn');
  const clearBtn = document.getElementById('settings-clear-btn');
  const statusEl = document.getElementById('settings-status');

  function openModal() {
    patInput.value = localStorage.getItem('ess-github-pat') || '';
    statusEl.textContent = '';
    statusEl.className = 'settings-status';
    modal.classList.add('is-open');
  }
  function closeModal() {
    modal.classList.remove('is-open');
  }

  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  testBtn.addEventListener('click', async () => {
    const token = patInput.value.trim();
    if (!token) {
      statusEl.textContent = 'PAT を入力してください';
      statusEl.className = 'settings-status error';
      return;
    }
    statusEl.textContent = '接続確認中...';
    statusEl.className = 'settings-status';
    const result = await Relay.testToken(token);
    if (result.ok) {
      statusEl.textContent = `接続成功: ${result.username}`;
      statusEl.className = 'settings-status success';
    } else {
      statusEl.textContent = `接続失敗: ${result.error}`;
      statusEl.className = 'settings-status error';
    }
  });

  saveBtn.addEventListener('click', async () => {
    const token = patInput.value.trim();
    if (!token) {
      statusEl.textContent = 'PAT を入力してください';
      statusEl.className = 'settings-status error';
      return;
    }
    localStorage.setItem('ess-github-pat', token);
    statusEl.textContent = '保存しました。モデル一覧を更新中...';
    statusEl.className = 'settings-status success';
    // Refresh model list to include relay providers
    await initModelSelect();
    setTimeout(closeModal, 800);
  });

  clearBtn.addEventListener('click', async () => {
    localStorage.removeItem('ess-github-pat');
    localStorage.removeItem('ess-relay-gist-id');
    patInput.value = '';
    statusEl.textContent = 'PAT を削除しました';
    statusEl.className = 'settings-status';
    await initModelSelect();
  });
}
