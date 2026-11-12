// Оболочка вокруг чата: PWA (service worker, цвет строки состояния)
// и подгонка высоты под клавиатуру на iOS. Всё один раз при монтировании.
import { useEffect } from 'preact/hooks';

export function useShell() {
  useEffect(() => {
    const off: (() => void)[] = [];

    // Офлайн-кэш для приложения с домашнего экрана
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    // Строка состояния в цвет фона
    {
      const metas = document.querySelectorAll<HTMLMetaElement>('meta[name=theme-color]');
      const paint = () => {
        const c = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
        if (c) metas.forEach((m) => { m.removeAttribute('media'); m.content = c; });
      };
      paint();
      const mq = matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', paint);
      off.push(() => mq.removeEventListener('change', paint));
    }

    // iOS не уменьшает страницу под клавиатуру, а сдвигает её: подгоняем чат под видимую часть.
    // На Android хватает interactive-widget в viewport
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        if (vv.scale > 1.01) return; // человек приблизил пальцами, не мешаем
        document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
        if (vv.offsetTop > 0) scrollTo(0, 0);
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      fit();
      off.push(() => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); });
    }

    return () => off.forEach((f) => f());
  }, []);
}
