// «Добавить на экран „Домой“»: какой способ доступен и системный запрос Chrome.
import { useEffect, useRef, useState } from 'preact/hooks';
import { installKind, isStandalone, type InstallKind } from '../../lib/install';

export function useInstall() {
  const deferred = useRef<any>(null); // beforeinstallprompt: Chrome даёт его один раз, prompt() можно вызвать по нажатию
  const installed = useRef(false);
  const [kind, setKind] = useState<InstallKind>(null);

  const sync = () => setKind(installKind({
    ua: navigator.userAgent,
    uaPlatform: (navigator as any).userAgentData?.platform,
    touchPoints: navigator.maxTouchPoints || 0,
    standalone: isStandalone(),
    canPrompt: !!deferred.current,
  }));

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); deferred.current = e; sync(); };
    const onInstalled = () => { deferred.current = null; installed.current = true; sync(); };
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    sync();
    return () => { removeEventListener('beforeinstallprompt', onPrompt); removeEventListener('appinstalled', onInstalled); };
  }, []);

  /** Системный запрос установки (Chrome). Возвращает, согласился ли человек. */
  async function prompt() {
    const d = deferred.current;
    if (!d) return false;
    d.prompt();
    const { outcome } = await d.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferred.current = null;
    if (outcome === 'accepted') installed.current = true;
    sync();
    return outcome === 'accepted';
  }

  return { kind, prompt, installed };
}
