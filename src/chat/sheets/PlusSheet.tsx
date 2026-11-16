// Inlo Plus: что входит и поле для кода доступа.
import { useEffect, useState } from 'preact/hooks';
import { MiniCloud } from '../components/MiniCloud';
import { Sheet } from '../components/Sheet';
import type { Plan } from '../types';

export type RedeemResult = { ok: boolean; text: string };

type Props = {
  open: boolean;
  plan: Plan;
  onClose: () => void;
  onRedeem: (code: string) => Promise<RedeemResult>;
};

export function PlusSheet({ open, plan, onClose, onRedeem }: Props) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ kind: '' | 'ok' | 'err'; text: string }>({ kind: '', text: '' });
  useEffect(() => { if (open) setMsg({ kind: '', text: '' }); }, [open]);

  const date = plan.until ? new Date(plan.until).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';

  async function submit(e: Event) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setMsg({ kind: '', text: 'Проверяю…' });
    const r = await onRedeem(c);
    setMsg({ kind: r.ok ? 'ok' : 'err', text: r.text });
    if (r.ok) setCode('');
  }

  return (
    <Sheet open={open} onRequestClose={onClose} class="plus" labelledby="plus-h">
      <div class="p-head">
        <span class="p-cloud" aria-hidden="true"><MiniCloud size={44} /></span>
        <h2 id="plus-h">Inlo Plus</h2>
        <p class="p-state">{plan.premium ? `У тебя Inlo Plus${date ? ` до ${date}` : ''}` : 'Сейчас у тебя бесплатная версия'}</p>
      </div>
      <div class="tiers">
        <section class="tier">
          <h3>Бесплатно</h3>
          <ul>
            <li>Текстовый чат с&nbsp;Inlo</li>
            <li>Несколько голосовых ответов на&nbsp;пробу</li>
            <li>Подышать вместе</li>
            <li>Номера помощи 24/7, всегда и&nbsp;без лимитов</li>
          </ul>
        </section>
        <section class="tier hi">
          <h3>Plus</h3>
          <ul>
            <li>Inlo отвечает голосом, без ограничений</li>
            <li>История разговоров сохраняется</li>
            <li>Всё, что есть в&nbsp;бесплатной версии</li>
          </ul>
        </section>
      </div>
      <form class="code" autocomplete="off" hidden={plan.premium} onSubmit={submit}>
        <label for="code-in">Код доступа</label>
        <div class="code-row">
          <input id="code-in" name="code" placeholder="MIRA-TEST-XXXX" autocapitalize="characters" spellcheck={false} maxLength={40}
            value={code} onInput={(e) => setCode(e.currentTarget.value)} />
          <button type="submit">Активировать</button>
        </div>
        <p class={msg.kind ? `code-msg ${msg.kind}` : 'code-msg'} role="status">{msg.text}</p>
      </form>
      <p class="p-note">Оплата появится к&nbsp;запуску. Тестировщикам код выдаёт команда Inlo.</p>
      <button class="p-close" type="button" onClick={onClose}>Закрыть</button>
    </Sheet>
  );
}
