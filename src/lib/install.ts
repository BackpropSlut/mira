// Когда и как предлагать «Добавить на экран „Домой“». Только проверки, сам лист живёт в chat.astro.
// ios: Safari на iPhone/iPad, ставится через «Поделиться». ios-other: Chrome, Telegram, Instagram и другие на iOS,
// там просим открыть сайт в Safari. prompt: Chrome на Android и компьютере дал beforeinstallprompt, ставим своей кнопкой.

export type InstallKind = 'ios' | 'ios-other' | 'prompt' | null;

export interface Env {
  ua: string;
  /** navigator.userAgentData.platform, есть только в Chromium. */
  uaPlatform?: string;
  touchPoints: number;
  /** Уже открыто как приложение с домашнего экрана. */
  standalone: boolean;
  telegram: boolean;
  /** Пришло событие beforeinstallprompt. */
  canPrompt: boolean;
}

// Встроенные браузеры и не-Safari на iOS: у них нет пункта «На экран „Домой“» или он ненадёжен
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|YaApp|GSA\/|Instagram|FBAN|FBAV|Line\/|Telegram|VKClient|DuckDuckGo|Snapchat|Twitter/;

export function isIOS(e: Pick<Env, 'ua' | 'uaPlatform' | 'touchPoints'>) {
  if (e.uaPlatform) return e.uaPlatform === 'iOS';
  // iPad в Safari притворяется Mac, выдаёт его сенсорный экран
  return /iPhone|iPad|iPod/.test(e.ua) || (/Macintosh/.test(e.ua) && e.touchPoints > 1);
}

export function installKind(e: Env): InstallKind {
  if (e.standalone || e.telegram) return null;
  if (isIOS(e)) return /Version\/[\d.]+.*Safari\//.test(e.ua) && !NOT_SAFARI.test(e.ua) ? 'ios' : 'ios-other';
  return e.canPrompt ? 'prompt' : null;
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as any).standalone === true;
}

// «Не сейчас» прячет подсказку на 7 дней
const LATER = 'inlo-install-later';
const WEEK = 7 * 24 * 60 * 60 * 1000;
export function snoozed() {
  try { return Date.now() < Number(localStorage.getItem(LATER) || 0); } catch { return false; }
}
export function snooze() {
  try { localStorage.setItem(LATER, String(Date.now() + WEEK)); } catch {}
}
