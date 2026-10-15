// Кто пишет: проверка входа из Telegram Mini App и токены сессий для /chat.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const safeEq = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Проверка Telegram.WebApp.initData по https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 * @returns {{ id: number } | null} пользователь Telegram или null, если подпись не сошлась или данные устарели
 */
export function verifyInitData(initData, botToken, { maxAgeSec = 24 * 3600, now = Date.now } = {}) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (!safeEq(expected, hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && Number.isInteger(user.id) ? { id: user.id } : null;
  } catch {
    return null;
  }
}

/** Токен сессии = ключ сессии + подпись. Без базы: переживает перезапуск, подделать нельзя без секрета. */
export function createTokens(secret) {
  const sign = (key) => createHmac('sha256', secret).update(key).digest('base64url');
  return {
    issue: (key) => `${key}.${sign(key)}`,
    verify(token) {
      if (typeof token !== 'string') return null;
      const i = token.lastIndexOf('.');
      if (i <= 0) return null;
      const key = token.slice(0, i);
      return safeEq(sign(key), token.slice(i + 1)) ? key : null;
    },
    newWebKey: () => `web-${randomBytes(16).toString('hex')}`,
  };
}
