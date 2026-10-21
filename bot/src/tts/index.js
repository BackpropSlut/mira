// Голос Inlo. Свои голоса (мужской и женский) появятся позже; пока провайдер none, и голосовых ответов нет.
// Интерфейс уже нужен, чтобы тарифы (пробный голос, премиум) работали сразу, как только подключим синтез.

export function createTTS(cfg = {}) {
  switch ((cfg.provider || 'none').toLowerCase()) {
    case 'none':
      return { available: false, async synthesize() { return null; } };
    default:
      throw new Error(`Неизвестный TTS_PROVIDER: ${cfg.provider}`);
  }
}
