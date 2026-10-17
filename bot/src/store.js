// Постоянное хранилище: согласие, тариф, коды тестеров и история премиума.
// SQLite встроен в Node 22: ни сервера базы, ни зависимостей. Файл лежит на нашем сервере в РФ (152-ФЗ, ст. 18 ч. 5).
// Переписку бесплатных пользователей сюда НЕ пишем: она живёт только в памяти (sessions.js).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сутки по Москве: лимиты обнуляются в полночь МСК, а не UTC. */
export const moscowDay = (t) => new Date(t + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function createStore(path = ':memory:', { now = Date.now } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      key TEXT PRIMARY KEY,
      consented_at INTEGER,
      premium_until INTEGER NOT NULL DEFAULT 0,
      voice_used INTEGER NOT NULL DEFAULT 0,
      voice_notified INTEGER NOT NULL DEFAULT 0,
      text_day TEXT,
      text_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS codes (
      code TEXT PRIMARY KEY,
      days INTEGER NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      redeemed_by TEXT,
      redeemed_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_key ON messages (key, id);
  `);

  const q = {
    get: db.prepare('SELECT * FROM users WHERE key = ?'),
    ensure: db.prepare('INSERT OR IGNORE INTO users (key, created_at) VALUES (?, ?)'),
    consent: db.prepare('UPDATE users SET consented_at = ? WHERE key = ?'),
    unconsent: db.prepare('UPDATE users SET consented_at = NULL WHERE key = ?'),
    premium: db.prepare('UPDATE users SET premium_until = ? WHERE key = ?'),
    voiceUsed: db.prepare('UPDATE users SET voice_used = voice_used + 1 WHERE key = ?'),
    voiceNotified: db.prepare('UPDATE users SET voice_notified = 1 WHERE key = ?'),
    text: db.prepare('UPDATE users SET text_day = ?, text_count = ? WHERE key = ?'),
    code: db.prepare('SELECT * FROM codes WHERE code = ?'),
    addCode: db.prepare('INSERT INTO codes (code, days, note, created_at) VALUES (?, ?, ?, ?)'),
    redeem: db.prepare('UPDATE codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_by IS NULL'),
    revoke: db.prepare('UPDATE codes SET revoked = 1 WHERE code = ?'),
    codes: db.prepare('SELECT * FROM codes ORDER BY created_at DESC'),
    addMsg: db.prepare('INSERT INTO messages (key, role, content, ts) VALUES (?, ?, ?, ?)'),
    lastMsgs: db.prepare('SELECT role, content, ts FROM (SELECT * FROM messages WHERE key = ? ORDER BY id DESC LIMIT ?) ORDER BY id'),
    delMsgs: db.prepare('DELETE FROM messages WHERE key = ?'),
  };

  function user(key) {
    q.ensure.run(key, now());
    return q.get.get(key);
  }
  /** Чтение без создания строки: для запросов, которые ещё ничего не доказали. */
  const peek = (key) => q.get.get(key) || null;

  const isPremium = (u) => Boolean(u && u.premium_until > now());

  return {
    peek,
    user,
    isPremium,
    plan(key) {
      const u = peek(key);
      return isPremium(u) ? { plan: 'premium', premiumUntil: new Date(u.premium_until).toISOString() } : { plan: 'free', premiumUntil: null };
    },
    consented: (key) => Boolean(peek(key)?.consented_at),
    consent(key) {
      user(key);
      q.consent.run(now(), key);
    },
    useVoice: (key) => q.voiceUsed.run(key),
    markVoiceNotified: (key) => q.voiceNotified.run(key),
    /** Считает обычное сообщение бесплатного пользователя, возвращает номер за сегодня. */
    countText(key) {
      const u = user(key);
      const day = moscowDay(now());
      const count = u.text_day === day ? u.text_count + 1 : 1;
      q.text.run(day, count, key);
      return count;
    },
    textToday(key) {
      const u = peek(key);
      return u && u.text_day === moscowDay(now()) ? u.text_count : 0;
    },

    addCode: (code, days, note = null) => q.addCode.run(code, days, note, now()),
    listCodes: () => q.codes.all(),
    /** Отзыв: код перестаёт работать, а если уже активирован, премиум этого человека заканчивается сейчас. */
    revokeCode(code) {
      const c = q.code.get(code);
      if (!c) return false;
      q.revoke.run(code);
      if (c.redeemed_by) q.premium.run(now(), c.redeemed_by);
      return true;
    },
    /** @returns {{ ok: true, premiumUntil: number } | { ok: false, error: 'bad_code' | 'used_code' }} */
    redeem(key, code) {
      const c = q.code.get(code);
      if (!c || c.revoked) return { ok: false, error: 'bad_code' };
      if (c.redeemed_by && c.redeemed_by !== key) return { ok: false, error: 'used_code' };
      const u = user(key);
      if (c.redeemed_by === key) return { ok: true, premiumUntil: u.premium_until }; // повторный ввод своего кода
      const until = Math.max(now(), u.premium_until) + c.days * DAY_MS;
      db.exec('BEGIN');
      try {
        if (q.redeem.run(key, now(), code).changes !== 1) throw new Error('race');
        q.premium.run(until, key);
        db.exec('COMMIT');
      } catch {
        db.exec('ROLLBACK');
        return { ok: false, error: 'used_code' };
      }
      return { ok: true, premiumUntil: until };
    },

    saveMessages(key, msgs) {
      const t = now();
      for (const m of msgs) q.addMsg.run(key, m.role, m.content, t);
    },
    history: (key, limit) => q.lastMsgs.all(key, limit),
    deleteHistory: (key) => q.delMsgs.run(key),
    /**
     * Отзыв согласия: удаляем всю переписку и отметку о согласии.
     * Тариф и счётчики лимитов остаются: в них нет ничего о самочувствии, а без них лимит обходился бы удалением.
     */
    forget(key) {
      q.delMsgs.run(key);
      q.unconsent.run(key);
    },
    close: () => db.close(),
  };
}
