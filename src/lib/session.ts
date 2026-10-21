// Кто пользователь: все способы входа в одном месте, страницы спрашивают только этот модуль.
// Сейчас: Telegram Mini App (initData, подпись проверяет API бота) или анонимный токен устройства на сайте.
// Позже на сайте: Яндекс ID и VK ID. Вход через Apple и Google не делаем: российским сайтам он запрещён (406-ФЗ).
// Вход через Telegram на сайте тоже под вопросом: Telegram не российская компания, перед запуском уточнить у юриста.
// Mini App внутри Telegram это не вход на сайт, его не касается.

export type Channel = 'tg' | 'web';

const KEY = 'mira-token';
let token = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();

function initData(): string {
  return (window as any).Telegram?.WebApp?.initData || '';
}

/** Откуда пришёл человек: Mini App в Telegram или сайт. */
export const channel = (): Channel => (initData() ? 'tg' : 'web');

/** Тело для POST /v1/session (bot/API.md §1). */
export function sessionBody() {
  return channel() === 'tg' ? { channel: 'tg', initData: initData() } : { channel: 'web', ...(token ? { token } : {}) };
}

/** Заголовок авторизации для запросов к API бота. */
export const authHeader = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

export const hasToken = () => !!token;

/** Токен из /v1/session. На сайте живёт в localStorage, в Telegram только в памяти: там нас узнают по initData. */
export function setToken(t: string) {
  token = t;
  if (channel() === 'web') try { localStorage.setItem(KEY, t); } catch {}
}
