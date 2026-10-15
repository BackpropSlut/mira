// Поговорить с Mira в терминале, без Telegram: npm run chat
// Удобно проверять промпт и модель: LLM_PROVIDER=gigachat npm run chat

import { createInterface } from 'node:readline/promises';
import { loadConfig } from './config.js';
import { createLLM } from './llm/index.js';
import { createSessions } from './sessions.js';
import { createMira } from './mira.js';

const cfg = loadConfig();
const llm = createLLM(cfg.llm);
const mira = createMira({ llm, sessions: createSessions({ idleMs: cfg.dialog.idleMs }), dialog: cfg.dialog });
mira.consent('cli');
console.log(`Модель: ${llm.name}. /reset забыть разговор, Ctrl+C выход.\n`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on('close', () => process.exit(0));
for (;;) {
  const line = await rl.question('ты › ');
  if (!line.trim()) continue;
  const r = line.trim() === '/reset' ? mira.reset('cli') : await mira.handle('cli', line);
  console.log(`\nmira › ${r.text}\n`);
}
