import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGigaChat } from '../src/llm/gigachat.js';
import { loadConfig } from '../src/config.js';

function fakeFetch(handlers) {
  const log = [];
  const f = async (url, init) => {
    log.push({ url, init });
    const h = handlers.shift();
    const { status = 200, body } = h(url, init);
    return { ok: status < 400, status, json: async () => body };
  };
  return { f, log };
}

const cfg = loadConfig({ LLM_PROVIDER: 'gigachat', LLM_MODEL: 'GigaChat-2-Pro', GIGACHAT_AUTH_KEY: 'a2V5' }).llm;

test('получает токен, шлёт системный промпт и модель из конфига', async () => {
  const { f, log } = fakeFetch([
    () => ({ body: { access_token: 'T1', expires_at: Date.now() + 30 * 60_000 } }),
    () => ({ body: { choices: [{ message: { content: ' Привет ' }, finish_reason: 'stop' }] } }),
  ]);
  const llm = createGigaChat(cfg, { fetchImpl: f });
  const r = await llm.complete({ system: 'SYS', messages: [{ role: 'user', content: 'hi' }] });
  assert.deepEqual(r, { text: 'Привет', blocked: false });
  assert.equal(log[0].init.headers.authorization, 'Basic a2V5');
  assert.equal(log[0].init.body, 'scope=GIGACHAT_API_PERS');
  assert.ok(log[0].init.headers.rquid);
  assert.equal(log[1].init.headers.authorization, 'Bearer T1');
  const body = JSON.parse(log[1].init.body);
  assert.equal(body.model, 'GigaChat-2-Pro');
  assert.deepEqual(body.messages[0], { role: 'system', content: 'SYS' });
});

test('токен переиспользуется, а на 401 обновляется один раз', async () => {
  const ok = () => ({ body: { choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] } });
  const { f, log } = fakeFetch([
    () => ({ body: { access_token: 'T1', expires_at: Date.now() + 30 * 60_000 } }),
    ok,
    () => ({ status: 401, body: {} }),
    () => ({ body: { access_token: 'T2', expires_at: Date.now() + 30 * 60_000 } }),
    ok,
  ]);
  const llm = createGigaChat(cfg, { fetchImpl: f });
  await llm.complete({ system: 's', messages: [] });
  await llm.complete({ system: 's', messages: [] });
  assert.equal(log.length, 5);
  assert.equal(log[4].init.headers.authorization, 'Bearer T2');
});

test('finish_reason=blacklist помечается как отказ', async () => {
  const { f } = fakeFetch([
    () => ({ body: { access_token: 'T', expires_at: Date.now() + 30 * 60_000 } }),
    () => ({ body: { choices: [{ message: { content: 'Не люблю менять тему' }, finish_reason: 'blacklist' }] } }),
  ]);
  const r = await createGigaChat(cfg, { fetchImpl: f }).complete({ system: 's', messages: [] });
  assert.equal(r.blocked, true);
});
