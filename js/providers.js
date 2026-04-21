/* ========================================
   ESS ASSISTENT — Provider Registry
   ======================================== */

const Providers = (() => {
  const LOCAL_NAME = 'ローカル (Ollama)';

  // Built-in providers (always shown in settings)
  const BUILTIN = {
    gemini: {
      name: 'Gemini',
      workflowType: 'gemini',
      apiBase: null,
      models: [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash' },
        { id: 'gemma-4-31b-it',         name: 'Gemma 4 31B' }
      ]
    },
    groq: {
      name: 'Groq',
      workflowType: 'openai',
      apiBase: 'https://api.groq.com/openai/v1',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
        { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B (Fast)' },
        { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B' }
      ]
    }
  };

  // Presets for the "Add Custom Provider" form
  const PRESETS = [
    {
      id: 'openai',
      name: 'OpenAI',
      apiBase: 'https://api.openai.com/v1',
      defaultModels: 'gpt-4.1=GPT-4.1\ngpt-4.1-mini=GPT-4.1 Mini\ngpt-4o=GPT-4o\ngpt-4o-mini=GPT-4o Mini'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      apiBase: 'https://api.deepseek.com',
      defaultModels: 'deepseek-chat=DeepSeek V3\ndeepseek-reasoner=DeepSeek R1'
    },
    {
      id: 'kimi',
      name: 'Kimi (Moonshot)',
      apiBase: 'https://api.moonshot.cn/v1',
      defaultModels: 'kimi-k2.5=Kimi K2.5\nmoonshot-v1-8k=Kimi 8K\nmoonshot-v1-32k=Kimi 32K\nmoonshot-v1-128k=Kimi 128K'
    },
    {
      id: 'claude',
      name: 'Claude (Anthropic)',
      apiBase: 'https://api.anthropic.com/v1',
      defaultModels: 'claude-opus-4-5=Claude Opus 4.5\nclaude-sonnet-4-5=Claude Sonnet 4.5\nclaude-haiku-3-5=Claude Haiku 3.5'
    }
  ];

  /* ---- API key storage (per provider key in localStorage) ---- */
  function getApiKey(key) {
    return localStorage.getItem(`ess-api-key-${key}`) || '';
  }
  function setApiKey(key, val) {
    if (val) localStorage.setItem(`ess-api-key-${key}`, val);
    else localStorage.removeItem(`ess-api-key-${key}`);
  }

  /* ---- Custom provider storage ---- */
  function getCustomProviders() {
    try { return JSON.parse(localStorage.getItem('ess-custom-providers') || '{}'); }
    catch { return {}; }
  }
  function saveCustomProvider(id, def) {
    const c = getCustomProviders();
    c[id] = def;
    localStorage.setItem('ess-custom-providers', JSON.stringify(c));
  }
  function removeCustomProvider(id) {
    const c = getCustomProviders();
    delete c[id];
    localStorage.setItem('ess-custom-providers', JSON.stringify(c));
    localStorage.removeItem(`ess-api-key-${id}`);
  }

  /* ---- Provider lookup ---- */
  function getProviderDef(key) {
    return BUILTIN[key] || getCustomProviders()[key] || null;
  }

  // Returns all providers that have API keys configured
  function getActiveProviders() {
    const result = {};
    for (const [k, p] of Object.entries(BUILTIN)) {
      if (getApiKey(k)) result[k] = p;
    }
    for (const [k, p] of Object.entries(getCustomProviders())) {
      if (getApiKey(k)) result[k] = { ...p, workflowType: 'openai' };
    }
    return result;
  }

  /* ---- Value parsing "providerKey:modelId" ---- */
  function parse(value) {
    if (!value) return { provider: null, modelId: null };
    const idx = value.indexOf(':');
    if (idx === -1) return { provider: 'local', modelId: value };
    return { provider: value.slice(0, idx), modelId: value.slice(idx + 1) };
  }

  function isRelay(value) {
    const { provider } = parse(value);
    return provider !== 'local' && provider !== null;
  }

  function isLocal(value) {
    return parse(value).provider === 'local';
  }

  return {
    LOCAL_NAME, BUILTIN, PRESETS,
    getApiKey, setApiKey,
    getCustomProviders, saveCustomProvider, removeCustomProvider,
    getProviderDef, getActiveProviders,
    parse, isRelay, isLocal
  };
})();
