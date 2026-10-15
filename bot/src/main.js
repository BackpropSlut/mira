import { loadConfig } from './config.js';
import { createLLM } from './llm/index.js';
import { createSessions } from './sessions.js';
import { createMira } from './mira.js';
import { createTelegram } from './telegram.js';

const cfg = loadConfig();
if (!cfg.telegramToken) {
  console.error('Нет TELEGRAM_BOT_TOKEN. Скопируй .env.example в .env и заполни. Проверить диалог без Telegram: npm run chat');
  process.exit(1);
}
if (!cfg.idSalt) console.warn('ID_SALT не задан: для продакшена задай длинную случайную строку.');

const llm = createLLM(cfg.llm);
const sessions = createSessions({ idleMs: cfg.dialog.idleMs });
setInterval(sessions.sweep, 10 * 60 * 1000).unref();
const mira = createMira({ llm, sessions, dialog: cfg.dialog });
const tg = createTelegram({ token: cfg.telegramToken, mira, idSalt: cfg.idSalt, webAppUrl: cfg.webAppUrl });

console.info(`Модель: ${llm.name}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tg.stop(); process.exit(0); });
await tg.run();
