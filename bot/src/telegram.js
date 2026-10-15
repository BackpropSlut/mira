// Telegram через long polling: серверу не нужен публичный адрес и HTTPS, подойдёт любой VPS.
// Документация Bot API: https://core.telegram.org/bots/api

import { hashId } from './sessions.js';
import * as T from './texts.js';
import { normalizeCode } from './codes.js';

const CONSENT_DATA = 'consent';

export function createTelegram({ token, mira, store, idSalt, webAppUrl, fetchImpl = fetch, log = console }) {
  const base = `https://api.telegram.org/bot${token}`;
  let offset = 0;
  let stopped = false;

  async function api(method, params = {}) {
    const res = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`telegram ${method} ${res.status} ${data.description || ''}`);
    return data.result;
  }

  const consentKeyboard = { inline_keyboard: [[{ text: T.CONSENT_BUTTON, callback_data: CONSENT_DATA }]] };
  const appKeyboard = webAppUrl ? { inline_keyboard: [[{ text: 'Открыть Mira', web_app: { url: webAppUrl } }]] } : undefined;

  const send = (chatId, text, replyMarkup) =>
    api('sendMessage', { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });

  async function onMessage(msg) {
    if (msg.chat?.type !== 'private') return; // в группах не работаем: там чужие люди читают
    const chatId = msg.chat.id;
    const key = hashId('tg', msg.from?.id ?? chatId, idSalt);
    const text = msg.text;

    if (!text) return send(chatId, T.ONLY_TEXT);
    if (text.startsWith('/start')) return send(chatId, T.START, consentKeyboard);
    if (text.startsWith('/help')) return send(chatId, T.HELP);
    if (text.startsWith('/reset')) return send(chatId, mira.reset(key).text);
    if (text.startsWith('/code')) {
      const code = normalizeCode(text.slice(5));
      if (!code) return send(chatId, 'Напиши код после команды, например: /code MIRA-TEST-ABC123');
      const r = store.redeem(key, code);
      if (!r.ok) return send(chatId, r.error === 'used_code' ? T.CODE_USED : T.CODE_BAD);
      return send(chatId, T.CODE_OK(new Date(r.premiumUntil).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' })));
    }

    api('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const r = await mira.handle(key, text);
    // в Telegram нет закреплённой карточки, поэтому номера идут текстом в момент, когда модель увидела риск
    const reply = r.newCrisis ? `${r.text}\n${T.HELP_FOOTER}` : r.text;
    return send(chatId, reply, r.needConsent ? consentKeyboard : undefined);
  }

  async function onCallback(cb) {
    await api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    if (cb.data !== CONSENT_DATA || !cb.message) return;
    const key = hashId('tg', cb.from.id, idSalt);
    const chatId = cb.message.chat.id;
    await api('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id }).catch(() => {});
    return send(chatId, mira.consent(key).text, appKeyboard);
  }

  async function onUpdate(u) {
    try {
      if (u.message) await onMessage(u.message);
      else if (u.callback_query) await onCallback(u.callback_query);
    } catch (err) {
      log.error?.('update error:', err.message);
    }
  }

  async function run() {
    await api('setMyCommands', {
      commands: [
        { command: 'start', description: 'Начать и прочитать о Mira' },
        { command: 'help', description: 'Куда позвонить, если очень плохо' },
        { command: 'reset', description: 'Забыть наш разговор' },
        { command: 'code', description: 'Ввести код тестировщика' },
      ],
    }).catch((e) => log.error?.(e.message));
    if (webAppUrl) {
      // кнопка слева от поля ввода: открывает /chat как Mini App
      await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Mira', web_app: { url: webAppUrl } } })
        .catch((e) => log.error?.(e.message));
    }
    const me = await api('getMe');
    log.info?.(`Mira в Telegram: @${me.username}`);

    while (!stopped) {
      let updates;
      try {
        updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
      } catch (err) {
        log.error?.('poll error:', err.message);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      for (const u of updates) {
        offset = u.update_id + 1;
        onUpdate(u); // не ждём: медленный ответ модели одному человеку не задерживает остальных
      }
    }
  }

  return { run, stop: () => { stopped = true; }, onUpdate };
}
