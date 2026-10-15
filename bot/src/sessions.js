// Разговоры живут только в памяти процесса: на диск и в базу ничего не пишем.
// Перезапуск = все всё забыли, включая согласие (бот спросит его снова). Для альфы это осознанный выбор:
// так мы не храним данные о здоровье, пока не решили, где сервер и как оформить 152-ФЗ.

import { createHmac } from 'node:crypto';

export function hashId(channel, id, salt) {
  return createHmac('sha256', salt || 'mira-dev').update(`${channel}:${id}`).digest('hex').slice(0, 32);
}

export function createSessions({ idleMs, now = Date.now }) {
  const map = new Map();

  function get(key) {
    let s = map.get(key);
    if (s && now() - s.seenAt > idleMs) {
      // долгая тишина: забываем переписку, но не согласие
      s = { ...fresh(), consented: s.consented };
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
    return { consented: false, history: [], crisis: false, hits: [], queue: Promise.resolve(), seenAt: now() };
  }

  function sweep() {
    for (const [k, s] of map) if (now() - s.seenAt > idleMs * 4) map.delete(k);
  }

  return { get, sweep, reset: (key) => map.delete(key), size: () => map.size };
}
