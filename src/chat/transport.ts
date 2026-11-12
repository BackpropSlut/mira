// Транспорт: API бота (контракт в bot/API.md) или демо /api/chat (DeepSeek на Vercel), пока API нет.
import { authHeader, sessionBody, setToken } from '../lib/session';
import { CRISIS_RE } from '../lib/crisis';
import type { Msg, Voice } from './types';

export const API = (import.meta.env.PUBLIC_MIRA_API || '').replace(/\/$/, '');
export const DEMO = !API;

export const SLOW = 'Давай чуть притормозим, я не успеваю. Напиши мне через пару минут.';
export const FAIL = 'Извини, я сейчас не могу ответить: что-то сломалось у меня внутри. Попробуй через минуту.';
const CRISIS_TEXT = 'Мне очень жаль, что тебе так тяжело. Сейчас важно поговорить с живым человеком: позвони 112 или на линию психологической помощи МЧС +7 495 989-50-50, это бесплатно и круглосуточно. Номера закреплены внизу.';

export async function call(path: string, body?: object) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let data: any = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

/** Открывает сессию по анонимному токену устройства. */
export async function openSession() {
  const { status, data } = await call('/v1/session', sessionBody());
  if (status !== 200 || !data.token) throw new Error(`session ${status}`);
  setToken(data.token);
  return { consented: !!data.consented, plan: data.plan as string | undefined, until: data.premiumUntil as string | undefined };
}

/** Запрос к API с одним повтором после 401: токен протух, открываем сессию заново. */
export async function callAuthed(path: string, body?: object, onSession?: (s: Awaited<ReturnType<typeof openSession>>) => void) {
  let r = await call(path, body);
  if (r.status === 401) { onSession?.(await openSession()); r = await call(path, body); }
  return r;
}

// Модель любит markdown, а пузырь показывает текст как есть
const plain = (t: string) => t.replace(/\*\*?|__|^#+\s*/gm, '');

/** Демо: история целиком из этой вкладки, кризисные слова ловим до модели. */
export async function askDemo(text: string, history: Msg[]): Promise<Msg> {
  if (CRISIS_RE.test(text)) return { who: 'mira', text: CRISIS_TEXT, crisis: true };
  // Модель ждёт чередование ролей: подряд идущие реплики одной стороны склеиваем
  const turns: { role: 'user' | 'model'; text: string }[] = [];
  for (const m of history) {
    if (m.note || !m.text) continue;
    const role = m.who === 'me' ? 'user' : 'model';
    const last = turns.at(-1);
    if (last?.role === role) last.text += `\n${m.text}`; else turns.push({ role, text: m.text });
  }
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: turns.slice(-20) }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.text) return { who: 'mira', text: plain(data.text) };
  if (res.status === 429) return { who: 'mira', text: SLOW };
  // 503 not_configured: нет ключа DeepSeek. 404: функции нет (astro preview)
  if (res.status === 503 || res.status === 404) return { who: 'mira', text: '', note: 'demo-off' };
  return { who: 'mira', text: FAIL };
}

export type ApiReply = { needConsent: true } | { needConsent?: false; msg: Msg; limit?: 'voice' | 'text' };

/** Настоящий ответ через API бота. */
export async function askApi(text: string, voice: Voice, onSession: Parameters<typeof callAuthed>[2]): Promise<ApiReply> {
  const r = await callAuthed('/v1/chat', { text, voice }, onSession);
  if (r.status === 429) return { msg: { who: 'mira', text: SLOW } };
  if (r.status !== 200) return { msg: { who: 'mira', text: FAIL } };
  // Сервер перезапускался и забыл согласие: снова ворота
  if (r.data.needConsent) return { needConsent: true };
  // Номера закрепляем только при настоящей опасности: острый кризис или модель сама поняла, что есть риск.
  // На «мне плохо» (distress) Inlo просто отвечает, контакты остаются строкой в тексте
  const risk = r.data.risk as string | undefined;
  const serious = risk ? risk === 'acute' || risk === 'flagged' : !!r.data.crisis;
  const limit = r.data.limit === 'voice' || r.data.limit === 'text' ? r.data.limit : undefined;
  return { msg: { who: 'mira', text: r.data.text || FAIL, crisis: serious, voice: r.data.voice?.url }, limit };
}
