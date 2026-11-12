// Подышать минуту прямо в чате: вдох 4, выдох 6, шесть кругов.
import { useEffect, useState } from 'preact/hooks';
import { MiniCloud } from '../components/MiniCloud';
import { Sheet } from '../components/Sheet';

const IN = 4, OUT = 6, ROUNDS = 6, TOTAL = (IN + OUT) * ROUNDS;

type Props = {
  open: boolean;
  /** done: досидели до конца, а не закрыли раньше. */
  onFinish: (done: boolean) => void;
};

export function BreatheSheet({ open, onFinish }: Props) {
  const [t, setT] = useState(-2); // две секунды «приготовься»

  useEffect(() => {
    if (!open) return;
    setT(-2);
    const timer = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => { if (open && t >= TOTAL) onFinish(true); }, [t, open]);

  // После последней секунды держим финальный кадр, пока лист уезжает
  const started = t >= 0;
  const inCycle = started ? Math.min(t, TOTAL - 1) % (IN + OUT) : 0;
  const inhale = inCycle < IN;
  const phase = started ? (inhale ? 'in' : 'out') : '';

  return (
    <Sheet open={open} onRequestClose={() => onFinish(false)} class={phase ? `sheet ${phase}` : 'sheet'} labelledby="br-h">
      <p class="br-step" id="br-h" aria-live="polite">{started ? (inhale ? 'Вдох' : 'Выдох') : 'Приготовься'}</p>
      <div class="br-cloud" aria-hidden="true"><MiniCloud size={150} sleepy /></div>
      <p class="br-count" aria-hidden="true">{started ? String(inhale ? IN - inCycle : IN + OUT - inCycle) : ''}</p>
      <div class="br-progress" aria-hidden="true"><i style={{ transform: `scaleX(${started ? Math.min(1, (t + 1) / TOTAL) : 0})` }} /></div>
      <button class="br-close" type="button" onClick={() => onFinish(false)}>Хватит</button>
    </Sheet>
  );
}
