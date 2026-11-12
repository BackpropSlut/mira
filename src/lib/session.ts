// Кто пользователь: все способы входа в одном месте, страницы спрашивают только этот модуль.
// Сейчас: анонимный токен устройства на сайте. Позже: Яндекс ID и VK ID.
// Вход через Apple и Google не делаем: российским сайтам он запрещён (406-ФЗ).

const KEY = 'mira-token';
let token = (() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } })();

/** Тело для POST /v1/session (bot/API.md §1). */
export function sessionBody() {
  return { channel: 'web', ...(token ? { token } : {}) };
}

/** Заголовок авторизации для запросов к API бота. */
export const authHeader = (): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

export const hasToken = () => !!token;

/** Токен из /v1/session, живёт в localStorage этого браузера. */
export function setToken(t: string) {
  token = t;
  try { localStorage.setItem(KEY, t); } catch {}
}
