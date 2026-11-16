// Чат Inlo: SPA на Preact. Один экран, два входа: сайт (/chat) и приложение с домашнего экрана (PWA).
// В Astro подключён островом client:only (src/pages/chat.astro): страница остаётся статичной, весь чат живёт в браузере.
// Разговор идёт через API бота (PUBLIC_MIRA_API), пока его нет, через демо /api/chat (DeepSeek), см. transport.ts.
import { useEffect, useRef, useState } from 'preact/hooks';
import { snooze, snoozed } from '../lib/install';
import { hasToken } from '../lib/session';
import { Calls } from './components/Calls';
import { Chips, Composer } from './components/Composer';
import { Gate } from './components/Gate';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { TabBar } from './components/TabBar';
import { isNight, reduce, sleep } from './env';
import { useInstall } from './hooks/useInstall';
import { useShell } from './hooks/useShell';
import { BreatheSheet } from './sheets/BreatheSheet';
import { ForgetSheet } from './sheets/ForgetSheet';
import { HelpSheet } from './sheets/HelpSheet';
import { InstallSheet } from './sheets/InstallSheet';
import { PlusSheet, type RedeemResult } from './sheets/PlusSheet';
import { KEYS, ls, ss } from './storage';
import { askApi, askDemo, call, callAuthed, DEMO, FAIL, openSession, SLOW } from './transport';
import { VOICE_LABEL, VOICES, type Msg, type Plan, type SheetName, type Voice } from './types';

function loadMsgs(): Msg[] {
  try { return JSON.parse(ss.get(KEYS.chat) || '[]'); } catch { return []; }
}
function loadVoice(): Voice {
  const v = ls.get(KEYS.voice);
  return (VOICES as readonly string[]).includes(v || '') ? (v as Voice) : 'f';
}

