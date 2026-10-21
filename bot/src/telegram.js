// Telegram-бот. Два режима приёма сообщений:
// - long polling (по умолчанию): серверу не нужен публичный адрес и HTTPS, подойдёт любой VPS;
// - webhook (если заданы PUBLIC_API_URL и TELEGRAM_WEBHOOK_SECRET): Telegram сам шлёт апдейты на /tg/webhook.
// Документация Bot API: https://core.telegram.org/bots/api

import { timingSafeEqual } from 'node:crypto';
import { hashId } from './sessions.js';
import * as T from './texts.js';
import { normalizeCode } from './codes.js';

const CONSENT_DATA = 'consent';
const FORGET_YES = 'forget:yes';
const FORGET_NO = 'forget:no';
const TG_MAX_TEXT = 4096;
export const WEBHOOK_PATH = '/tg/webhook';

const COMMANDS = [
  { command: 'start', description: 'Начать и прочитать, кто я' },
  { command: 'help', description: 'Куда позвонить, если очень плохо' },
  { command: 'plan', description: 'Мой тариф и лимит на сегодня' },
  { command: 'code', description: 'Ввести код тестировщика' },
  { command: 'reset', description: 'Забыть наш разговор' },
  { command: 'delete', description: 'Удалить мои данные' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtDate = (t) => new Date(t).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });

/** Режет длинный текст под лимит Telegram, по абзацам, потом по пробелам. */
export function splitText(text, max = TG_MAX_TEXT) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Команда из текста: '/code@inlo_bot ABC' → { cmd: 'code', arg: 'ABC' }. */
function parseCommand(text) {
  const m = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  return m ? { cmd: m[1].toLowerCase(), arg: (m[2] || '').trim() } : null;
}

