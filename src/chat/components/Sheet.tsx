// Лист поверх чата на <dialog>. Открытием управляет родитель через open.
// Закрывается по Escape, по тапу мимо, свайпом вниз на телефоне (как в iOS) и уходит анимацией.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { reduce } from '../env';

type Props = {
  open: boolean;
  /** Человек хочет закрыть: родитель ставит open = false. */
  onRequestClose: () => void;
  /** Лист закрылся окончательно, после анимации. */
  onClosed?: () => void;
  class: string;
  labelledby: string;
  describedby?: string;
  kind?: string;
  children: ComponentChildren;
};

/** Уводит лист анимацией, потом закрывает dialog. */
function dismiss(d: HTMLDialogElement) {
  if (!d.open || d.classList.contains('closing')) return;
  if (reduce()) { d.close(); return; }
  d.classList.add('closing');
  const done = (e: AnimationEvent) => {
    if (e.target !== d) return;
    d.removeEventListener('animationend', done);
    d.classList.remove('closing'); d.style.transform = ''; d.close();
  };
  d.addEventListener('animationend', done);
}

export function Sheet({ open, onRequestClose, onClosed, class: cls, labelledby, describedby, kind, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Свежие колбэки для обработчиков, навешенных один раз
  const cb = useRef({ onRequestClose, onClosed, open });
  cb.current = { onRequestClose, onClosed, open };

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) { d.classList.remove('closing'); d.style.transform = ''; d.showModal(); }
    else if (!open && d.open) dismiss(d);
  }, [open]);

  useEffect(() => {
    const d = ref.current!;
    const ask = () => cb.current.onRequestClose();
    const onCancel = (e: Event) => { e.preventDefault(); ask(); };
    const onClick = (e: MouseEvent) => { if (e.target === d) ask(); };
    const onClose = () => { cb.current.onClosed?.(); if (cb.current.open) ask(); };

    // Свайп вниз: лист идёт за пальцем, дальше 120 px тянется туже
    let y0 = 0, t0 = 0, dy = 0, drag = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('input, button, a, label') || d.scrollTop > 0) return;
      drag = true; y0 = e.clientY; t0 = e.timeStamp; dy = 0; d.style.transition = 'none';
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      dy = Math.max(0, e.clientY - y0);
      d.style.transform = `translateY(${dy < 120 ? dy : 120 + (dy - 120) * .5}px)`;
    };
    const up = (e: PointerEvent) => {
      if (!drag) return;
      drag = false; d.style.transition = '';
      const fast = dy / Math.max(1, e.timeStamp - t0) > .6;
      if (dy > 110 || (fast && dy > 30)) ask(); else d.style.transform = '';
    };

    d.addEventListener('cancel', onCancel);
    d.addEventListener('click', onClick);
    d.addEventListener('close', onClose);
    d.addEventListener('pointerdown', down);
    d.addEventListener('pointermove', move);
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('click', onClick);
      d.removeEventListener('close', onClose);
      d.removeEventListener('pointerdown', down);
      d.removeEventListener('pointermove', move);
      d.removeEventListener('pointerup', up);
      d.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <dialog ref={ref} class={cls} aria-labelledby={labelledby} aria-describedby={describedby} data-kind={kind}>
      {children}
    </dialog>
  );
}
