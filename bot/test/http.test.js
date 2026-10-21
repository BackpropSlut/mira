import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHttp } from '../src/http.js';
import { makeMira } from './helpers.js';
import { createVoiceCache } from '../src/voices.js';
import { createStub } from '../src/llm/stub.js';
import { verifyInitData } from '../src/auth.js';

const BOT = '123:TEST';
const ORIGIN = 'https://mira.example';

function initData(user, { authDate = Math.floor(Date.now() / 1000), token = BOT } = {}) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: 'q', user: JSON.stringify(user) });
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}

let base, mira, server, store;
before(async () => {
  ({ mira, store } = makeMira({ llm: createStub() }));
  ({ server } = createHttp({ mira, store, voices: createVoiceCache(), botToken: BOT, idSalt: 's', sessionSecret: 'sec', allowedOrigins: [ORIGIN], log: {} }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (path, token) => fetch(base + path, { headers: { origin: ORIGIN, authorization: `Bearer ${token}` } });
const post = (path, body, token, origin = ORIGIN) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

test('initData: верная подпись проходит, подделка и старые данные нет', () => {
  assert.deepEqual(verifyInitData(initData({ id: 42 }), BOT), { id: 42 });
  assert.equal(verifyInitData(initData({ id: 42 }, { token: '999:OTHER' }), BOT), null);
  assert.equal(verifyInitData(initData({ id: 42 }).replace('42', '43'), BOT), null);
  assert.equal(verifyInitData(initData({ id: 42 }, { authDate: 1000 }), BOT), null);
});

test('веб: сессия → без согласия просим его → согласие → ответ', async () => {
  let r = await post('/v1/session', { channel: 'web' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  const { token, consented } = await r.json();
  assert.equal(consented, false);

  r = await post('/v1/chat', { text: 'привет' }, token);
  assert.equal((await r.json()).needConsent, true);

  r = await post('/v1/consent', { adult: true, health: false }, token);
  assert.equal(r.status, 400);
  r = await post('/v1/consent', { adult: true, health: true }, token);
  assert.equal(r.status, 200);

  r = await post('/v1/chat', { text: 'привет' }, token);
  const body = await r.json();
  assert.match(body.text, /заглушка/);
  assert.equal(body.crisis, false);

  r = await post('/v1/session', { channel: 'web', token });
  const again = await r.json();
  assert.equal(again.consented, true, 'старый токен возвращает ту же сессию');
});

test('кризис через API: флаг crisis и номера', async () => {
  const { token } = await (await post('/v1/session', { channel: 'web' })).json();
  await post('/v1/consent', { adult: true, health: true }, token);
  const body = await (await post('/v1/chat', { text: 'не хочу жить' }, token)).json();
  assert.equal(body.crisis, true);
  assert.match(body.text, /989-50-50/);
});

test('Mini App делит согласие с ботом', async () => {
  mira.consent((await import('../src/sessions.js')).hashId('tg', 77, 's'));
  const r = await post('/v1/session', { channel: 'tg', initData: initData({ id: 77 }) });
  assert.equal((await r.json()).consented, true);
  const bad = await post('/v1/session', { channel: 'tg', initData: 'hash=abc&user=%7B%22id%22%3A77%7D' });
  assert.equal(bad.status, 401);
});

test('без токена, с поддельным токеном и с чужого сайта нельзя', async () => {
  assert.equal((await post('/v1/chat', { text: 'x' })).status, 401);
  assert.equal((await post('/v1/chat', { text: 'x' }, 'web-abc.forged')).status, 401);
  assert.equal((await post('/v1/session', { channel: 'web' }, null, 'https://evil.example')).status, 403);
});

test('оценка 1–5 и preflight CORS', async () => {
  const { token } = await (await post('/v1/session', { channel: 'web' })).json();
  assert.equal((await post('/v1/rating', { score: 4 }, token)).status, 200);
  assert.equal((await post('/v1/rating', { score: 9 }, token)).status, 400);
  const pre = await fetch(`${base}/v1/chat`, { method: 'OPTIONS', headers: { origin: ORIGIN } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-headers'), /authorization/);
});

test('тариф, код, история через API', async () => {
  const { token } = await (await post('/v1/session', { channel: 'web' })).json();
  await post('/v1/consent', { adult: true, health: true }, token);
  let s = await (await post('/v1/session', { channel: 'web', token })).json();
  assert.equal(s.plan, 'free');
  assert.equal(s.premiumUntil, null);

  assert.equal((await get('/v1/history', token)).status, 403);
  let r = await post('/v1/redeem', { code: 'MIRA-TEST-NOPE00' }, token);
  assert.deepEqual([r.status, (await r.json()).error], [400, 'bad_code']);

  store.addCode('MIRA-TEST-HTTP22', 30);
  r = await post('/v1/redeem', { code: 'mira-test-http22' }, token);
  const plan = await r.json();
  assert.equal(plan.plan, 'premium');
  assert.ok(Date.parse(plan.premiumUntil) > Date.now());

  const chat = await (await post('/v1/chat', { text: 'привет', voice: 'f' }, token)).json();
  assert.equal(chat.voice, null, 'синтеза пока нет');
  assert.equal(chat.limit, null);
  const h = await (await get('/v1/history', token)).json();
  assert.deepEqual(h.messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(h.messages[0].text, 'привет');
  assert.equal((await get('/v1/voice/' + 'a'.repeat(32), token)).status, 404);
});

test('/v1/forget: без confirm не удаляет, с confirm снимает согласие', async () => {
  const s = await (await post('/v1/session', { channel: 'web' })).json();
  await post('/v1/consent', { adult: true, health: true }, s.token);
  assert.equal((await post('/v1/forget', {}, s.token)).status, 400);
  const r = await post('/v1/forget', { confirm: true }, s.token);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).consented, false);
  const again = await (await post('/v1/session', { channel: 'web', token: s.token })).json();
  assert.equal(again.consented, false);
});
