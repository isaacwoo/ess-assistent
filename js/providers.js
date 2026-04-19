/* ========================================
   ESS ASSISTENT — Provider Registry
   ======================================== */

const Providers = (() => {
  const PROVIDERS = {
    local: {
      name: 'ローカル (Ollama)',
      type: 'local',
      models: []  // 动态从 Ollama /api/tags 填充
    },
    gemini: {
      name: 'Gemini',
      type: 'relay',
      models: [
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
        { id: 'gemini-2.5-flash',       name: 'Gemini 2.5 Flash' },
        { id: 'gemma-4-31b-it',         name: 'Gemma 4 31B' }
      ]
    },
    groq: {
      name: 'Groq',
      type: 'relay',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Fast)' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' }
      ]
    },
    deepseek: {
      name: 'DeepSeek',
      type: 'relay',
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3' },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1' }
      ]
    }
  };

  /**
   * 解析 "provider:model_id" 格式的值
   * 注意: model_id 可能含有 ":"（如 "qwen2.5:7b"），所以只在第一个 ":" 处分割
   */
  function parse(value) {
    if (!value) return { provider: null, modelId: null };
    const idx = value.indexOf(':');
    if (idx === -1) return { provider: 'local', modelId: value };
    return {
      provider: value.slice(0, idx),
      modelId: value.slice(idx + 1)
    };
  }

  function isRelay(value) {
    const { provider } = parse(value);
    return provider && PROVIDERS[provider] && PROVIDERS[provider].type === 'relay';
  }

  function isLocal(value) {
    const { provider } = parse(value);
    return provider === 'local';
  }

  function getProviderInfo(value) {
    const { provider } = parse(value);
    return PROVIDERS[provider] || null;
  }

  return { PROVIDERS, parse, isRelay, isLocal, getProviderInfo };
})();
