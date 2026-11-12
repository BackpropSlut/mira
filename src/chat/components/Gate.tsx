// Ворота перед первым сообщением: кто такая Inlo, две галочки и «Начать».
// Родитель пересоздаёт компонент (key), когда ворота нужно показать заново: галочки сбрасываются.
import { useState } from 'preact/hooks';
import { MiniCloud } from './MiniCloud';

type Props = {
  demo: boolean;
  /** Сообщение после удаления данных: «Готово, твои данные удалены». */
  done?: string;
  /** Согласие: true, если чат открылся. */
  onStart: () => Promise<boolean>;
};

export function Gate({ demo, done, onStart }: Props) {
  const [adult, setAdult] = useState(false);
  const [data, setData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function start() {
    setBusy(true); setErr(false);
    const ok = await onStart().catch(() => false);
    if (!ok) { setErr(true); setBusy(false); }
  }

  return (
    <section class="gate on-sky" aria-labelledby="gate-h">
      <div class="g-cloud" aria-hidden="true"><MiniCloud size={92} /></div>
      <h1 id="gate-h">Привет, я&nbsp;Inlo.</h1>
      <p class="g-done" role="status" hidden={!done}>{done}</p>
      <p class="g-lead">Выслушаю, помогу разобрать тревожную мысль и&nbsp;подышу вместе с&nbsp;тобой.</p>
      <ul class="facts">
        <li><span class="ic" aria-hidden="true">AI</span><span><b>Я AI, а&nbsp;не&nbsp;психолог.</b> Не&nbsp;ставлю диагнозов и&nbsp;не&nbsp;заменяю специалиста.</span></li>
        <li><span class="ic sos-ic" aria-hidden="true">+</span><span><b>Если очень плохо,</b> звони 112 или на&nbsp;линию МЧС. Номера всегда под кнопкой «Помощь» сверху.</span></li>
        {demo
          ? <li><span class="ic" aria-hidden="true">i</span><span><b>Это демо.</b> Пока готовим собственный сервер, отвечает DeepSeek. Переписка не&nbsp;сохраняется, но&nbsp;не&nbsp;пиши имён и&nbsp;личных данных.</span></li>
          : <li><span class="ic" aria-hidden="true">i</span><span><b>Без регистрации.</b> Не&nbsp;спрашиваю имя и&nbsp;телефон.</span></li>}
      </ul>
      <label class="check">
        <input type="checkbox" id="c18" checked={adult} onChange={(e) => setAdult(e.currentTarget.checked)} />
        <span class="box" aria-hidden="true" /><span>Мне есть 18&nbsp;лет</span>
      </label>
      <label class="check">
        <input type="checkbox" id="cdata" checked={data} onChange={(e) => setData(e.currentTarget.checked)} />
        <span class="box" aria-hidden="true" />
        {demo
          ? <span>Понимаю, что это демо и&nbsp;мои сообщения обрабатывает DeepSeek</span>
          : <span>Согласен(на) на&nbsp;обработку того, что я&nbsp;пишу о&nbsp;самочувствии. <a href="/privacy">Как это устроено</a></span>}
      </label>
      <button class="start" type="button" disabled={!(adult && data) || busy} onClick={start}>Начать</button>
      <p class="g-err" role="alert" hidden={!err}>Не получилось связаться с&nbsp;Inlo. Проверь интернет и&nbsp;нажми ещё раз.</p>
    </section>
  );
}