export function createTelegram({
  token,
  mira,
  store,
  idSalt,
  webAppUrl,
  plans = {},
  webhook = null, // { url, secret }
  fetchImpl = fetch,
  log = console,
}) {
  const base = `https://api.telegram.org/bot${token}`;
  let offset = 0;
  let stopped = false;

  async function api(method, params = {}, retry = true) {
    const res = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
    });
    const data = await res.json().catch(() => ({}));
    // Telegram просит подождать, когда шлём слишком часто: ждём сколько сказано и пробуем ещё раз
    const wait = data.parameters?.retry_after;
    if (!data.ok && wait && retry && wait <= 60) {
      await sleep(wait * 1000);
      return api(method, params, false);
    }
    if (!data.ok) throw new Error(`telegram ${method} ${res.status} ${data.description || ''}`);
    return data.result;
  }

  const consentKeyboard = { inline_keyboard: [[{ text: T.CONSENT_BUTTON, callback_data: CONSENT_DATA }]] };
  const appKeyboard = webAppUrl ? { inline_keyboard: [[{ text: T.OPEN_APP, web_app: { url: webAppUrl } }]] } : undefined;
  const forgetKeyboard = {
    inline_keyboard: [[{ text: T.FORGET_YES, callback_data: FORGET_YES }, { text: T.FORGET_NO, callback_data: FORGET_NO }]],
  };

  async function send(chatId, text, replyMarkup) {
    const parts = splitText(text);
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      await api('sendMessage', {
        chat_id: chatId,
        text: parts[i],
        link_preview_options: { is_disabled: true },
        ...(last && replyMarkup ? { reply_markup: replyMarkup } : {}),
      });
    }
  }

  function planText(key) {
    const p = store.plan(key);
    if (p.plan === 'premium') return T.PLAN_PREMIUM(fmtDate(p.premiumUntil));
    const total = plans.freeTextPerDay ?? 15;
    return T.PLAN_FREE(Math.max(0, total - store.textToday(key)), total);
  }

  async function onCommand(chatId, key, { cmd, arg }) {
    switch (cmd) {
      case 'start':
        // уже согласился: сразу кнопка чата, а не повторная просьба о согласии
        return send(chatId, T.START, store.consented(key) ? appKeyboard : consentKeyboard);
      case 'help':
        return send(chatId, T.HELP);
      case 'plan':
        return send(chatId, planText(key));
      case 'reset':
        return send(chatId, mira.reset(key).text);
      case 'delete':
        return send(chatId, T.FORGET_ASK, forgetKeyboard);
      case 'code': {
        const code = normalizeCode(arg);
        if (!code) return send(chatId, T.CODE_HOW);
        const r = store.redeem(key, code);
        if (!r.ok) return send(chatId, r.error === 'used_code' ? T.CODE_USED : T.CODE_BAD);
        return send(chatId, T.CODE_OK(fmtDate(r.premiumUntil)));
      }
      default:
        return null; // неизвестную команду отдаём в разговор как обычный текст
    }
  }

  async function onMessage(msg) {
    if (msg.chat?.type !== 'private') return; // в группах не работаем: там чужие люди читают
    const chatId = msg.chat.id;
    const key = hashId('tg', msg.from?.id ?? chatId, idSalt);
    const text = msg.text;

    if (!text) return send(chatId, T.ONLY_TEXT);
    const command = parseCommand(text);
    if (command) {
      const handled = await onCommand(chatId, key, command);
      if (handled !== null) return;
    }

    api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const r = await mira.handle(key, text);
    // в Telegram нет закреплённой карточки, поэтому номера идут текстом в момент, когда модель увидела риск
    const reply = r.newCrisis ? `${r.text}\n${T.HELP_FOOTER}` : r.text;
    return send(chatId, reply, r.needConsent ? consentKeyboard : undefined);
  }

  async function onCallback(cb) {
    await api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    if (!cb.message) return;
    const key = hashId('tg', cb.from.id, idSalt);
    const chatId = cb.message.chat.id;
    const known = [CONSENT_DATA, FORGET_YES, FORGET_NO];
    if (!known.includes(cb.data)) return;
    // кнопки одноразовые: убираем их, чтобы не нажать дважды
    await api('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id }).catch(() => {});
    if (cb.data === CONSENT_DATA) return send(chatId, mira.consent(key).text, appKeyboard);
    if (cb.data === FORGET_YES) return send(chatId, mira.forget(key).text);
    return send(chatId, T.FORGET_CANCELLED);
  }

  async function onUpdate(u) {
    try {
      if (u.message) await onMessage(u.message);
      else if (u.callback_query) await onCallback(u.callback_query);
    } catch (err) {
      log.error?.('update error:', err.message);
    }
  }

  /** Обработчик POST /tg/webhook. Отвечаем сразу, а сообщение разбираем после: Telegram не ждёт модель. */
  function handleWebhook(secretHeader, update) {
    const expected = Buffer.from(webhook?.secret || '');
    const got = Buffer.from(String(secretHeader || ''));
    if (!webhook?.secret || expected.length !== got.length || !timingSafeEqual(expected, got)) return false;
    if (update && typeof update === 'object') onUpdate(update);
    return true;
  }

  async function setup() {
    await api('setMyCommands', { commands: COMMANDS }).catch((e) => log.error?.(e.message));
    if (webAppUrl) {
      // кнопка слева от поля ввода: открывает /chat как Mini App
      await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Чат', web_app: { url: webAppUrl } } })
        .catch((e) => log.error?.(e.message));
    }
    const me = await api('getMe');
    log.info?.(`Telegram: @${me.username}`);
  }

  async function run() {
    await setup();
    const allowed = ['message', 'callback_query'];
    if (webhook?.url) {
      await api('setWebhook', { url: webhook.url, secret_token: webhook.secret, allowed_updates: allowed, max_connections: 20 });
      log.info?.(`Telegram: webhook ${webhook.url}`);
      return;
    }
    // getUpdates не работает, пока висит webhook: снимаем его, если раньше включали
    await api('deleteWebhook', {}).catch((e) => log.error?.(e.message));
    while (!stopped) {
      let updates;
      try {
        updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: allowed });
      } catch (err) {
        log.error?.('poll error:', err.message);
        await sleep(3000);
        continue;
      }
      for (const u of updates) {
        offset = u.update_id + 1;
        onUpdate(u); // не ждём: медленный ответ модели одному человеку не задерживает остальных
      }
    }
  }

  return { run, stop: () => { stopped = true; }, onUpdate, handleWebhook };
}
