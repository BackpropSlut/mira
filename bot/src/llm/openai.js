// Любой OpenAI-совместимый /chat/completions: запасной путь, если GigaChat не подойдёт
// (YandexGPT через его совместимый API, Qwen или другая открытая модель на своём сервере).

export function createOpenAICompatible(cfg, { fetchImpl = fetch } = {}) {
  const o = cfg.openai;
  if (!o.baseUrl) throw new Error('OPENAI_BASE_URL не задан');
  return {
    name: `openai:${cfg.model}`,
    async complete({ system, messages }) {
      const res = await fetchImpl(`${o.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(o.apiKey ? { authorization: `Bearer ${o.apiKey}` } : {}),
          ...(o.project ? { 'openai-project': o.project } : {}), // у YandexGPT здесь ID каталога
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: 'system', content: system }, ...messages],
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
      if (!res.ok) throw new Error(`openai ${res.status}`);
      const data = await res.json();
      const choice = data?.choices?.[0];
      return {
        text: (choice?.message?.content || '').trim(),
        blocked: choice?.finish_reason === 'content_filter',
      };
    },
  };
}
