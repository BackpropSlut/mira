import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMira } from './helpers.js';
import { HELP_MARKER } from '../src/prompt.js';
import * as T from '../src/texts.js';

const dialog = { maxTurns: 4, maxChars: 50, idleMs: 1000, rateLimit: 5, rateWindowMs: 1000 };

function setup(reply = { text: 'ок', blocked: false }) {
  const calls = [];
  const llm = { complete: async (req) => { calls.push(req); return typeof reply === 'function' ? reply(req) : reply; } };
  const { mira, store } = makeMira({ llm, dialog });
  return { mira, calls, store };
}

test('без согласия модель не вызывается', async () => {
  const { mira, calls } = setup();
  const r = await mira.handle('u', 'привет');
  assert.equal(r.needConsent, true);
  assert.equal(calls.length, 0);
});

test('острый кризис: заготовленный ответ с 112 и МЧС, модель не вызывается', async () => {
  const { mira, calls } = setup();
  mira.consent('u');
  const r = await mira.handle('u', 'я не хочу жить');
  assert.equal(r.crisis, true);
  assert.equal(r.text, T.CRISIS);
  assert.match(r.text, /112/);
  assert.match(r.text, /\+7 495 989-50-50/);
  assert.equal(calls.length, 0);
});

test('после кризиса карточка остаётся до конца сессии, но номера не дублируются в каждом ответе', async () => {
  const { mira } = setup();
  mira.consent('u');
  await mira.handle('u', 'хочу умереть');
  const r = await mira.handle('u', 'ладно');
  assert.equal(r.crisis, true);
  assert.equal(r.risk, 'acute');
  assert.equal(r.text, 'ок');
});

test('модель сама увидела риск: метка вырезается, включается карточка', async () => {
  const { mira } = setup({ text: `Мне важно, что ты рассказал. ${HELP_MARKER}`, blocked: false });
  mira.consent('u');
  const r = await mira.handle('u', 'скоро всё закончится, я со всеми попрощался');
  assert.ok(!r.text.includes(HELP_MARKER));
  assert.equal(r.crisis, true);
  assert.equal(r.newCrisis, true);
  const again = await mira.handle('u', 'да');
  assert.equal(again.newCrisis, false, 'номера в текст добавляются только один раз');
  assert.equal(again.crisis, true);
});

test('паника без мыслей о смерти: отвечает модель с подсказкой, карточки нет', async () => {
  const { mira, calls } = setup();
  mira.consent('u');
  const r = await mira.handle('u', 'у меня паника, задыхаюсь');
  assert.equal(r.crisis, false);
  assert.equal(r.risk, 'none');
  assert.match(calls[0].system, /сильного дистресса/);
});

test('обычная грусть: карточки нет', async () => {
  const { mira, calls } = setup();
  mira.consent('u');
  const r = await mira.handle('u', 'грустно, поругалась с парнем');
  assert.equal(r.crisis, false);
  assert.ok(!calls[0].system.includes('сильного дистресса'));
});

test('отказ фильтра модели: мягкий ответ без карточки', async () => {
  const { mira } = setup({ text: 'Не люблю менять тему разговора...', blocked: true });
  mira.consent('u');
  const r = await mira.handle('u', 'тема');
  assert.equal(r.text, T.BLOCKED);
  assert.equal(r.crisis, false);
});

test('ошибка модели не роняет бота', async () => {
  const { mira } = setup(() => { throw new Error('boom'); });
  mira.consent('u');
  const r = await mira.handle('u', 'привет');
  assert.equal(r.text, T.ERROR);
});

test('история обрезается до maxTurns и уходит в модель с системным промптом', async () => {
  const { mira, calls } = setup();
  mira.consent('u');
  for (const m of ['1', '2', '3', '4']) await mira.handle('u', m);
  const last = calls.at(-1);
  assert.match(last.system, /Mira/);
  assert.equal(last.messages.length, 5); // 4 из истории + новое
  assert.equal(last.messages.at(-1).content, '4');
});

test('лимит сообщений', async () => {
  const { mira } = setup();
  mira.consent('u');
  let r;
  for (let i = 0; i < 6; i++) r = await mira.handle('u', `m${i}`);
  assert.equal(r.text, T.RATE_LIMITED);
});

test('reset забывает историю', async () => {
  const { mira, calls } = setup();
  mira.consent('u');
  await mira.handle('u', 'раз');
  mira.reset('u');
  await mira.handle('u', 'два');
  assert.equal(calls.at(-1).messages.length, 1);
});
