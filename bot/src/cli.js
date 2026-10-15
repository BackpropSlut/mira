// Поговорить с Mira в терминале, без Telegram: npm run chat
// Удобно проверять промпт и модель: LLM_PROVIDER=gigachat npm run chat

import { createInterface } from 'node:readline/promises';
import { loadConfig } from './config.js';
import { createLLM } from './llm/index.js';
import { createSessions } from './sessions.js';
import { createMira } from './mira.js';
import { createStore } from './store.js';
import { HELP_FOOTER } from './texts.js';

const cfg = loadConfig();
const llm = createLLM(cfg.llm);
// база в памяти: терминальные разговоры никуда не сохраняются, лимитов нет (премиум)
const store = createStore(':memory:');
store.addCode('CLI', 3650);
store.redeem('cli', 'CLI');
const mira = createMira({ llm, sessions: createSessions({ idleMs: cfg.dialog.idleMs }), store, dialog: cfg.dialog, plans: cfg.plans });
mira.consent('cli');
console.log(`Модель: ${llm.name}. /reset забыть разговор, Ctrl+C выход.\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on('close', () => process.exit(0));
for (;;) {
  const line = await rl.question('ты › ');
  if (!line.trim()) continue;
  const r = line.trim() === '/reset' ? mira.reset('cli') : await mira.handle('cli', line);
  console.log(`\nmira › ${r.text}${r.newCrisis ? `\n${HELP_FOOTER}` : ''}${r.crisis ? '\n[карточка помощи закреплена]' : ''}\n`);
}
