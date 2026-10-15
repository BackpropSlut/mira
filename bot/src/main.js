import { loadConfig } from './config.js';
import { createLLM } from './llm/index.js';
import { createTTS } from './tts/index.js';
import { createSessions } from './sessions.js';
import { createStore } from './store.js';
import { createVoiceCache } from './voices.js';
import { createMira } from './mira.js';
import { createTelegram } from './telegram.js';
import { createHttp } from './http.js';

const cfg = loadConfig();
if (!cfg.idSalt || !cfg.sessionSecret) console.warn('ID_SALT / SESSION_SECRET не заданы: для продакшена задай длинные случайные строки.');

const llm = createLLM(cfg.llm);
const tts = createTTS(cfg.tts);
const store = createStore(cfg.dbPath);
const voices = createVoiceCache({ baseUrl: cfg.publicApiUrl });
const sessions = createSessions({ idleMs: cfg.dialog.idleMs });
setInterval(sessions.sweep, 10 * 60 * 1000).unref();
const mira = createMira({ llm, sessions, store, dialog: cfg.dialog, plans: cfg.plans, tts, voices });
console.info(`Модель: ${llm.name}. Голос: ${tts.available ? cfg.tts.provider : 'выключен'}. База: ${cfg.dbPath}`);

// Одна память на оба входа: что человек сказал в боте, Mini App тоже помнит.
const { server } = createHttp({
  mira,
  store,
  voices,
  botToken: cfg.telegramToken,
  idSalt: cfg.idSalt,
  sessionSecret: cfg.sessionSecret || 'mira-dev',
  allowedOrigins: cfg.allowedOrigins,
});
server.listen(cfg.port, () => console.info(`API для /chat: http://localhost:${cfg.port}`));

let tg = null;
if (cfg.telegramToken) {
  tg = createTelegram({ token: cfg.telegramToken, mira, store, idSalt: cfg.idSalt, webAppUrl: cfg.webAppUrl });
  tg.run();
} else {
  console.warn('Нет TELEGRAM_BOT_TOKEN: Telegram-бот не запущен, работает только API.');
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tg?.stop(); server.close(); store.close(); process.exit(0); });
