// Общие типы чата.

export type Note = 'voice-limit' | 'text-limit' | 'demo-off';

/** Одна реплика в ленте. note: служебная карточка вместо пузыря. */
export type Msg = { who: 'me' | 'mira'; text: string; crisis?: boolean; voice?: string; note?: Note };

export type Plan = { premium: boolean; until?: string };

export const VOICES = ['f', 'm', 'off'] as const;
export type Voice = (typeof VOICES)[number];
export const VOICE_LABEL: Record<Voice, string> = { f: 'женский', m: 'мужской', off: 'выключен' };

/** Какой лист открыт. Одновременно только один. */
export type SheetName = 'help' | 'install' | 'breathe' | 'plus' | 'forget' | null;

/** Номера живой помощи: закреплены в кризисе и в листе «Помощь». */
export const CALLS = [
  { href: 'tel:112', label: 'Экстренно', num: '112', urgent: true },
  { href: 'tel:+74959895050', label: 'Психологи МЧС, 24/7', num: '+7 495 989‑50‑50', urgent: false },
];
