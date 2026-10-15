import { createMira } from '../src/mira.js';
import { createSessions } from '../src/sessions.js';
import { createStore } from '../src/store.js';

export const dialog = { maxTurns: 10, maxChars: 2000, idleMs: 60_000, rateLimit: 50, rateWindowMs: 60_000 };

/** Ядро Mira с базой в памяти. */
export function makeMira({ llm, dialog: d = dialog, plans = { freeVoiceTrial: 5, freeTextPerDay: 100 }, tts, voices, now } = {}) {
  const store = createStore(':memory:', now ? { now } : {});
  const sessions = createSessions({ idleMs: d.idleMs, ...(now ? { now } : {}) });
  const mira = createMira({ llm, sessions, store, dialog: d, plans, tts, voices, log: {}, ...(now ? { now } : {}) });
  return { mira, store, sessions };
}
