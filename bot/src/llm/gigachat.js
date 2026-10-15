// GigaChat API (Сбер). Документация: https://developers.sber.ru/docs/ru/gigachat/api/overview
// Схема: «ключ авторизации» из кабинета → OAuth-токен на 30 минут → /chat/completions.
// TLS: сертификаты выпущены НУЦ Минцифры, Node нужен NODE_EXTRA_CA_CERTS (см. README).

import { randomUUID } from 'node:crypto';

export function createGigaChat(cfg, { fetchImpl = fetch, now = Date.now } = {}) {
  const g = cfg.gigachat;
  if (!g.authKey) throw new Error('GIGACHAT_AUTH_KEY не задан');
  let token = null;
  let expiresAt = 0;

  async function getToken(force = false) {
    if (!force && token && now() < expiresAt - 60_000) return token;
    const res = await fetchImpl(g.oauthUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        authorization: `Basic ${g.authKey}`,
        rquid: randomUUID(),
      },
      body: new URLSearchParams({ scope: g.scope }).toString(),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) throw new Error(`gigachat oauth ${res.status}`);
    const data = await res.json();
    token = data.access_token;
    expiresAt = Number(data.expires_at) || now() + 25 * 60_000; // expires_at приходит в миллисекундах
    return token;
  }

  async function call(body, retry = true) {
    const res = await fetchImpl(`${g.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${await getToken(!retry)}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (res.status === 401 && retry) return call(body, false); // токен протух раньше срока
    if (!res.ok) throw new Error(`gigachat ${res.status}`); // только код: текст переписки в логи не пишем
    return res.json();
  }

  return {
    name: `gigachat:${cfg.model}`,
    async complete({ system, messages }) {
      const data = await call({
        model: cfg.model,
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: false,
      });
      const choice = data?.choices?.[0];
      return {
        text: (choice?.message?.content || '').trim(),
        // blacklist: встроенный фильтр GigaChat отказался отвечать на тему
        blocked: choice?.finish_reason === 'blacklist',
      };
    },
  };
}
