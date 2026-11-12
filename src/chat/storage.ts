// Хранилище браузера. В приватном режиме и при запрете cookie доступ бросает ошибку, поэтому всё в try.

export const KEYS = {
  chat: 'mira-chat', // переписка вкладки, sessionStorage
  crisis: 'mira-crisis', // кризисный режим до конца сессии, sessionStorage
  demoOk: 'inlo-demo-ok-deepseek', // согласие на демо; провайдер сменился, поэтому ключ новый
  voice: 'mira-voice', // выбранный голос, localStorage
  limit: (kind: string) => `mira-limit-${kind}`, // карточка лимита показана, sessionStorage
};

const local = () => { try { return localStorage; } catch { return null; } };
const session = () => { try { return sessionStorage; } catch { return null; } };

function make(s: () => Storage | null) {
  return {
    get: (k: string) => { try { return s()?.getItem(k) ?? null; } catch { return null; } },
    set: (k: string, v: string) => { try { s()?.setItem(k, v); } catch {} },
    del: (k: string) => { try { s()?.removeItem(k); } catch {} },
  };
}

export const ls = make(local);
export const ss = make(session);
