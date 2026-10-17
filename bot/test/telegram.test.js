import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegram, splitText } from '../src/telegram.js';
import { createHttp } from '../src/http.js';
import { createVoiceCache } from '../src/voices.js';
import { makeMira } from './helpers.js';
import { createStub } from '../src/llm/stub.js';


function setup() {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ method: url.split('/').at(-1), params: JSON.parse(init.body) });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  const { mira, store } = makeMira({ llm: createStub() });
  const tg = createTelegram({ token: 'X', mira, store, idSalt: 's', webAppUrl: '', fetchImpl, log: {} });
  const msg = (text) => ({ message: { chat: { id: 7, type: 'private' }, from: { id: 42 }, text } });
  const messages = () => sent.filter((s) => s.method === 'sendMessage').map((s) => s.params);
  return { tg, msg, messages, store };
}

test('/start → дисклеймер с кнопкой согласия, затем диалог', async () => {
  const { tg, msg, messages } = setup();
  await tg.onUpdate(msg('/start'));
  assert.match(messages()[0].text, /18/);
  assert.equal(messages()[0].reply_markup.inline_keyboard[0][0].callback_data, 'consent');

  await tg.onUpdate(msg('привет'));
  assert.ok(messages()[1].reply_markup, 'без согласия снова просим его');

  await tg.onUpdate({ callback_query: { id: 'c', data: 'consent', from: { id: 42 }, message: { chat: { id: 7 }, message_id: 1 } } });
  await tg.onUpdate(msg('привет'));
  assert.match(messages().at(-1).text, /заглушка/);
});

test('группы игнорируем', async () => {
  const { tg, messages } = setup();
  await tg.onUpdate({ message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: '/start' } });
  assert.equal(messages().length, 0);
});

test('Telegram: когда модель впервые видит риск, номера добавляются в текст', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ method: url.split('/').at(-1), params: JSON.parse(init.body) });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  const llm = { complete: async () => ({ text: 'Мне важно это знать. [[HELP]]', blocked: false }) };
  const { mira, store } = makeMira({ llm });
  const tg = createTelegram({ token: 'X', mira, store, idSalt: 's', webAppUrl: '', fetchImpl, log: {} });
  await tg.onUpdate({ callback_query: { id: 'c', data: 'consent', from: { id: 5 }, message: { chat: { id: 5 }, message_id: 1 } } });
  await tg.onUpdate({ message: { chat: { id: 5, type: 'private' }, from: { id: 5 }, text: 'всё бессмысленно' } });
  const last = sent.filter((s) => s.method === 'sendMessage').at(-1).params.text;
  assert.match(last, /989-50-50/);
  assert.ok(!last.includes('[[HELP]]'));
});

test('/plan показывает остаток на сегодня, /code его снимает', async () => {
  const { tg, msg, messages, store } = setup();
  await tg.onUpdate(msg('/plan'));
  assert.match(messages().at(-1).text, /бесплатный.*осталось \d+ из \d+/s);
  store.addCode('MIRA-TEST-ABCDEF', 30);
  await tg.onUpdate(msg('/code@some_bot mira-test-abcdef'));
  await tg.onUpdate(msg('/plan'));
  assert.match(messages().at(-1).text, /премиум до/);
});

test('/delete спрашивает подтверждение, «да» удаляет согласие и историю', async () => {
  const { tg, msg, messages, store } = setup();
  const cb = (data) => ({ callback_query: { id: 'c', data, from: { id: 42 }, message: { chat: { id: 7 }, message_id: 1 } } });
  await tg.onUpdate(cb('consent'));
  await tg.onUpdate(msg('/delete'));
  const ask = messages().at(-1);
  assert.deepEqual(ask.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ['forget:yes', 'forget:no']);

  await tg.onUpdate(cb('forget:no'));
  await tg.onUpdate(msg('привет'));
  assert.match(messages().at(-1).text, /заглушка/, '«нет» ничего не удаляет');

  await tg.onUpdate(msg('/delete'));
  await tg.onUpdate(cb('forget:yes'));
  assert.match(messages().at(-1).text, /\/start/);
  await tg.onUpdate(msg('привет'));
  assert.ok(messages().at(-1).reply_markup, 'после удаления снова нужно согласие');
});

test('/start после согласия даёт кнопку чата, а не повторное согласие', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ method: url.split('/').at(-1), params: JSON.parse(init.body) });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  const { mira, store } = makeMira({ llm: createStub() });
  const tg = createTelegram({ token: 'X', mira, store, idSalt: 's', webAppUrl: 'https://app.example/chat', fetchImpl, log: {} });
  await tg.onUpdate({ callback_query: { id: 'c', data: 'consent', from: { id: 1 }, message: { chat: { id: 1 }, message_id: 1 } } });
  await tg.onUpdate({ message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/start' } });
  const btn = sent.filter((s) => s.method === 'sendMessage').at(-1).params.reply_markup.inline_keyboard[0][0];
  assert.equal(btn.web_app.url, 'https://app.example/chat');
});

test('длинный ответ режется под лимит Telegram', () => {
  const text = ('абзац '.repeat(300) + '\n').repeat(5);
  const parts = splitText(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 4096));
  assert.equal(parts.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim());
});

test('429 от Telegram: ждём retry_after и повторяем один раз', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1
      ? { status: 429, json: async () => ({ ok: false, parameters: { retry_after: 0.01 } }) }
      : { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  const { mira, store } = makeMira({ llm: createStub() });
  const tg = createTelegram({ token: 'X', mira, store, idSalt: 's', webAppUrl: '', fetchImpl, log: {} });
  await tg.onUpdate({ message: { chat: { id: 1, type: 'private' }, from: { id: 1 }, text: '/help' } });
  assert.equal(calls, 2);
});

test('webhook: без верного секрета апдейт не принимается', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ method: url.split('/').at(-1), params: JSON.parse(init.body) });
    return { status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  const { mira, store } = makeMira({ llm: createStub() });
  const tg = createTelegram({ token: 'X', mira, store, idSalt: 's', webAppUrl: '', webhook: { url: 'https://api.example/tg/webhook', secret: 'top_secret' }, fetchImpl, log: {} });
  const { server } = createHttp({ mira, store, voices: createVoiceCache(), botToken: 'X', idSalt: 's', sessionSecret: 'k', allowedOrigins: [], telegram: tg, log: {} });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/tg/webhook`;
  const update = { update_id: 1, message: { chat: { id: 3, type: 'private' }, from: { id: 3 }, text: '/help' } };
  const hit = (secret) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: JSON.stringify(update) });
  try {
    assert.equal((await hit()).status, 403);
    assert.equal((await hit('wrong_secret')).status, 403);
    assert.equal(sent.length, 0);
    assert.equal((await hit('top_secret')).status, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.match(sent.find((s) => s.method === 'sendMessage').params.text, /112/);
  } finally {
    server.close();
  }
});
