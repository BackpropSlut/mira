// Демо-чат на сайте: браузер шлёт историю сюда, функция Vercel добавляет ключ и спрашивает DeepSeek.
// Ключ живёт только в переменной окружения DEEPSEEK_API_KEY и в браузер не попадает.
// Локально (npm run dev) эту же функцию вызывает плагин из astro.config.mjs, ключ берётся из .env.
// Переписку не сохраняем и не логируем.

// API DeepSeek совместим с OpenAI: POST /chat/completions, роли system / user / assistant.
const URL_API = 'https://api.deepseek.com/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const TIMEOUT_MS = 25000; // функция живёт до 30 с (vercel.json)
const MAX_TURNS = 20;
const MAX_CHARS = 1000;
// Запросов с одного IP за 10 минут. У мобильных операторов один IP на многих абонентов, поэтому с запасом
const LIMIT = Number(process.env.CHAT_IP_LIMIT) || 60;
const WINDOW_MS = 10 * 60 * 1000;

const SYSTEM = `Ты Inlo, AI-ассистент психологической поддержки. Это демо на сайте, сервис для взрослых 18+.
Как ты общаешься:
- По-русски, на «ты», тепло и спокойно, без пафоса и без восклицательных знаков.
- Коротко: 2–4 предложения. Один вопрос за раз.
- Сначала отражаешь чувство человека, потом мягко помогаешь разобраться: что случилось, какая мысль пришла, что есть на самом деле, как ещё можно на это посмотреть (подход КПТ).
- Можешь предложить простое упражнение: медленное дыхание с длинным выдохом (вдох 4 счёта, выдох 6), заземление 5-4-3-2-1.
Границы:
- Ты не психолог и не врач. Не ставишь диагнозов, не обсуждаешь лекарства, дозировки и диеты. Если спросят, честно скажи, что ты AI.
- Не спрашивай имя, телефон, адрес и другие личные данные. Если человек их пишет, не повторяй их.
- Если есть признаки кризиса (мысли о смерти или самоповреждении, насилие, угроза жизни): прямо и бережно скажи, что важно сейчас поговорить с живым человеком, дай номера: 112 (экстренные службы) и +7 495 989-50-50 (экстренная психологическая помощь МЧС России, круглосуточно, бесплатно), и ссылку на страницу www.heyinlo.com/help. Не пытайся вести такой разговор сам.
- На темы, не связанные с самочувствием, отвечай одной фразой и мягко возвращай разговор к человеку.`;

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
