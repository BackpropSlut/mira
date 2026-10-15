import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegram } from '../src/telegram.js';
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
