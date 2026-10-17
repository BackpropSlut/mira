// Инвайт-коды для тестеров: премиум на N дней без оплаты.
//   npm run codes -- issue 20 30 "пилот ГУУ"   выдать 20 кодов на 30 дней
//   npm run codes -- list                         все коды и кто активировал
//   npm run codes -- revoke INLO-TEST-ABC123      отозвать: код перестаёт работать, премиум по нему заканчивается

import { randomInt } from 'node:crypto';
import { createStore } from './store.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I: их путают, когда диктуют код

export function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `INLO-TEST-${s}`;
}

/** Нормализует то, что ввёл человек: регистр, пробелы, русская «М» вместо латинской и т.п. */
export function normalizeCode(input) {
  const map = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };
  return String(input || '')
    .toUpperCase()
    .replace(/[АВЕКМНОРСТХУ]/g, (ch) => map[ch])
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = createStore(process.env.DB_PATH || './data/mira.db');
  const [cmd, a, b, note] = process.argv.slice(2);
  if (cmd === 'issue') {
    const n = Number(a) || 1;
    const days = Number(b) || 30;
    for (let i = 0; i < n; i++) {
      const code = newCode();
      store.addCode(code, days, note || null);
      console.log(code);
    }
    console.error(`Выдано ${n} кодов на ${days} дн.`);
  } else if (cmd === 'list') {
    for (const c of store.listCodes()) {
      const state = c.revoked ? 'отозван' : c.redeemed_at ? `активирован ${new Date(c.redeemed_at).toISOString().slice(0, 10)}` : 'свободен';
      console.log(`${c.code}  ${c.days} дн.  ${state}${c.note ? `  (${c.note})` : ''}`);
    }
  } else if (cmd === 'revoke' && a) {
    console.log(store.revokeCode(normalizeCode(a)) ? 'Отозван' : 'Такого кода нет');
  } else {
    console.log('Команды: issue <сколько> <дней> [заметка] | list | revoke <код>');
  }
  store.close();
}
