// Шапка чата: назад, облачко с именем и статусом, «Помощь» и меню «Ещё».
import { useEffect, useRef, useState } from 'preact/hooks';
import { isStandaloneMode, reduce } from '../env';
import { MiniCloud } from './MiniCloud';

type Props = {
  demo: boolean;
  premium: boolean;
  typing: boolean;
  canInstall: boolean;
  voiceLabel: string;
  onBreathe: () => void;
  onInstall: () => void;
  onVoice: () => void;
  onPlus: () => void;
  onReset: () => void;
  onForget: () => void;
  onHelp: () => void;
};

export function Header(p: Props) {
  // closed → open → closing → closed: меню сворачивается к кнопке, а не исчезает щелчком
  const [menu, setMenu] = useState<'closed' | 'open' | 'closing'>('closed');
  const more = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const close = () => {
    if (reduce()) { setMenu('closed'); return; }
    setMenu((m) => (m === 'open' ? 'closing' : m));
  };
  useEffect(() => {
    if (menu !== 'closing') return;
    const t = setTimeout(() => setMenu((m) => (m === 'closing' ? 'closed' : m)), 170);
    return () => clearTimeout(t);
  }, [menu]);

  // Клик мимо меню и Escape закрывают его
  useEffect(() => {
    if (menu !== 'open') return;
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); more.current?.focus(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  /** Пункт меню: закрывает меню и выполняет действие. Голос переключается без закрытия. */
  const act = (fn: () => void, keep = false) => () => { if (!keep) close(); fn(); };

  return (
    <header class="bar">
      <a class="back" href="/" aria-label="На главную">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </a>
      <div class="who">
        <span class="ava"><MiniCloud size={30} /></span>
        <span class="name">
          <b>Inlo {p.premium && <i class="plus-badge">Plus</i>}</b>
          <small class="status">{p.typing ? 'печатает…' : 'AI, не психолог'}</small>
        </span>
      </div>
      {/* В приложении «Помощь» открывает номера поверх чата: уйти со страницы значит потерять разговор */}
      <a class="sos" href="/help" onClick={(e) => { if (isStandaloneMode()) { e.preventDefault(); p.onHelp(); } }}>Помощь</a>
      <button ref={more} class="more" type="button" aria-label="Ещё" aria-expanded={menu === 'open'} aria-controls="menu"
        onClick={(e) => { e.stopPropagation(); menu === 'open' ? close() : setMenu('open'); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      <div ref={box} class={menu === 'closing' ? 'menu closing' : 'menu'} id="menu" role="menu" hidden={menu === 'closed'}>
        <button type="button" role="menuitem" onClick={act(p.onBreathe)}>Подышать минуту</button>
        {p.canInstall && <button type="button" role="menuitem" onClick={act(p.onInstall)}>Установить Inlo</button>}
        {!p.demo && <button type="button" role="menuitem" onClick={act(p.onVoice, true)}>Голос Inlo: <span class="v-label">{p.voiceLabel}</span></button>}
        {!p.demo && <button type="button" role="menuitem" onClick={act(p.onPlus)}>Inlo Plus</button>}
        <button type="button" role="menuitem" onClick={act(p.onReset)}>Забыть разговор</button>
        {!p.demo && <button type="button" role="menuitem" class="danger" onClick={act(p.onForget)}>Удалить мои данные</button>}
        <a role="menuitem" href="/privacy">Конфиденциальность</a>
      </div>
    </header>
  );
}
