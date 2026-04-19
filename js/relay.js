/* ========================================
   ESS ASSISTENT — GitHub API Relay
   ======================================== */

const Relay = (() => {
  const GITHUB_API = 'https://api.github.com';
  const REPO_OWNER = 'isaacwoo';
  const REPO_NAME = 'ess-assistent';
  const GIST_DESC = 'ess-assistent-relay';
  const GIST_FILENAME = 'relay.json';
  const EVENT_TYPE = 'ai-relay';
  const POLL_INTERVAL = 3000;
  const POLL_TIMEOUT = 120000;

  let pollTimer = null;
  let pollTimerElapsed = null;
  let cancelled = false;

  function getToken() {
    return localStorage.getItem('ess-github-pat');
  }

  function authHeaders() {
    const token = getToken();
    if (!token) throw new Error('GitHub PAT が設定されていません');
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  /**
   * 验证 PAT 是否有效
   */
  async function testToken(token) {
    try {
      const resp = await fetch(`${GITHUB_API}/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (!resp.ok) return { ok: false, error: `認証失敗 (${resp.status})` };
      const data = await resp.json();
      return { ok: true, username: data.login };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * 查找或创建 relay gist
   * 缓存 gist ID 到 localStorage 以避免重复查找
   */
  async function findOrCreateRelayGist() {
    const cachedId = localStorage.getItem('ess-relay-gist-id');
    if (cachedId) {
      // 验证缓存的 gist 还存在
      const resp = await fetch(`${GITHUB_API}/gists/${cachedId}`, { headers: authHeaders() });
      if (resp.ok) return cachedId;
      // 失效则清除缓存
      localStorage.removeItem('ess-relay-gist-id');
    }

    // 搜索现有的 relay gist
    const listResp = await fetch(`${GITHUB_API}/gists?per_page=100`, { headers: authHeaders() });
    if (!listResp.ok) throw new Error(`Gist 取得失敗 (${listResp.status})`);
    const gists = await listResp.json();
    const existing = gists.find(g => g.description === GIST_DESC);
    if (existing) {
      localStorage.setItem('ess-relay-gist-id', existing.id);
      return existing.id;
    }

    // 创建新的 relay gist
    const createResp = await fetch(`${GITHUB_API}/gists`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        description: GIST_DESC,
        public: false,
        files: {
          [GIST_FILENAME]: { content: JSON.stringify({ status: 'idle' }, null, 2) }
        }
      })
    });
    if (!createResp.ok) throw new Error(`Gist 作成失敗 (${createResp.status})`);
    const gist = await createResp.json();
    localStorage.setItem('ess-relay-gist-id', gist.id);
    return gist.id;
  }

  /**
   * 更新 gist 内容
   */
  async function updateGist(gistId, content) {
    const resp = await fetch(`${GITHUB_API}/gists/${gistId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: { content: JSON.stringify(content, null, 2) }
        }
      })
    });
    if (!resp.ok) throw new Error(`Gist 更新失敗 (${resp.status})`);
  }

  /**
   * 读取 gist 内容
   */
  async function readGist(gistId) {
    const resp = await fetch(`${GITHUB_API}/gists/${gistId}?t=${Date.now()}`, {
      headers: authHeaders(),
      cache: 'no-store'
    });
    if (!resp.ok) throw new Error(`Gist 読込失敗 (${resp.status})`);
    const gist = await resp.json();
    const file = gist.files[GIST_FILENAME];
    if (!file) throw new Error('Gist にファイルが見つかりません');
    try {
      return JSON.parse(file.content);
    } catch {
      throw new Error('Gist 内容が不正な JSON');
    }
  }

  /**
   * 触发 repository_dispatch 事件
   */
  async function triggerDispatch(requestId, gistId) {
    const resp = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/dispatches`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          event_type: EVENT_TYPE,
          client_payload: { request_id: requestId, gist_id: gistId }
        })
      }
    );
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Dispatch 失敗 (${resp.status}): ${body}`);
    }
  }

  function generateRequestId() {
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 发送中继请求
   * @param {object|null} image - { data: base64, mimeType: 'image/jpeg' } or null
   * @returns {Promise<{requestId, gistId}>}
   */
  async function send(provider, model, messages, image) {
    cancelled = false;

    // 只发送最近 10 条消息以控制大小
    const recentMessages = messages.slice(-10);

    const gistId = await findOrCreateRelayGist();
    const requestId = generateRequestId();

    const payload = {
      status: 'pending',
      request_id: requestId,
      provider,
      model,
      messages: recentMessages,
      image: image ? { data: image.data, mimeType: image.mimeType } : null,
      response: null,
      error: null,
      created_at: new Date().toISOString()
    };

    await updateGist(gistId, payload);
    await triggerDispatch(requestId, gistId);

    return { requestId, gistId };
  }

  /**
   * 轮询 gist 等待响应
   */
  function poll(gistId, requestId, onComplete, onError, onTick) {
    cancelled = false;
    const startTime = Date.now();

    async function check() {
      if (cancelled) return;

      const elapsed = Date.now() - startTime;
      if (elapsed > POLL_TIMEOUT) {
        cleanup();
        onError(new Error(`タイムアウト (${Math.floor(POLL_TIMEOUT / 1000)}秒)`));
        return;
      }

      try {
        const data = await readGist(gistId);
        // 确认是当前请求的响应（避免读到旧请求）
        if (data.request_id !== requestId) {
          return; // 继续轮询
        }
        if (data.status === 'completed' && data.response) {
          cleanup();
          onComplete(data.response);
          return;
        }
        if (data.status === 'error') {
          cleanup();
          onError(new Error(data.error || '不明なエラー'));
          return;
        }
        // status === 'pending' 继续轮询
      } catch (e) {
        // 单次读取失败不终止，继续尝试
        console.warn('Poll error:', e.message);
      }
    }

    pollTimer = setInterval(check, POLL_INTERVAL);
    pollTimerElapsed = setInterval(() => {
      if (cancelled) return;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (onTick) onTick(elapsed);
    }, 1000);

    // 立即执行一次
    check();
  }

  function cleanup() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (pollTimerElapsed) { clearInterval(pollTimerElapsed); pollTimerElapsed = null; }
  }

  function cancel() {
    cancelled = true;
    cleanup();
  }

  return { send, poll, cancel, getToken, testToken };
})();
