/* ========================================
   ESS ASSISTENT — Chat Core
   ======================================== */

const Chat = (() => {
  let abortController = null;
  let isGenerating = false;
  let currentAiContent = '';
  let currentMode = null; // 'local' | 'relay'

  function loadSession(id) {
    const container = document.getElementById('chat-container');
    const welcome = document.getElementById('welcome-screen');
    const messages = Storage.getActiveMessages();

    // Clear all messages but keep welcome screen
    container.querySelectorAll('.message, .suggestions').forEach(el => el.remove());

    if (messages.length === 0) {
      welcome.style.display = '';
    } else {
      welcome.style.display = 'none';
      messages.forEach(m => {
        appendMessageDOM(m.role === 'user' ? 'user' : 'ai', m.content, false);
      });
      scrollToBottom();
    }
  }

  async function send() {
    const input = document.getElementById('user-input');
    const text = input.value.trim();
    if (!text || isGenerating) return;

    // Hide welcome screen
    document.getElementById('welcome-screen').style.display = 'none';

    // Remove any existing suggestions
    document.querySelectorAll('.suggestions').forEach(el => el.remove());

    // Add user message
    Storage.addMessage('user', text);
    appendMessageDOM('user', text);
    input.value = '';
    input.style.height = 'auto';

    // Prepare AI response
    isGenerating = true;
    toggleButtons(true);
    currentAiContent = '';

    const aiMsgEl = appendMessageDOM('ai', '', true);
    const bubbleEl = aiMsgEl.querySelector('.message-bubble');

    const history = Storage.getActiveMessages().map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    const selected = getSelectedModel();
    const { provider, modelId } = Providers.parse(selected);

    if (Providers.isRelay(selected)) {
      currentMode = 'relay';
      await sendRelay(provider, modelId, history, aiMsgEl, bubbleEl);
    } else {
      currentMode = 'local';
      bubbleEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      await sendLocal(modelId, history, aiMsgEl, bubbleEl);
    }
  }

  /* --- Local (Ollama streaming) --- */
  async function sendLocal(modelId, history, aiMsgEl, bubbleEl) {
    abortController = new AbortController();

    try {
      const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: history,
          stream: true,
          options: { num_ctx: 4096, num_thread: 4, temperature: 0.7 }
        }),
        signal: abortController.signal
      });

      if (!resp.ok) throw new Error(`Ollama API エラー (${resp.status})`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              currentAiContent += data.message.content;
              bubbleEl.innerHTML = Markdown.render(currentAiContent);
              scrollToBottom();
            }
            if (data.done) break;
          } catch {}
        }
      }

      Storage.addMessage('assistant', currentAiContent);
      addMessageActions(aiMsgEl);
      generateSuggestions(currentAiContent);

    } catch (e) {
      if (e.name === 'AbortError') {
        if (currentAiContent) {
          Storage.addMessage('assistant', currentAiContent);
          addMessageActions(aiMsgEl);
        }
      } else {
        bubbleEl.innerHTML = `<span style="color: #e74c3c;">エラー: ${escapeHtml(e.message)}<br>Ollamaが起動しているか確認してください。</span>`;
      }
    } finally {
      isGenerating = false;
      abortController = null;
      toggleButtons(false);
    }
  }

  /* --- Relay (GitHub Actions → external AI) --- */
  async function sendRelay(provider, modelId, history, aiMsgEl, bubbleEl) {
    // Show waiting indicator
    bubbleEl.innerHTML = `
      <div class="relay-waiting">
        <div class="relay-spinner"></div>
        <div class="relay-text">
          <span>外部AIに問い合わせ中...</span>
          <span class="relay-timer">0秒</span>
        </div>
      </div>
    `;
    scrollToBottom();
    const timerEl = bubbleEl.querySelector('.relay-timer');

    try {
      if (!Relay.getToken()) {
        throw new Error('GitHub PAT が未設定です。右上の設定から入力してください。');
      }

      const { requestId, gistId } = await Relay.send(provider, modelId, history);

      await new Promise((resolve, reject) => {
        Relay.poll(
          gistId,
          requestId,
          (response) => {
            currentAiContent = response;
            bubbleEl.innerHTML = Markdown.render(currentAiContent);
            scrollToBottom();
            resolve();
          },
          (err) => reject(err),
          (elapsed) => {
            if (timerEl) timerEl.textContent = `${elapsed}秒`;
          }
        );
      });

      Storage.addMessage('assistant', currentAiContent);
      addMessageActions(aiMsgEl);
      // Follow-up suggestions still use local Ollama (free, fast)
      generateSuggestions(currentAiContent);

    } catch (e) {
      bubbleEl.innerHTML = `<span style="color: #e74c3c;">中継エラー: ${escapeHtml(e.message)}</span>`;
    } finally {
      isGenerating = false;
      currentMode = null;
      toggleButtons(false);
    }
  }

  function stopGeneration() {
    if (currentMode === 'relay') {
      Relay.cancel();
      isGenerating = false;
      currentMode = null;
      toggleButtons(false);
      // Keep whatever was already rendered
    } else if (abortController) {
      abortController.abort();
    }
  }

  function appendMessageDOM(role, content, isStreaming) {
    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = `message message-${role === 'user' ? 'user' : 'ai'}`;

    const label = role === 'user' ? '' : '<div class="message-label">ESS ASSISTENT</div>';
    const bubbleContent = role === 'user' ? escapeHtml(content) :
      (content ? Markdown.render(content) : '');

    div.innerHTML = `
      ${label}
      <div class="message-bubble">${bubbleContent}</div>
    `;

    // Add actions for existing (non-streaming) AI messages
    if (role !== 'user' && !isStreaming && content) {
      addMessageActions(div);
    }

    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function addMessageActions(msgEl) {
    // Remove existing actions if any
    const existing = msgEl.querySelector('.message-actions');
    if (existing) existing.remove();

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
      <button class="message-action-btn copy-msg-btn" title="コピー">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        コピー
      </button>
      <button class="message-action-btn regen-btn" title="再生成">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        再生成
      </button>
    `;

    // Copy handler
    actions.querySelector('.copy-msg-btn').addEventListener('click', () => {
      const bubble = msgEl.querySelector('.message-bubble');
      // Get the raw markdown content from storage
      const messages = Storage.getActiveMessages();
      const allAiMsgs = document.querySelectorAll('.message-ai');
      const idx = Array.from(allAiMsgs).indexOf(msgEl);
      const aiMessages = messages.filter(m => m.role === 'assistant');
      const rawText = (aiMessages[idx] && aiMessages[idx].content) || bubble.textContent;

      navigator.clipboard.writeText(rawText).then(() => {
        const btn = actions.querySelector('.copy-msg-btn');
        const orig = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> コピー済み`;
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      });
    });

    // Regenerate handler (only for last AI message)
    actions.querySelector('.regen-btn').addEventListener('click', () => {
      regenerateLastMessage();
    });

    msgEl.appendChild(actions);
  }

  async function regenerateLastMessage() {
    if (isGenerating) return;

    // Remove last AI message from storage and DOM
    Storage.removeLastAiMessage();
    const allAi = document.querySelectorAll('.message-ai');
    const lastAi = allAi[allAi.length - 1];
    if (lastAi) lastAi.remove();

    // Remove suggestions
    document.querySelectorAll('.suggestions').forEach(el => el.remove());

    // Re-send (will use the remaining history)
    isGenerating = true;
    toggleButtons(true);
    currentAiContent = '';

    const aiMsgEl = appendMessageDOM('ai', '', true);
    const bubbleEl = aiMsgEl.querySelector('.message-bubble');

    const history = Storage.getActiveMessages().map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    const selected = getSelectedModel();
    const { provider, modelId } = Providers.parse(selected);

    if (Providers.isRelay(selected)) {
      currentMode = 'relay';
      await sendRelay(provider, modelId, history, aiMsgEl, bubbleEl);
    } else {
      currentMode = 'local';
      bubbleEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      await sendLocal(modelId, history, aiMsgEl, bubbleEl);
    }
  }

  /* --- Follow-up Suggestions (always via local Ollama) --- */
  async function generateSuggestions(aiResponse) {
    // Pick a local model — prefer currently selected if local, else first local option
    const select = document.getElementById('model-select');
    let localModelId = null;
    const selected = getSelectedModel();
    if (Providers.isLocal(selected)) {
      localModelId = Providers.parse(selected).modelId;
    } else {
      // Find first local option
      const localOpt = select.querySelector('optgroup option[value^="local:"]');
      if (localOpt) localModelId = Providers.parse(localOpt.value).modelId;
    }
    if (!localModelId) return; // No local model available, skip suggestions

    const messages = Storage.getActiveMessages();
    // Build a short context from last few messages
    const context = messages.slice(-4).map(m =>
      `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.content.slice(0, 200)}`
    ).join('\n');

    try {
      const resp = await fetch(`${OLLAMA_BASE}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModelId,
          prompt: `以下の会話に基づいて、ユーザーが次に聞きそうな質問を2〜3個、簡潔に日本語で生成してください。各質問は20文字以内にしてください。JSON配列のみを返してください。例: ["質問1", "質問2", "質問3"]\n\n会話:\n${context}`,
          stream: false,
          options: { temperature: 0.8, num_ctx: 2048 }
        })
      });

      if (!resp.ok) return;
      const data = await resp.json();

      // Try to parse JSON array from response
      let suggestions = [];
      try {
        const match = data.response.match(/\[[\s\S]*?\]/);
        if (match) suggestions = JSON.parse(match[0]);
      } catch {}

      if (suggestions.length > 0 && !isGenerating) {
        renderSuggestions(suggestions.slice(0, 3));
      }
    } catch {}
  }

  function renderSuggestions(items) {
    // Remove existing suggestions
    document.querySelectorAll('.suggestions').forEach(el => el.remove());

    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = 'suggestions';
    div.style.maxWidth = '780px';
    div.style.width = '100%';
    div.style.margin = '0 auto';

    items.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        document.getElementById('user-input').value = text;
        Chat.send();
      });
      div.appendChild(btn);
    });

    container.appendChild(div);
    scrollToBottom();
  }

  /* --- Utilities --- */
  function toggleButtons(generating) {
    document.getElementById('send-btn').style.display = generating ? 'none' : '';
    document.getElementById('stop-btn').style.display = generating ? '' : 'none';
    document.getElementById('send-btn').disabled = generating;
  }

  function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return { send, loadSession, stopGeneration };
})();
