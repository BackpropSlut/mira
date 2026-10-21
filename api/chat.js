// Демо-чат на главной: браузер шлёт историю сюда, функция Vercel добавляет ключ и спрашивает Gemini.
// Ключ живёт только в переменной окружения GEMINI_API_KEY и в браузер не попадает.
// Переписку не сохраняем и не логируем.

// Модели по очереди. У каждой модели Gemini свой бесплатный лимит: кончился у первой (429), модель сняли (404)
// или она не ответила вовремя, спрашиваем следующую. Порядок: основная, потом запасные из GEMINI_FALLBACK_MODELS.
// Названия *-latest это псевдонимы Google на актуальную версию, они не пропадают при выходе новой модели.
// Gemma не принимает system_instruction, для неё инструкция уходит первой репликой (см. ask).
const MODELS = [...new Set([
  process.env.GEMINI_MODEL || 'gemini-flash-latest',
  ...(process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-flash-lite-latest,gemma-3-27b-it').split(','),
].map((m) => m.trim()).filter(Boolean))];
const NEXT_ON = new Set([404, 429, 500, 502, 503, 504]); // при остальных (400, 401, 403) дело не в модели
const ATTEMPT_MS = 12000;
const BUDGET_MS = 26000; // на все попытки вместе
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

function clean(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const turns = messages.slice(-MAX_TURNS).map((m) => ({
    role: m?.role === 'model' ? 'model' : 'user',
    text: typeof m?.text === 'string' ? m.text.trim().slice(0, MAX_CHARS) : '',
  }));
  if (turns.some((t) => !t.text) || turns.at(-1).role !== 'user') return null;
  while (turns[0]?.role === 'model') turns.shift();
  return turns;
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return json(403, { error: 'forbidden' });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json(429, { error: 'rate_limited' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: 'not_configured' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'bad_request' }); }
  const turns = clean(body?.messages);
  if (!turns) return json(400, { error: 'bad_request' });

  const deadline = Date.now() + BUDGET_MS;
  let busy = false; // хотя бы одна модель ответила «лимит»: значит, просим подождать, а не «сломалось»
  for (const model of MODELS) {
    const left = deadline - Date.now();
    if (left < 2000) break;
    const r = await ask(key, model, turns, Math.min(ATTEMPT_MS, left));
    if (r.text !== undefined) return json(200, { text: r.text });
    console.error('gemini', model, r.status); // только модель и код, без текста переписки
    if (r.status === 429) busy = true;
    if (r.status && !NEXT_ON.has(r.status)) break;
  }
  return busy ? json(429, { error: 'quota' }) : json(502, { error: 'upstream' });
}

/** Один запрос к одной модели. Возвращает { text } при успехе или { status } (0, если не ответила вовремя). */
async function ask(key, model, turns, ms) {
  const gemma = model.startsWith('gemma');
  const contents = turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] }));
  if (gemma) contents[0].parts[0].text = `${SYSTEM}\n\n${contents[0].parts[0].text}`;
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        ...(gemma ? {} : { system_instruction: { parts: [{ text: SYSTEM }] } }),
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    return { status: 0 };
  }
  if (!res.ok) return { status: res.status };
  const data = await res.json().catch(() => null);
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought)
    .map((p) => p.text || '')
    .join('')
    .trim();
  return { text: text || null };
}
