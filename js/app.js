/* ========================================
   ESS ASSISTENT — App Initialization
   ======================================== */

const OLLAMA_BASE = 'http://localhost:11434';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initInput();
  initModelSelect();
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

  try {
    const resp = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    const models = data.models || [];

    select.innerHTML = '';
    if (models.length === 0) {
      select.innerHTML = '<option value="">モデルが見つかりません</option>';
      return;
    }

    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      if (saved && m.name === saved) opt.selected = true;
      select.appendChild(opt);
    });

    // If no saved model, select first
    if (!saved && models.length > 0) {
      localStorage.setItem('ess-model', models[0].name);
    }

    select.addEventListener('change', () => {
      localStorage.setItem('ess-model', select.value);
    });
  } catch (e) {
    select.innerHTML = '<option value="">Ollama未接続</option>';
  }
}

function getSelectedModel() {
  return document.getElementById('model-select').value || 'qwen2.5:7b';
}
