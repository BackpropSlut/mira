// Живые часы и батарея в макете телефона: время и дата по часовому поясу посетителя.
// Первое значение ставит inline-скрипт в StatusBar.astro до отрисовки, здесь только обновление раз в минуту.

const time = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const date = (d: Date) => d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

function paint() {
  const d = new Date();
  document.querySelectorAll('[data-clock]').forEach((el) => { el.textContent = time(d); });
  document.querySelectorAll('[data-date]').forEach((el) => { el.textContent = date(d); });
}

/** Обновляет часы ровно на смене минуты, а не через случайные 60 секунд от загрузки. */
export function startClock() {
  paint();
  const toNext = 60000 - (Date.now() % 60000);
  setTimeout(() => { paint(); setInterval(paint, 60000); }, toNext + 50);
}

/** Уровень батареи в макете как у посетителя, где браузер это сообщает (Chrome). Иначе остаётся почти полной. */
export function startBattery() {
  const set = (level: number) => document.querySelectorAll<SVGRectElement>('.sb-bat-lvl')
    .forEach((r) => r.setAttribute('width', String(Math.max(2, 20 * level))));
  (navigator as any).getBattery?.().then((b: any) => {
    set(b.level);
    b.addEventListener('levelchange', () => set(b.level));
  }).catch(() => {});
}
