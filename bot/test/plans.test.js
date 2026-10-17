import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMira } from './helpers.js';
import { createMira } from '../src/mira.js';
import { createSessions } from '../src/sessions.js';
import { createStore, moscowDay } from '../src/store.js';
import { createVoiceCache } from '../src/voices.js';
import { normalizeCode, newCode } from '../src/codes.js';
import * as T from '../src/texts.js';

const DAY = 24 * 60 * 60 * 1000;
const fakeTTS = { available: true, async synthesize(text, { voice }) { return { data: Buffer.from(`${voice}:${text}`), mime: 'audio/ogg' }; } };

function counting() {
  const calls = [];
  return { calls, llm: { complete: async (r) => { calls.push(r); return { text: 'ок', blocked: false }; } } };
}

test('бесплатный тариф: дневной лимит текста, модель не вызывается', async () => {
  const { calls, llm } = counting();
  const { mira } = makeMira({ llm, plans: { freeVoiceTrial: 5, freeTextPerDay: 3 } });
  mira.consent('u');
  for (let i = 0; i < 3; i++) assert.equal((await mira.handle('u', `сообщение ${i}`)).limit, null);
  const r = await mira.handle('u', 'ещё');
  assert.equal(r.limit, 'text');
  assert.equal(r.text, T.TEXT_LIMIT);
  assert.equal(calls.length, 3);
});

test('лимит текста не мешает кризису и сильному дистрессу', async () => {
  const { calls, llm } = counting();
  const { mira } = makeMira({ llm, plans: { freeVoiceTrial: 5, freeTextPerDay: 1 } });
  mira.consent('u');
  await mira.handle('u', 'привет');
  const distress = await mira.handle('u', 'мне очень плохо');
  assert.equal(distress.limit, null);
  assert.equal(calls.length, 2);
  const acute = await mira.handle('u', 'не хочу жить');
  assert.equal(acute.text, T.CRISIS);
  const after = await mira.handle('u', 'спасибо');
  assert.equal(after.limit, null, 'после кризиса лимит не включается до конца разговора');
});

test('лимит обнуляется в полночь по Москве', async () => {
  let t = Date.UTC(2026, 9, 15, 20, 0); // 23:00 МСК
  const { llm } = counting();
  const { mira } = makeMira({ llm, plans: { freeVoiceTrial: 5, freeTextPerDay: 1 }, now: () => t });
  mira.consent('u');
  await mira.handle('u', 'раз');
  assert.equal((await mira.handle('u', 'два')).limit, 'text');
  t += 2 * 60 * 60 * 1000; // 01:00 МСК следующего дня
  assert.notEqual(moscowDay(t), moscowDay(t - 2 * 60 * 60 * 1000));
  assert.equal((await mira.handle('u', 'три')).limit, null);
});

test('коды тестеров: премиум, повтор своего кода, чужой код, отзыв', () => {
  let t = 1_000_000;
  const store = createStore(':memory:', { now: () => t });
  store.addCode('MIRA-TEST-AAAAAA', 30);
  store.addCode('MIRA-TEST-BBBBBB', 10);
  assert.deepEqual(store.redeem('u', 'MIRA-TEST-ZZZZZZ'), { ok: false, error: 'bad_code' });
  const r = store.redeem('u', 'MIRA-TEST-AAAAAA');
  assert.equal(r.ok, true);
  assert.equal(r.premiumUntil, t + 30 * DAY);
  assert.equal(store.plan('u').plan, 'premium');
  assert.equal(store.redeem('u', 'MIRA-TEST-AAAAAA').ok, true, 'повторный ввод своего кода не ошибка');
  assert.deepEqual(store.redeem('v', 'MIRA-TEST-AAAAAA'), { ok: false, error: 'used_code' });
  assert.equal(store.redeem('u', 'MIRA-TEST-BBBBBB').premiumUntil, t + 40 * DAY, 'второй код продлевает');
  t += 41 * DAY;
  assert.equal(store.plan('u').plan, 'free', 'премиум заканчивается сам');
  store.addCode('MIRA-TEST-CCCCCC', 30);
  store.redeem('w', 'MIRA-TEST-CCCCCC');
  assert.equal(store.revokeCode('MIRA-TEST-CCCCCC'), true);
  assert.equal(store.plan('w').plan, 'free', 'отзыв заканчивает премиум');
  assert.deepEqual(store.redeem('x', 'MIRA-TEST-CCCCCC'), { ok: false, error: 'bad_code' });
});

