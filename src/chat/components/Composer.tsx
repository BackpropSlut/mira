// Поле ввода и быстрые ответы.
import { useEffect, useRef, useState } from 'preact/hooks';
import { finePointer } from '../env';

// Нажатие на «Отправить» и чипы не забирает фокус у поля: клавиатура остаётся, как в мессенджерах,
// а нижняя навигация не выскакивает посреди нажатия и не сдвигает кнопку из-под пальца
const keepFocus = (e: MouseEvent) => e.preventDefault();

export function Chips({ onSay, onBreathe }: { onSay: (t: string) => void; onBreathe: () => void }) {
  return (
    <div class="chips" role="group" aria-label="Быстрый ответ" onMouseDown={keepFocus}>
      <button type="button" onClick={() => onSay('Мне тревожно')}>Мне тревожно</button>
      <button type="button" onClick={() => onSay('Не могу уснуть')}>Не могу уснуть</button>
      <button type="button" onClick={() => onSay('Хочу просто выговориться')}>Хочу выговориться</button>
      <button type="button" onClick={onBreathe}>Подышать минуту</button>
    </div>
  );
}

type Props = {
  busy: boolean;
  onSend: (text: string) => void;
  /** Меняется, когда чат открылся: на компьютере ставим курсор в поле. */
  focusKey: number;
};

export function Composer({ busy, onSend, focusKey }: Props) {
  const [value, setValue] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  // Поле растёт вместе с текстом до 140 px
  useEffect(() => {
    const el = area.current!;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);

  useEffect(() => {
    if (!focusKey || !finePointer()) return;
    const t = setTimeout(() => area.current?.focus(), 500);
    return () => clearTimeout(t);
  }, [focusKey]);

  const submit = (e?: Event) => {
    e?.preventDefault();
    if (busy || !value.trim()) return;
    onSend(value);
    setValue('');
  };

  return (
    <form class="composer" autocomplete="off" onSubmit={submit}>
      <label class="sr" for="q">Сообщение для Inlo</label>
      <textarea id="q" ref={area} rows={1} maxLength={2000} placeholder="Сообщение" enterkeyhint="send" value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          // Enter отправляет на компьютере, на телефоне Enter это перенос строки
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && finePointer()) submit(e);
        }} />
      <button class="send" type="submit" aria-label="Отправить" disabled={busy || !value.trim()} onMouseDown={keepFocus}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6m0 0l-6 6m6-6l6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </form>
  );
}
