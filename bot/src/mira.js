// Ядро диалога, общее для всех каналов (Telegram и веб-чат /chat).
// Канал отдаёт сюда текст и ключ человека, получает ответ и флаги для интерфейса.
//
// Уровень риска (risk):
//   none   обычный разговор, в том числе грусть, стресс, паника без мыслей о смерти
//   acute  реальная угроза: явная кризисная фраза (crisis.js, без модели) или модель сама поставила [[HELP]].
//          Остаётся до конца разговора: интерфейс держит карточку с номерами.
//
// Тарифы (решение Петра 15.10):
//   free     текст до FREE_TEXT_PER_DAY сообщений в сутки, скрытый пробный голос FREE_VOICE_TRIAL ответов,
//            история не сохраняется между разговорами
//   premium  голос и текст без лимитов, история сохраняется
//   Кризис не лимитируется никогда: ни текст, ни голос, ни при каком тарифе.

import { SYSTEM_PROMPT, HELP_MARKER, DISTRESS_NOTE } from './prompt.js';
import { detectCrisis } from './crisis.js';
import * as T from './texts.js';

const NO_TTS = { available: false, async synthesize() { return null; } };

export function createMira({ llm, sessions, store, dialog, plans, tts = NO_TTS, voices = null, now = Date.now, log = console }) {
  function limited(s) {
    const t = now();
    s.hits = s.hits.filter((h) => t - h < dialog.rateWindowMs);
    s.hits.push(t);
    return s.hits.length > dialog.rateLimit;
  }

  function session(key, premium) {
    const s = sessions.get(key);
    if (!s.loaded) {
      // премиум продолжает разговор с того места, где остановился
      if (premium) s.history = store.history(key, dialog.maxTurns).map(({ role, content }) => ({ role, content }));
      s.loaded = true;
    }
    return s;
  }

  function remember(key, s, premium, user, assistant) {
    s.history.push({ role: 'user', content: user }, { role: 'assistant', content: assistant });
    if (s.history.length > dialog.maxTurns) s.history.splice(0, s.history.length - dialog.maxTurns);
    if (premium) store.saveMessages(key, [{ role: 'user', content: user }, { role: 'assistant', content: assistant }]);
  }

  /** Голосовой ответ по правилам тарифа. Возвращает { voice, limit }. */
  async function speak(key, u, text, { voice, crisis }) {
    if (!tts.available || !voices || !voice || voice === 'off') return { voice: null, limit: null };
    const premium = store.isPremium(u);
    const allowed = premium || crisis || u.voice_used < plans.freeVoiceTrial;
    if (!allowed) {
      // Лимит скрытый: счётчика в интерфейсе нет, только один раз мягко сообщаем, что голос в премиуме.
      if (!u.voice_notified) {
        store.markVoiceNotified(key);
        return { voice: null, limit: 'voice' };
      }
      return { voice: null, limit: null };
    }
    try {
      const audio = await tts.synthesize(text, { voice });
      if (!audio) return { voice: null, limit: null };
      if (!premium && !crisis) store.useVoice(key);
      return { voice: { url: voices.put(audio) }, limit: null };
    } catch (err) {
      log.error?.('tts error:', err.message);
      return { voice: null, limit: null };
    }
  }

  async function answer(key, raw, opts) {
    if (!store.consented(key)) return { text: T.CONSENT_NEEDED, risk: 'none', crisis: false, needConsent: true };
    const u = store.user(key);
    const premium = store.isPremium(u);
    const s = session(key, premium);
    const out = (text, extra = {}) => ({ text, risk: s.crisis ? 'acute' : 'none', crisis: s.crisis, limit: null, voice: null, ...extra });

    if (limited(s)) return out(T.RATE_LIMITED);

    const text = raw.trim().slice(0, dialog.maxChars);
    const level = detectCrisis(raw);

    if (level === 'acute') {
      // Модель не зовём. В историю кладём факт кризиса, чтобы следующий ответ модели был бережным.
      s.crisis = true;
      remember(key, s, premium, text, T.CRISIS);
      return out(T.CRISIS, await speak(key, u, T.CRISIS, { ...opts, crisis: true }));
    }

    // Дневной лимит текста для бесплатного тарифа. Не трогаем человека в кризисе или в сильном дистрессе.
    if (!premium && !s.crisis && level !== 'distress') {
      if (store.textToday(key) >= plans.freeTextPerDay) return out(T.TEXT_LIMIT, { limit: 'text' });
      store.countText(key);
    }

    let reply;
    try {
      const system = level === 'distress' ? SYSTEM_PROMPT + DISTRESS_NOTE : SYSTEM_PROMPT;
      reply = await llm.complete({ system, messages: [...s.history, { role: 'user', content: text }] });
    } catch (err) {
      log.error?.('llm error:', err.message);
      return out(T.ERROR, { error: true });
    }

    if (reply.blocked || !reply.text) return out(T.BLOCKED);

    const flagged = reply.text.includes(HELP_MARKER);
    let answerText = reply.text.replaceAll(HELP_MARKER, '').trim();
    // Модель увидела риск впервые: каналам без карточки (Telegram) нужно добавить номера в текст.
    const newCrisis = flagged && !s.crisis;
    if (flagged) s.crisis = true;

    remember(key, s, premium, text, answerText);
    const spoken = await speak(key, u, answerText, { ...opts, crisis: s.crisis });
    if (raw.length > dialog.maxChars) answerText = `${T.TOO_LONG}\n\n${answerText}`;
    return out(answerText, { newCrisis, ...spoken });
  }

  return {
    /** Сообщения одного человека обрабатываем строго по очереди, разных людей параллельно. */
    handle(key, text, opts = {}) {
      const s = sessions.get(key);
      const run = s.queue.then(() => answer(key, text, opts));
      s.queue = run.catch(() => {});
      return run;
    },
    consent(key) {
      store.consent(key);
      return { text: T.CONSENT_OK };
    },
    /** Забыть разговор: и текущий контекст, и сохранённую историю премиума. Тариф не трогаем. */
    reset(key) {
      const s = sessions.get(key);
      s.history = [];
      s.crisis = false;
      s.loaded = true;
      store.deleteHistory(key);
      return { text: T.RESET };
    },
    /** Удалить мои данные: разговор, историю и согласие. Чтобы продолжить, нужно снова согласиться. */
    forget(key) {
      sessions.reset(key);
      store.forget(key);
      return { text: T.FORGOTTEN };
    },
  };
}