test('код можно ввести как угодно: регистр, пробелы, русские буквы', () => {
  assert.equal(normalizeCode(' mira-test-abc123 '), 'MIRA-TEST-ABC123');
  assert.equal(normalizeCode('МIRА-ТЕSТ-АВС123'), 'MIRA-TEST-ABC123');
  assert.match(newCode(), /^INLO-TEST-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(normalizeCode(' inlo-test-abc123 '), 'INLO-TEST-ABC123');
});

test('скрытый пробный голос: N ответов, потом один раз limit=voice, дальше только текст', async () => {
  const { llm } = counting();
  const voices = createVoiceCache();
  const { mira } = makeMira({ llm, plans: { freeVoiceTrial: 2, freeTextPerDay: 100 }, tts: fakeTTS, voices });
  mira.consent('u');
  const a = await mira.handle('u', 'раз', { voice: 'f' });
  assert.match(a.voice.url, /^\/v1\/voice\/[0-9a-f]{32}$/);
  assert.equal(voices.get(a.voice.url.split('/').at(-1)).mime, 'audio/ogg');
  assert.ok((await mira.handle('u', 'два', { voice: 'f' })).voice);
  const c = await mira.handle('u', 'три', { voice: 'f' });
  assert.equal(c.voice, null);
  assert.equal(c.limit, 'voice');
  const d = await mira.handle('u', 'четыре', { voice: 'f' });
  assert.equal(d.limit, null, 'о лимите говорим один раз');
  assert.equal(d.voice, null);
  const crisis = await mira.handle('u', 'хочу умереть', { voice: 'f' });
  assert.ok(crisis.voice, 'кризисный ответ озвучивается всегда');
});

test('выключенный голос не тратит пробный лимит, премиум без лимита', async () => {
  const { llm } = counting();
  const { mira, store } = makeMira({ llm, plans: { freeVoiceTrial: 1, freeTextPerDay: 100 }, tts: fakeTTS, voices: createVoiceCache() });
  mira.consent('u');
  assert.equal((await mira.handle('u', 'раз', { voice: 'off' })).voice, null);
  assert.ok((await mira.handle('u', 'два', { voice: 'm' })).voice, 'пробный голос ещё не потрачен');
  store.addCode('P', 30);
  store.redeem('u', 'P');
  for (let i = 0; i < 3; i++) assert.ok((await mira.handle('u', `п${i}`, { voice: 'm' })).voice);
});

test('история: премиум продолжает разговор после перезапуска, бесплатный нет', async () => {
  const store = createStore(':memory:');
  const { calls, llm } = counting();
  const dialog = { maxTurns: 10, maxChars: 2000, idleMs: 60_000, rateLimit: 50, rateWindowMs: 60_000 };
  const plans = { freeVoiceTrial: 0, freeTextPerDay: 100 };
  const boot = () => createMira({ llm, sessions: createSessions({ idleMs: 60_000 }), store, dialog, plans, log: {} });

  let mira = boot();
  mira.consent('free');
  mira.consent('prem');
  store.addCode('P', 30);
  store.redeem('prem', 'P');
  await mira.handle('free', 'секрет бесплатного');
  await mira.handle('prem', 'секрет премиума');

  mira = boot(); // перезапуск: память процесса пуста, база осталась
  await mira.handle('free', 'привет');
  assert.equal(calls.at(-1).messages.length, 1);
  await mira.handle('prem', 'привет');
  assert.equal(calls.at(-1).messages[0].content, 'секрет премиума');
  assert.equal(store.history('free', 10).length, 0, 'бесплатную переписку не пишем на диск');

  mira.reset('prem');
  assert.equal(store.history('prem', 10).length, 0, 'reset удаляет сохранённую историю');
  assert.equal(store.plan('prem').plan, 'premium', 'а тариф остаётся');
});