export default function ChatApp() {
  useShell();
  const install = useInstall();

  // Состояние для отрисовки и его зеркала в ref: асинхронный код (ответ модели, таймеры) читает свежие значения из ref
  const [msgs, setMsgsState] = useState<Msg[]>(loadMsgs);
  const msgsRef = useRef(msgs);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [crisis, setCrisis] = useState(() => !!ss.get(KEYS.crisis));
  const crisisRef = useRef(crisis);
  const [plan, setPlanState] = useState<Plan>({ premium: false });
  const premiumRef = useRef(false);
  const [voice, setVoice] = useState<Voice>(loadVoice);
  const voiceRef = useRef(voice);
  const [sheet, setSheet] = useState<SheetName>(null);
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const kindRef = useRef(install.kind);
  kindRef.current = install.kind;

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [typing, setTyping] = useState(false);
  const [talking, setTalking] = useState(false);
  const [animateFrom, setAnimateFrom] = useState(0);
  const [gateKey, setGateKey] = useState(0);
  const [gateDone, setGateDone] = useState('');
  const [focusKey, setFocusKey] = useState(0);

  const pending = useRef(''); // сообщение, отправленное до согласия: уйдёт после ворот
  const offered = useRef(false); // установку предлагаем один раз за визит
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLElement>(null);

  // ── Сообщения ──
  function setMsgs(next: Msg[]) {
    msgsRef.current = next;
    setMsgsState(next);
    ss.set(KEYS.chat, JSON.stringify(next.slice(-60)));
  }
  function push(m: Msg) {
    setMsgs([...msgsRef.current, m]);
    if (m.crisis) pinHelp(true);
  }
  // Кризисный режим: номера закреплены до конца сессии, облачко замирает
  function pinHelp(fresh = false) {
    if (fresh) ss.set(KEYS.crisis, '1');
    crisisRef.current = true;
    setCrisis(true);
  }
  function scrollDown() {
    requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: reduce() ? 'auto' : 'smooth' }));
  }
  useEffect(scrollDown, [msgs.length, typing, ready]);

  function setPlan(p?: string, until?: string) {
    premiumRef.current = p === 'premium';
    setPlanState({ premium: p === 'premium', until });
  }
  const applySession = (s: { plan?: string; until?: string }) => setPlan(s.plan, s.until);

  // ── Приветствие, ворота, открытие чата ──
  function greet(text?: string) {
    push({ who: 'mira', text: text || (isNight()
      ? 'Не спится? Я рядом. Расскажи, что крутится в голове, или давай просто подышим.'
      : 'Я рядом. Расскажи, что у тебя сейчас происходит. Можно с любого места, даже одним словом.') });
  }

  async function openChat(first?: string) {
    setGateDone('');
    // Ворота уходят, лента проявляется: один плавный переход вместо щелчка.
    // Класс ставим и руками: View Transition снимает кадр сразу после колбэка, раньше рендера Preact
    if (!readyRef.current) {
      const show = () => { rootRef.current?.classList.add('ready'); readyRef.current = true; setReady(true); };
      if (!reduce() && document.startViewTransition) document.startViewTransition(show); else show();
    }
    // В Plus переписка хранится на сервере: подтягиваем её, если в этой вкладке пусто
    if (!msgsRef.current.length && premiumRef.current) {
      try {
        const r = await call('/v1/history');
        if (r.status === 200 && Array.isArray(r.data.messages)) {
          setMsgs(r.data.messages.map((m: any) => ({ who: m.role === 'user' ? 'me' : 'mira', text: String(m.text || '') })).filter((m: Msg) => m.text));
        }
      } catch {}
    }
    setAnimateFrom(msgsRef.current.length); // восстановленные реплики без анимации
    if (!msgsRef.current.length) setTimeout(() => greet(first), reduce() ? 0 : 420);
    setFocusKey((k) => k + 1);
    if (pending.current) { const t = pending.current; pending.current = ''; setTimeout(() => say(t, false), 600); }
  }

  function showGate() {
    readyRef.current = false;
    setReady(false);
    setGateKey((k) => k + 1); // ворота заново, галочки сброшены
  }

  async function consent(): Promise<boolean> {
    // Демо: согласие помним только в этом браузере, сервера нет
    if (DEMO) { ls.set(KEYS.demoOk, '1'); openChat(); return true; }
    try {
      if (!hasToken()) applySession(await openSession());
      const r = await callAuthed('/v1/consent', { adult: true, health: true }, applySession);
      if (r.status !== 200) return false;
      openChat(r.data.text);
      return true;
    } catch {
      return false;
    }
  }

  // ── Разговор ──
  async function say(raw: string, echo = true) {
    const text = raw.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    setTalking(true);
    if (echo) push({ who: 'me', text });
    setTyping(true);
    const t0 = performance.now();
    let reply: Msg | null = null;
    let limit: 'voice' | 'text' | undefined;
    try {
      if (DEMO) reply = await askDemo(text, msgsRef.current);
      else {
        const r = await askApi(text, voiceRef.current, applySession);
        if (r.needConsent) { pending.current = text; showGate(); } else { reply = r.msg; limit = r.limit; }
      }
    } catch {
      reply = { who: 'mira', text: FAIL };
    }
    // Мгновенный ответ выглядит как робот: даём «подумать» хотя бы полсекунды
    const wait = 650 - (performance.now() - t0);
    if (wait > 0 && !reduce()) await sleep(wait);
    setTyping(false);
    if (reply) push(reply);
    // Установку предлагаем после первого настоящего ответа: не в кризисе и не на ошибке
    if (reply && !reply.note && !reply.crisis && reply.text !== FAIL && reply.text !== SLOW) offerInstall();
    if (limit && !ss.get(KEYS.limit(limit))) {
      const kind = limit;
      ss.set(KEYS.limit(kind), '1');
      setTimeout(() => push({ who: 'mira', text: '', note: `${kind}-limit` }), reduce() ? 0 : 500);
    }
    busyRef.current = false; setBusy(false);
  }

  // ── Меню ──
  async function reset() {
    if (!readyRef.current) return;
    let text: string | undefined;
    if (!DEMO) try { text = (await call('/v1/reset', {})).data.text; } catch {}
    setMsgs([]);
    setAnimateFrom(0);
    setTalking(false);
    greet(text);
  }
  function nextVoice() {
    const v = VOICES[(VOICES.indexOf(voiceRef.current) + 1) % VOICES.length];
    voiceRef.current = v;
    setVoice(v);
    ls.set(KEYS.voice, v);
  }

  // ── Листы ──
  function finishBreathe(done: boolean) {
    setSheet(null);
    if (done && readyRef.current) push({ who: 'mira', text: 'Ты молодец. Как ты сейчас, хоть немного спокойнее? Можем поговорить о том, что беспокоит.' });
  }
  // Один раз за визит, после первого ответа и не поверх другого листа
  function offerInstall() {
    if (offered.current || snoozed() || !kindRef.current || crisisRef.current) return;
    offered.current = true;
    setTimeout(() => {
      if (kindRef.current && !crisisRef.current && !sheetRef.current) setSheet('install');
    }, reduce() ? 300 : 1400);
  }
  // Установили через меню браузера, пока лист открыт: закрываем его
  useEffect(() => { if (!install.kind && sheet === 'install') setSheet(null); }, [install.kind]);

  async function redeem(code: string): Promise<RedeemResult> {
    try {
      if (!hasToken()) applySession(await openSession());
      const r = await call('/v1/redeem', { code });
      if (r.status === 200 && r.data.plan === 'premium') {
        setPlan(r.data.plan, r.data.premiumUntil);
        return { ok: true, text: 'Готово, Inlo Plus включён.' };
      }
      return { ok: false, text: r.data.error === 'used_code' ? 'Этот код уже использован.' : r.status === 404 ? 'Коды пока не принимаются, попробуй позже.' : 'Такого кода нет. Проверь, нет ли опечатки.' };
    } catch {
      return { ok: false, text: 'Не получилось связаться с Inlo. Попробуй ещё раз.' };
    }
  }

  // Удалить мои данные: переписка, история и согласие стираются на сервере, дальше снова ворота
  async function forget(): Promise<boolean> {
    const r = await callAuthed('/v1/forget', { confirm: true }, applySession);
    if (r.status !== 200) return false;
    setMsgs([]);
    pending.current = '';
    setTalking(false);
    setSheet(null);
    setGateDone(r.data.text || 'Готово, твои данные удалены.');
    showGate();
    return true;
  }

  // ── Старт ──
  useEffect(() => {
    // Кто уже согласился (в боте или раньше на сайте), ворота второй раз не видит
    if (!DEMO) openSession().then((s) => { applySession(s); if (s.consented) openChat(); }).catch(() => {});
    else if (ls.get(KEYS.demoOk)) openChat();
    // Ссылка «У меня есть код» с главной ведёт на /chat#plus: сразу показываем лист с кодом
    if (!DEMO && location.hash === '#plus') {
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => setSheet('plus'), reduce() ? 0 : 700);
    }
  }, []);

  const cls = ['chat', DEMO && 'demo', ready && 'ready', talking && 'talking', crisis && 'crisis', typing && 'thinking', plan.premium && 'premium']
    .filter(Boolean).join(' ');

  return (
    <div class={cls} ref={rootRef}>
      <Header demo={DEMO} premium={plan.premium} typing={typing} canInstall={!!install.kind} voiceLabel={VOICE_LABEL[voice]}
        onBreathe={() => setSheet('breathe')} onInstall={() => install.kind && setSheet('install')} onVoice={nextVoice}
        onPlus={() => setSheet('plus')} onReset={reset} onForget={() => setSheet('forget')} onHelp={() => setSheet('help')} />

      <Gate key={gateKey} demo={DEMO} done={gateDone} onStart={consent} />

      <MessageList msgs={msgs} animateFrom={animateFrom} typing={typing} logRef={logRef}
        onPlus={() => setSheet('plus')} onBreathe={() => setSheet('breathe')} />

      <div class="pin" role="region" aria-label="Живые люди рядом" hidden={!crisis}><Calls /></div>

      <Chips onSay={(t) => say(t)} onBreathe={() => setSheet('breathe')} />
      <Composer busy={busy} onSend={(t) => say(t)} focusKey={focusKey} />

      <TabBar onChat={() => readyRef.current && scrollDown()} onBreathe={() => setSheet('breathe')} onHelp={() => setSheet('help')} />

      <HelpSheet open={sheet === 'help'} onClose={() => setSheet(null)} />
      <InstallSheet open={sheet === 'install'} kind={install.kind} onClose={() => setSheet(null)}
        onClosed={() => { if (!install.installed.current) snooze(); }}
        onPrompt={async () => { await install.prompt(); setSheet(null); }} />
      <BreatheSheet open={sheet === 'breathe'} onFinish={finishBreathe} />
      <PlusSheet open={sheet === 'plus'} plan={plan} onClose={() => setSheet(null)} onRedeem={redeem} />
      <ForgetSheet open={sheet === 'forget'} onClose={() => setSheet(null)} onConfirm={forget} />
    </div>
  );
}
