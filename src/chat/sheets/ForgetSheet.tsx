// Удаление данных (bot/API.md §4, /v1/forget): сначала «точно?», как в боте команда /delete.
import { useEffect, useState } from 'preact/hooks';
import { Sheet } from '../components/Sheet';

type Props = {
  open: boolean;
  onClose: () => void;
  /** true, если сервер всё удалил. */
  onConfirm: () => Promise<boolean>;
};

export function ForgetSheet({ open, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { if (open) { setBusy(false); setErr(false); } }, [open]);

  async function yes() {
    setBusy(true); setErr(false);
    const ok = await onConfirm().catch(() => false);
    if (!ok) { setErr(true); setBusy(false); }
  }

  return (
    <Sheet open={open} onRequestClose={onClose} class="plus forget" labelledby="fg-h" describedby="fg-d">
      <div class="p-head">
        <h2 id="fg-h">Удалить мои данные?</h2>
        <p id="fg-d" class="fg-text">Удалятся переписка, сохранённая история и&nbsp;согласие на&nbsp;обработку. Вернуть их не&nbsp;получится. Тариф и&nbsp;активированный код останутся.</p>
      </div>
      <button class="fg-yes" type="button" disabled={busy} onClick={yes}>Удалить</button>
      <p class="fg-err" role="alert" hidden={!err}>Не получилось удалить. Проверь интернет и&nbsp;попробуй ещё раз.</p>
      <button class="p-close" type="button" onClick={onClose}>Отмена</button>
    </Sheet>
  );
}
