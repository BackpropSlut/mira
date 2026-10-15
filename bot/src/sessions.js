// Текущий разговор живёт в памяти процесса: контекст для модели, кризисный флаг, антиспам.
// Бесплатным пользователям переписку на диск не пишем: перезапуск или долгая пауза = разговор забыт.
// Согласие, тариф и история премиума лежат в store.js.

import { createHmac } from 'node:crypto';

export function hashId(channel, id, salt) {
  return createHmac('sha256', salt || 'mira-dev').update(`${channel}:${id}`).digest('hex').slice(0, 32);
}

export function createSessions({ idleMs, now = Date.now }) {
  const map = new Map();

  function get(key) {
    let s = map.get(key);
    if (s && now() - s.seenAt > idleMs) {
      // долгая тишина: начинаем новый разговор
      s = fresh();
      map.set(key, s);
    }
    if (!s) {
      s = fresh();
      map.set(key, s);
    }
    s.seenAt = now();
    return s;
  }

  function fresh() {
    return { history: [], loaded: false, crisis: false, hits: [], queue: Promise.resolve(), seenAt: now() };
  }

  function sweep() {
    for (const [k, s] of map) if (now() - s.seenAt > idleMs * 4) map.delete(k);
  }

  return { get, sweep, reset: (key) => map.delete(key), size: () => map.size };
}
