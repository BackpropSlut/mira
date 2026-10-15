// Готовые голосовые ответы живут в памяти час: клиент забирает их по одноразовой ссылке GET /v1/voice/<id>.
// На диск аудио не пишем.

import { randomBytes } from 'node:crypto';

export function createVoiceCache({ ttlMs = 60 * 60 * 1000, max = 2000, baseUrl = '', now = Date.now } = {}) {
  const map = new Map();
  return {
    /** @param {{ data: Buffer, mime: string }} audio */
    put(audio) {
      if (map.size >= max) map.delete(map.keys().next().value);
      const id = randomBytes(16).toString('hex');
      map.set(id, { ...audio, exp: now() + ttlMs });
      return `${baseUrl}/v1/voice/${id}`;
    },
    get(id) {
      const v = map.get(id);
      if (!v || v.exp < now()) {
        map.delete(id);
        return null;
      }
      return v;
    },
  };
}
