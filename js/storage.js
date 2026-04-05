/* ========================================
   ESS ASSISTENT — Session Storage (localStorage)
   ======================================== */

const Storage = (() => {
  const STORAGE_KEY = 'ess-sessions';
  const ACTIVE_KEY = 'ess-active-session';
  let sessions = [];
  let activeSessionId = null;

  function init() {
    sessions = loadSessions();
    activeSessionId = localStorage.getItem(ACTIVE_KEY);

    // If no sessions exist, create a default one
    if (sessions.length === 0) {
      createSession(true);
    } else if (!activeSessionId || !sessions.find(s => s.id === activeSessionId)) {
      switchSession(sessions[0].id);
    } else {
      switchSession(activeSessionId);
    }
    renderSessionList();
  }

  function loadSessions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveSessions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function createSession(silent) {
    const session = {
      id: generateId(),
      title: '新しいチャット',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    sessions.unshift(session);
    saveSessions();
    switchSession(session.id);
    if (!silent) renderSessionList();
    return session;
  }

  function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    saveSessions();

    if (activeSessionId === id) {
      if (sessions.length === 0) {
        createSession(true);
      } else {
        switchSession(sessions[0].id);
      }
    }
    renderSessionList();
  }

  function renameSession(id, newTitle) {
    const session = sessions.find(s => s.id === id);
    if (session) {
      session.title = newTitle.trim() || '新しいチャット';
      session.updatedAt = Date.now();
      saveSessions();
      renderSessionList();
    }
  }

  function switchSession(id) {
    activeSessionId = id;
    localStorage.setItem(ACTIVE_KEY, id);
    renderSessionList();
    Chat.loadSession(id);
  }

  function getActiveSession() {
    return sessions.find(s => s.id === activeSessionId) || null;
  }

  function getActiveMessages() {
    const session = getActiveSession();
    return session ? session.messages : [];
  }

  function addMessage(role, content) {
    const session = getActiveSession();
    if (!session) return;

    session.messages.push({ role, content, timestamp: Date.now() });
    session.updatedAt = Date.now();

    // Auto-title from first user message
    if (role === 'user' && session.messages.filter(m => m.role === 'user').length === 1) {
      session.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
      renderSessionList();
    }

    saveSessions();
  }

  function updateLastAiMessage(content) {
    const session = getActiveSession();
    if (!session) return;

    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === 'assistant') {
        session.messages[i].content = content;
        session.updatedAt = Date.now();
        saveSessions();
        return;
      }
    }
  }

  function removeLastAiMessage() {
    const session = getActiveSession();
    if (!session) return;

    for (let i = session.messages.length - 1; i >= 0; i--) {
      if (session.messages[i].role === 'assistant') {
        session.messages.splice(i, 1);
        saveSessions();
        return;
      }
    }
  }

  function archiveSession(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    session.archived = true;
    session.updatedAt = Date.now();
    saveSessions();

    if (activeSessionId === id) {
      const active = sessions.find(s => !s.archived);
      if (active) switchSession(active.id);
      else createSession(true);
    }
    renderSessionList();
  }

  function unarchiveSession(id) {
    const session = sessions.find(s => s.id === id);
    if (!session) return;
    session.archived = false;
    session.updatedAt = Date.now();
    saveSessions();
    renderSessionList();
  }

  /* --- Render Session List --- */
  let archiveExpanded = false;

  function renderSessionList() {
    const container = document.getElementById('session-list');
    if (!container) return;

    const active = sessions.filter(s => !s.archived);
    const archived = sessions.filter(s => s.archived);

    const groups = groupByDate(active);
    let html = '';

    for (const [label, items] of groups) {
      html += `<div class="session-group-label">${label}</div>`;
      for (const s of items) {
        html += renderSessionItem(s);
      }
    }

    // Archive section
    if (archived.length > 0) {
      const expandIcon = archiveExpanded ? '▾' : '▸';
      html += `
        <div class="session-group-label archive-toggle" onclick="Storage.toggleArchive()" style="cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
          <span>${expandIcon}</span>
          <span>アーカイブ (${archived.length})</span>
        </div>`;
      if (archiveExpanded) {
        for (const s of archived) {
          html += renderSessionItem(s, true);
        }
      }
    }

    container.innerHTML = html;
  }

  function renderSessionItem(s, isArchived) {
    const activeClass = s.id === activeSessionId ? ' active' : '';
    const archivedStyle = isArchived ? ' style="opacity:0.65;"' : '';
    const archiveBtn = isArchived
      ? `<button class="session-action-btn" onclick="event.stopPropagation(); Storage.unarchiveSession('${s.id}')" title="アーカイブ解除">↩</button>`
      : `<button class="session-action-btn" onclick="event.stopPropagation(); Storage.archiveSession('${s.id}')" title="アーカイブ">📁</button>`;
    return `
      <div class="session-item${activeClass}"${archivedStyle} data-id="${s.id}" onclick="Storage.switchSession('${s.id}')">
        <span class="session-item-title">${escapeHtml(s.title)}</span>
        <span class="session-item-actions">
          ${!isArchived ? `<button class="session-action-btn" onclick="event.stopPropagation(); Storage.startRename('${s.id}')" title="名前変更">✏</button>` : ''}
          ${archiveBtn}
          <button class="session-action-btn" onclick="event.stopPropagation(); Storage.deleteSession('${s.id}')" title="削除">✕</button>
        </span>
      </div>`;
  }

  function toggleArchive() {
    archiveExpanded = !archiveExpanded;
    renderSessionList();
  }

  function startRename(id) {
    const item = document.querySelector(`.session-item[data-id="${id}"] .session-item-title`);
    if (!item) return;
    const session = sessions.find(s => s.id === id);
    if (!session) return;

    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = session.title;
    item.replaceWith(input);
    input.focus();
    input.select();

    const finish = () => {
      renameSession(id, input.value);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      if (e.key === 'Escape') { renderSessionList(); }
    });
  }

  function groupByDate(sessions) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;

    const groups = new Map();
    const addTo = (label, session) => {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(session);
    };

    for (const s of sessions) {
      const t = s.updatedAt || s.createdAt;
      if (t >= today) addTo('今日', s);
      else if (t >= yesterday) addTo('昨日', s);
      else if (t >= weekAgo) addTo('過去7日間', s);
      else addTo('それ以前', s);
    }
    return groups;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init,
    createSession,
    deleteSession,
    renameSession,
    archiveSession,
    unarchiveSession,
    toggleArchive,
    switchSession,
    startRename,
    getActiveSession,
    getActiveMessages,
    addMessage,
    updateLastAiMessage,
    removeLastAiMessage
  };
})();
