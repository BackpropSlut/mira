// Ядро диалога, общее для всех каналов (Telegram и веб-чат /chat).
// Канал отдаёт сюда текст и ключ сессии, получает ответ и флаги для интерфейса.
//
// Уровень риска (risk):
//   none   обычный разговор, в том числе грусть, стресс, паника без мыслей о смерти
//   acute  реальная угроза: явная кризисная фраза (crisis.js, без модели) или модель сама поставила [[HELP]].
//          Остаётся до конца сессии: интерфейс держит карточку с номерами.

import { SYSTEM_PROMPT, HELP_MARKER, DISTRESS_NOTE } from './prompt.js';
import { detectCrisis } from './crisis.js';
import * as T from './texts.js';

export function createMira({ llm, sessions, dialog, now = Date.now, log = console }) {
  function limited(s) {
    const t = now();
    s.hits = s.hits.filter((h) => t - h < dialog.rateWindowMs);
    s.hits.push(t);
    return s.hits.length > dialog.rateLimit;
  }

  const out = (s, text, extra = {}) => ({ text, risk: s.crisis ? 'acute' : 'none', crisis: s.crisis, ...extra });

  async function answer(s, raw) {
    if (!s.consented) return { ...out(s, T.CONSENT_NEEDED), needConsent: true };
    if (limited(s)) return out(s, T.RATE_LIMITED);

    const text = raw.trim().slice(0, dialog.maxChars);
    const level = detectCrisis(raw);

    if (level === 'acute') {
      // Модель не зовём. В историю кладём факт кризиса, чтобы следующий ответ модели был бережным.
      s.crisis = true;
      s.history.push({ role: 'user', content: text }, { role: 'assistant', content: T.CRISIS });
      return out(s, T.CRISIS);
    }

    let reply;
    try {
      const system = level === 'distress' ? SYSTEM_PROMPT + DISTRESS_NOTE : SYSTEM_PROMPT;
      reply = await llm.complete({ system, messages: [...s.history, { role: 'user', content: text }] });
    } catch (err) {
      log.error?.('llm error:', err.message);
      return out(s, T.ERROR, { error: true });
    }

    if (reply.blocked || !reply.text) return out(s, T.BLOCKED);

    const flagged = reply.text.includes(HELP_MARKER);
    let answerText = reply.text.replaceAll(HELP_MARKER, '').trim();
    // Модель увидела риск впервые: каналам без карточки (Telegram) нужно добавить номера в текст.
    const newCrisis = flagged && !s.crisis;
    if (flagged) s.crisis = true;

    s.history.push({ role: 'user', content: text }, { role: 'assistant', content: answerText });
    if (s.history.length > dialog.maxTurns) s.history.splice(0, s.history.length - dialog.maxTurns);

    if (raw.length > dialog.maxChars) answerText = `${T.TOO_LONG}\n\n${answerText}`;
    return out(s, answerText, { newCrisis });
  }

  return {
    /** Сообщения одного человека обрабатываем строго по очереди, разных людей параллельно. */
    handle(key, text) {
      const s = sessions.get(key);
      const run = s.queue.then(() => answer(s, text));
      s.queue = run.catch(() => {});
      return run;
    },
    consent(key) {
      sessions.get(key).consented = true;
      return { text: T.CONSENT_OK };
    },
    reset(key) {
      const s = sessions.get(key);
      s.history = [];
      s.crisis = false;
      return { text: T.RESET };
    },
  };
}
