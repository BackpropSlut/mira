// Нижняя навигация: на телефоне в браузере и в приложении с домашнего экрана.
// «Главная» только в браузере (в приложении её прячет CSS), «Помощь» открывает номера одним касанием.
type Props = { onChat: () => void; onBreathe: () => void; onHelp: () => void };

export function TabBar({ onChat, onBreathe, onHelp }: Props) {
  return (
    <nav class="tabbar" aria-label="Разделы">
      <a class="tab home" href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" /></svg>
        <span>Главная</span>
      </a>
      <button type="button" class="tab" aria-current="page" onClick={onChat}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5C4 7.4 7.6 4.5 12 4.5s8 2.9 8 7-3.6 7-8 7c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.4C4.8 14.8 4 13.2 4 11.5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" /></svg>
        <span>Чат</span>
      </button>
      <button type="button" class="tab" onClick={onBreathe}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span>Подышать</span>
      </button>
      <button type="button" class="tab sos-tab" onClick={onHelp}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" /></svg>
        <span>Помощь</span>
      </button>
    </nav>
  );
}
