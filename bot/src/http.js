// HTTP API для веб-чата /chat (на сайте и внутри Telegram как Mini App). Контракт: bot/API.md

import { createServer } from 'node:http';
import { verifyInitData, createTokens } from './auth.js';
import { hashId } from './sessions.js';

const MAX_BODY = 16 * 1024;
const SESSION_LIMIT = 30; // новых сессий с одного IP
const SESSION_WINDOW_MS = 10 * 60 * 1000;

export function createHttp({ mira, sessions, botToken, idSalt, sessionSecret, allowedOrigins, log = console }) {
  const tokens = createTokens(sessionSecret);
  const ratings = [0, 0, 0, 0, 0];
  const ipHits = new Map();

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
        return [200, { token: tokens.issue(key), consented: sessions.consented(key) }];
      }
      if (body.channel === 'web') {
        const old = tokens.verify(body.token);
        const key = old && old.startsWith('web-') ? old : tokens.newWebKey();
        return [200, { token: tokens.issue(key), consented: sessions.consented(key) }];
      }
      return [400, { error: 'bad_request' }];
    },
    async 'POST /v1/consent'(body, key) {
      if (body.adult !== true || body.health !== true) return [400, { error: 'consent_required' }];
      return [200, { text: mira.consent(key).text }];
    },
    async 'POST /v1/chat'(body, key) {
      if (typeof body.text !== 'string' || !body.text.trim()) return [400, { error: 'bad_request' }];
      const r = await mira.handle(key, body.text);
      return [200, { text: r.text, crisis: Boolean(r.crisis), needConsent: Boolean(r.needConsent), error: Boolean(r.error) }];
    },
    async 'POST /v1/reset'(_body, key) {
      return [200, { text: mira.reset(key).text }];
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
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '86400',
        vary: 'Origin',
      });
      return res.end();
    }
    if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });
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
      const body = await readJson(req);
      const [status, out] = await route(body, key);
      send(res, status, out, origin);
    } catch (err) {
      if (!err.status) log.error?.('http error:', err.message);
      send(res, err.status || 500, { error: err.status ? 'bad_request' : 'internal' }, origin);
    }
  });

  return { server, ratings };
}
