// Ядро диалога, общее для всех каналов (Telegram сейчас, веб-чат /chat потом).
// Канал отдаёт сюда текст и ключ сессии, получает ответ и флаги для интерфейса.

import { SYSTEM_PROMPT, HELP_MARKER } from './prompt.js';
import { detectCrisis } from './crisis.js';
import * as T from './texts.js';

export function createMira({ llm, sessions, dialog, now = Date.now, log = console }) {
  function limited(s) {
    const t = now();
    s.hits = s.hits.filter((h) => t - h < dialog.rateWindowMs);
    s.hits.push(t);
    return s.hits.length > dialog.rateLimit;
  }

  async function answer(s, raw) {
    if (!s.consented) return { text: T.CONSENT_NEEDED, needConsent: true };
    if (limited(s)) return { text: T.RATE_LIMITED };

    const text = raw.trim().slice(0, dialog.maxChars);
    const level = detectCrisis(raw);

    if (level === 'acute') {
      // Модель не зовём. В историю кладём факт кризиса, чтобы следующий ответ модели был бережным.
      s.crisis = true;
      s.history.push({ role: 'user', content: text }, { role: 'assistant', content: T.CRISIS });
      return { text: T.CRISIS, crisis: true };
    }

    let reply;
    try {
      reply = await llm.complete({ system: SYSTEM_PROMPT, messages: [...s.history, { role: 'user', content: text }] });
    } catch (err) {
      log.error?.('llm error:', err.message);
      return { text: T.ERROR, error: true };
    }

    if (reply.blocked || !reply.text) {
      return { text: T.BLOCKED, crisis: true };
    }

    let out = reply.text;
    const flagged = out.includes(HELP_MARKER);
    out = out.replaceAll(HELP_MARKER, '').trim();
    const needHelp = flagged || level === 'distress' || s.crisis;
    if (flagged) s.crisis = true;

    s.history.push({ role: 'user', content: text }, { role: 'assistant', content: out });
    if (s.history.length > dialog.maxTurns) s.history.splice(0, s.history.length - dialog.maxTurns);

    if (needHelp) out += `\n${T.HELP_FOOTER}`;
    if (raw.length > dialog.maxChars) out = `${T.TOO_LONG}\n\n${out}`;
    return { text: out, crisis: needHelp };
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
