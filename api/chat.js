// Демо-чат на сайте: браузер шлёт историю сюда, функция Vercel добавляет ключ и спрашивает DeepSeek.
// Ключ живёт только в переменной окружения DEEPSEEK_API_KEY и в браузер не попадает.
// Локально (npm run dev) эту же функцию вызывает плагин из astro.config.mjs, ключ берётся из .env.
// Переписку не сохраняем и не логируем.
// Как модель должна отвечать (ТЗ ответов), лежит отдельно в api/_prompt.js.
import { SYSTEM } from './_prompt.js';

// API DeepSeek совместим с OpenAI: POST /chat/completions, роли system / user / assistant.
const URL_API = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT_MS = 25000; // функция живёт до 30 с (vercel.json)
const MAX_TURNS = 20;
const MAX_CHARS = 1000;
// Запросов с одного IP за 10 минут. У мобильных операторов один IP на многих абонентов, поэтому с запасом
const LIMIT = Number(process.env.CHAT_IP_LIMIT) || 60;
const WINDOW_MS = 10 * 60 * 1000;


const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Браузер шлёт роли user / model (так их называет чат), здесь они становятся user / assistant
function clean(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const turns = messages.slice(-MAX_TURNS).map((m) => ({
    role: m?.role === 'model' ? 'assistant' : 'user',
    content: typeof m?.text === 'string' ? m.text.trim().slice(0, MAX_CHARS) : '',
  }));
  if (turns.some((t) => !t.content) || turns.at(-1).role !== 'user') return null;
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return json(403, { error: 'forbidden' });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json(429, { error: 'rate_limited' });

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return json(503, { error: 'not_configured' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_request' }); }
  const turns = clean(body?.messages);
  if (!turns) return json(400, { error: 'bad_request' });

  let res;
  try {
    res = await fetch(URL_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM }, ...turns],
        temperature: 0.7,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error('deepseek timeout'); // без текста переписки
    return json(502, { error: 'upstream' });
  }
  if (!res.ok) {
    console.error('deepseek', MODEL, res.status); // только модель и код
    // 429 лимит запросов: чат попросит подождать. 401 неверный ключ, 402 закончился баланс: для человека это «не работает»
    return res.status === 429 ? json(429, { error: 'quota' }) : json(502, { error: 'upstream' });
  }
  const data = await res.json().catch(() => null);
  const text = (data?.choices?.[0]?.message?.content || '').trim();
  return text ? json(200, { text }) : json(502, { error: 'upstream' });
}
