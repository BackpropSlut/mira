// Окружение, в котором открыт чат. Класс standalone ставит inline-скрипт в chat.astro до загрузки острова.

export const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(pointer: fine)').matches;
export const isStandaloneMode = () => document.documentElement.classList.contains('standalone');
export const isNight = () => document.documentElement.classList.contains('night');

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
