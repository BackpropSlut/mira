import { loadConfig } from './config.js';
import { createLLM } from './llm/index.js';
import { createSessions } from './sessions.js';
import { createMira } from './mira.js';
import { createTelegram } from './telegram.js';
import { createHttp } from './http.js';

const cfg = loadConfig();
if (!cfg.idSalt || !cfg.sessionSecret) console.warn('ID_SALT / SESSION_SECRET не заданы: для продакшена задай длинные случайные строки.');

const llm = createLLM(cfg.llm);
const sessions = createSessions({ idleMs: cfg.dialog.idleMs });
setInterval(sessions.sweep, 10 * 60 * 1000).unref();
const mira = createMira({ llm, sessions, dialog: cfg.dialog });
console.info(`Модель: ${llm.name}`);

// Одна память на оба входа: что человек сказал в боте, Mini App тоже помнит.
const { server } = createHttp({
  mira,
  sessions,
  botToken: cfg.telegramToken,
  idSalt: cfg.idSalt,
  sessionSecret: cfg.sessionSecret || 'mira-dev',
  allowedOrigins: cfg.allowedOrigins,
});
server.listen(cfg.port, () => console.info(`API для /chat: http://localhost:${cfg.port}`));

let tg = null;
if (cfg.telegramToken) {
  tg = createTelegram({ token: cfg.telegramToken, mira, idSalt: cfg.idSalt, webAppUrl: cfg.webAppUrl });
  tg.run();
} else {
  console.warn('Нет TELEGRAM_BOT_TOKEN: Telegram-бот не запущен, работает только API.');
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tg?.stop(); server.close(); process.exit(0); });
