// HTTP API для веб-чата /chat (на сайте и внутри Telegram как Mini App). Контракт: bot/API.md

import { createServer } from 'node:http';
import { verifyInitData, createTokens } from './auth.js';
import { hashId } from './sessions.js';
import { normalizeCode } from './codes.js';
import { WEBHOOK_PATH } from './telegram.js';

const MAX_BODY = 16 * 1024;
const SESSION_LIMIT = 30; // новых сессий с одного IP
const SESSION_WINDOW_MS = 10 * 60 * 1000;
const REDEEM_LIMIT = 10; // попыток ввести код в час с одного человека: коды не подбираются перебором
const VOICE_RE = /^\/v1\/voice\/([0-9a-f]{32})$/;

export function createHttp({ mira, store, voices, botToken, idSalt, sessionSecret, allowedOrigins, telegram = null, log = console }) {
  const tokens = createTokens(sessionSecret);
  const ratings = [0, 0, 0, 0, 0];
  const ipHits = new Map();
  const redeemHits = new Map();

  function ipLimited(req) {
    const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const t = Date.now();
    const list = (ipHits.get(ip) || []).filter((h) => t - h < SESSION_WINDOW_MS);
    list.push(t);
    ipHits.set(ip, list);
    if (ipHits.size > 10_000) ipHits.clear();
    return list.length > SESSION_LIMIT;
  }

  function send(res, status, body, origin) {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (origin && allowedOrigins.includes(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers.vary = 'Origin';
    }
    res.writeHead(status, headers);
    res.end(body === null ? '' : JSON.stringify(body));
  }

  async function readJson(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw Object.assign(new Error('too big'), { status: 413 });
      chunks.push(c);
    }
    try {
      return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      throw Object.assign(new Error('bad json'), { status: 400 });
    }
  }

  function auth(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    return m ? tokens.verify(m[1]) : null;
  }

  const routes = {
    async 'POST /v1/session'(body) {
      if (body.channel === 'tg') {
        const user = verifyInitData(body.initData, botToken);
        if (!user) return [401, { error: 'bad_init_data' }];
        // тот же ключ, что у бота в чате: согласие, данное в боте, действует и в Mini App
        const key = hashId('tg', user.id, idSalt);
        return [200, { token: tokens.issue(key), consented: store.consented(key), ...store.plan(key) }];
      }
      if (body.channel === 'web') {
        const old = tokens.verify(body.token);
        const key = old && old.startsWith('web-') ? old : tokens.newWebKey();
        return [200, { token: tokens.issue(key), consented: store.consented(key), ...store.plan(key) }];
      }
      return [400, { error: 'bad_request' }];
    },
    async 'POST /v1/consent'(body, key) {
      if (body.adult !== true || body.health !== true) return [400, { error: 'consent_required' }];
      return [200, { text: mira.consent(key).text }];
    },
    async 'POST /v1/chat'(body, key) {
      if (typeof body.text !== 'string' || !body.text.trim()) return [400, { error: 'bad_request' }];
      const voice = ['f', 'm', 'off'].includes(body.voice) ? body.voice : 'off';
      const r = await mira.handle(key, body.text, { voice });
      return [200, {
        text: r.text,
        risk: r.risk,
        crisis: Boolean(r.crisis),
        needConsent: Boolean(r.needConsent),
        error: Boolean(r.error),
        voice: r.voice || null,
        limit: r.limit || null,
      }];
    },
    async 'POST /v1/reset'(_body, key) {
      return [200, { text: mira.reset(key).text }];
    },
    async 'POST /v1/forget'(body, key) {
      if (body.confirm !== true) return [400, { error: 'confirm_required' }];
      return [200, { text: mira.forget(key).text, consented: false }];
    },
    async 'POST /v1/redeem'(body, key) {
      const t = Date.now();
      const list = (redeemHits.get(key) || []).filter((h) => t - h < 60 * 60 * 1000);
      list.push(t);
      redeemHits.set(key, list);
      if (redeemHits.size > 10_000) redeemHits.clear();
      if (list.length > REDEEM_LIMIT) return [429, { error: 'rate_limited' }];
      const r = store.redeem(key, normalizeCode(body.code));
      if (!r.ok) return [400, { error: r.error }];
      return [200, store.plan(key)];
    },
    async 'GET /v1/history'(_body, key) {
      if (!store.isPremium(store.peek(key))) return [403, { error: 'premium_required' }];
      const messages = store.history(key, 200).map((m) => ({ role: m.role, text: m.content, ts: new Date(m.ts).toISOString() }));
      return [200, { messages }];
    },
    async 'POST /v1/rating'(body) {
      const score = body.score;
      if (!Number.isInteger(score) || score < 1 || score > 5) return [400, { error: 'bad_request' }];
      ratings[score - 1] += 1; // только счётчики, без привязки к человеку
      log.info?.(`rating ${score}; all: ${ratings.join('/')}`);
      return [200, { ok: true }];
    },
  };
  const PUBLIC = new Set(['POST /v1/session']);

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const path = (req.url || '/').split('?')[0];

    if (req.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.includes(origin)) return send(res, 403, null);
      res.writeHead(204, {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '86400',
        vary: 'Origin',
      });
      return res.end();
    }
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
    const vm = req.method === 'GET' && VOICE_RE.exec(path);
    if (vm) {
      // ссылка случайная и живёт час; <audio> в браузере не умеет слать заголовок с токеном
      const v = voices.get(vm[1]);
      if (!v) return send(res, 404, { error: 'not_found' }, origin);
      const headers = { 'content-type': v.mime, 'cache-control': 'private, max-age=3600' };
      if (origin && allowedOrigins.includes(origin)) Object.assign(headers, { 'access-control-allow-origin': origin, vary: 'Origin' });
      res.writeHead(200, headers);
      return res.end(v.data);
    }
    if (telegram && req.method === 'POST' && path === WEBHOOK_PATH) {
      // Telegram доказывает, что это он, секретом в заголовке (его задаём сами в setWebhook)
      try {
        const update = await readJson(req);
        const ok = telegram.handleWebhook(req.headers['x-telegram-bot-api-secret-token'], update);
        return send(res, ok ? 200 : 403, ok ? { ok: true } : { error: 'forbidden' });
      } catch (err) {
        return send(res, err.status || 400, { error: 'bad_request' });
      }
    }
    if (origin && !allowedOrigins.includes(origin)) return send(res, 403, { error: 'forbidden' });

    const route = routes[`${req.method} ${path}`];
    if (!route) return send(res, 404, { error: 'not_found' }, origin);

    if (path === '/v1/session' && ipLimited(req)) return send(res, 429, { error: 'rate_limited' }, origin);

    let key = null;
    if (!PUBLIC.has(`${req.method} ${path}`)) {
      key = auth(req);
      if (!key) return send(res, 401, { error: 'unauthorized' }, origin);
    }
    try {
      const body = req.method === 'GET' ? {} : await readJson(req);
      const [status, out] = await route(body, key);
      send(res, status, out, origin);
    } catch (err) {
      if (!err.status) log.error?.('http error:', err.message);
      send(res, err.status || 500, { error: err.status ? 'bad_request' : 'internal' }, origin);
    }
  });

  return { server, ratings };
}
