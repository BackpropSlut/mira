// Номера помощи без перехода со страницы: в приложении нельзя терять разговор.
import { Calls } from '../components/Calls';
import { Sheet } from '../components/Sheet';

export function HelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onRequestClose={onClose} class="plus help-sheet" labelledby="hs-h" describedby="hs-d">
      <div class="p-head">
        <h2 id="hs-h">Нужна помощь сейчас</h2>
        <p id="hs-d" class="fg-text">Если очень плохо или есть мысли навредить себе, позвони. Это бесплатно, отвечают живые люди, звонок работает и&nbsp;без интернета.</p>
      </div>
      <div class="hs-calls"><Calls /></div>
      <a class="hs-all" href="/help">Все проверенные номера</a>
      <button class="p-close" type="button" onClick={onClose}>Закрыть</button>
    </Sheet>
  );
}
