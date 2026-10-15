// Заглушка вместо модели: бот целиком работает без ключей и без сети. Для разработки и тестов.

export function createStub() {
  return {
    name: 'stub',
    async complete({ messages }) {
      const last = messages.at(-1)?.content || '';
      const short = last.length > 80 ? `${last.slice(0, 80)}…` : last;
      return {
        text: `(заглушка) Я тебя слышу: «${short}». Что ты почувствовал(а), когда это случилось?`,
        blocked: false,
      };
    },
  };
}
