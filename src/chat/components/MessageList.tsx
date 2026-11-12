// Лента: пузыри, голосовые ответы, карточки лимитов и «печатает…».
import type { Ref } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { API } from '../transport';
import type { Msg, Note } from '../types';

type Props = {
  msgs: Msg[];
  /** С этого индекса реплики новые и появляются анимацией; старые (восстановленные) без неё. */
  animateFrom: number;
  typing: boolean;
  logRef: Ref<HTMLElement>;
  onPlus: () => void;
  onBreathe: () => void;
};

// Номера и ссылки в ответах делаем нажимаемыми. HTML из ответа модели не вставляем никогда: только текст и <a>
const LINK = /(https?:\/\/[^\s)]+|\+7\s?495\s?989[-‑\s]?50[-‑\s]?50|\b112\b)/g;
function rich(text: string) {
  const out: (string | preact.JSX.Element)[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const v = m[0];
    out.push(text.slice(last, m.index));
    const href = v.startsWith('http') ? v : v === '112' ? 'tel:112' : 'tel:+74959895050';
    out.push(<a href={href} key={m.index}>{v.replace(/^https?:\/\/(www\.heyinlo\.com|heyinlo\.com|mira-plum-mu\.vercel\.app)/, '') || v}</a>);
    last = (m.index || 0) + v.length;
  }
  out.push(text.slice(last));
  return out;
}

// В кризисном ответе номера уже закреплены кнопками над полем ввода, строки с ними из текста убираем
const HELP_LINE = /^(112 —|\+7 495 989-50-50 —|Все проверенные номера:).*$/gm;
const crisisText = (t: string) => t.replace(HELP_LINE, '').replace(/:\s*\n\s*\n/g, ', номера внизу.\n\n').replace(/\n{3,}/g, '\n\n').trim();

// Играет один голосовой ответ за раз
let playing: HTMLAudioElement | null = null;

function VoiceButton({ src }: { src: string }) {
  const [on, setOn] = useState(false);
  const audio = useMemo(() => {
    const a = new Audio(src.startsWith('/') ? `${API}${src}` : src);
    a.preload = 'none';
    a.addEventListener('ended', () => setOn(false));
    a.addEventListener('pause', () => setOn(false));
    return a;
  }, [src]);
  const toggle = () => {
    if (!audio.paused) { audio.pause(); return; }
    playing?.pause();
    playing = audio;
    audio.play().then(() => setOn(true)).catch(() => {});
  };
  return <button type="button" class={on ? 'vbtn on' : 'vbtn'} aria-label="Послушать ответ" onClick={toggle}><i aria-hidden="true" /><span>Голос</span></button>;
}

// Лимит или «демо недоступно»: мягко, один раз, без счётчиков
function LimitCard({ kind, onPlus, onBreathe }: { kind: Note; onPlus: () => void; onBreathe: () => void }) {
  if (kind === 'voice-limit') return (
    <div class="limit"><b>Дальше я отвечаю текстом</b><span>Голосовые ответы на пробу закончились. В Inlo Plus я говорю голосом без ограничений, и история сохраняется.</span><button type="button" onClick={onPlus}>Подробнее</button></div>
  );
  if (kind === 'text-limit') return (
    <div class="limit"><b>Продолжим завтра?</b><span>Бесплатные сообщения на сегодня закончились. В Inlo Plus можно говорить без ограничений. Если тяжело прямо сейчас, кнопка «Помощь» сверху работает всегда.</span><button type="button" onClick={onPlus}>Подробнее</button></div>
  );
  return (
    <div class="limit"><b>Демо временно недоступно</b><span>Сейчас я не могу ответить, попробуй позже. Подышать вместе можно и без меня. Если тяжело прямо сейчас, кнопка «Помощь» работает всегда.</span><button type="button" onClick={onBreathe}>Подышать минуту</button></div>
  );
}

export function MessageList({ msgs, animateFrom, typing, logRef, onPlus, onBreathe }: Props) {
  return (
    <section class="log" ref={logRef} aria-live="polite" aria-label="Переписка с Inlo">
      {msgs.map((m, i) => {
        const pop = i >= animateFrom ? ' pop' : '';
        if (m.note) return <div class={`row note${pop}`} key={i}><LimitCard kind={m.note} onPlus={onPlus} onBreathe={onBreathe} /></div>;
        // cont: следующая реплика от того же, у пузыря скругляется хвостик
        const next = msgs[i + 1];
        const cont = next && !next.note && next.who === m.who ? ' cont' : '';
        return (
          <div class={`row ${m.who}${cont}${pop}`} key={i}>
            <div class="b">
              {m.voice && <VoiceButton src={m.voice} />}
              {rich(m.crisis ? crisisText(m.text) : m.text)}
            </div>
          </div>
        );
      })}
      {typing && <div class="row mira typing pop"><div class="b" aria-label="Inlo печатает"><i /><i /><i /></div></div>}
    </section>
  );
}
