// «Добавить на экран „Домой“»: текст зависит от платформы (CSS показывает блок по data-kind).
import { useState } from 'preact/hooks';
import type { InstallKind } from '../../lib/install';
import { Sheet } from '../components/Sheet';

type Props = {
  open: boolean;
  kind: InstallKind;
  onClose: () => void;
  /** Лист закрылся: если не установили, неделю не напоминаем. */
  onClosed: () => void;
  onPrompt: () => void;
};

export function InstallSheet({ open, kind, onClose, onClosed, onPrompt }: Props) {
  const [copy, setCopy] = useState('Скопировать ссылку');
  const copyLink = async () => {
    const url = `${location.origin}/chat`;
    try { await navigator.clipboard.writeText(url); setCopy('Ссылка скопирована'); } catch { setCopy(url.replace(/^https?:\/\//, '')); }
  };

  return (
    <Sheet open={open} onRequestClose={onClose} onClosed={onClosed} class="plus install" labelledby="in-h" kind={kind || undefined}>
      <div class="p-head">
        <img class="in-icon" src="/icons/icon-192.png" alt="" width={64} height={64} />
        <h2 id="in-h">{kind === 'ios' ? 'Inlo на экране «Домой»' : 'Установить Inlo'}</h2>
        <p class="fg-text">Будет открываться сразу в&nbsp;чат, на&nbsp;весь экран, без панелей браузера.</p>
      </div>
      <ol class="in-steps" data-for="ios">
        <li>
          <span class="in-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5v11M8 7.5l4-4 4 4M8.5 10.5H7a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <span>Нажми <b>«Поделиться»</b>. Если его не&nbsp;видно, сначала нажми <b>«•••»</b> рядом с&nbsp;адресом.</span>
        </li>
        <li>
          <span class="in-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
          <span>Выбери <b>«На экран „Домой“»</b>. Пункт может быть ниже, пролистай список.</span>
        </li>
        <li>
          <span class="in-ic in-app"><img src="/icons/icon-192.png" alt="" width={28} height={28} /></span>
          <span>Нажми <b>«Добавить»</b>. Иконка Inlo появится рядом с&nbsp;другими приложениями.</span>
        </li>
      </ol>
      <div class="in-other" data-for="ios-other">
        <p class="fg-text">Открой сайт в&nbsp;<b>Safari</b>, чтобы установить: в&nbsp;этом браузере iPhone не&nbsp;даёт добавить его на&nbsp;экран «Домой».</p>
        <button class="in-copy" type="button" onClick={copyLink}>{copy}</button>
      </div>
      <button class="start in-go" type="button" data-for="prompt" onClick={onPrompt}>Установить Inlo</button>
      <button class="p-close in-later" type="button" onClick={onClose}>Не сейчас</button>
    </Sheet>
  );
}
