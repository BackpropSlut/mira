// Выбор модели по LLM_PROVIDER. Остальной код знает только про complete({ system, messages }).

import { createStub } from './stub.js';
import { createGigaChat } from './gigachat.js';
import { createOpenAICompatible } from './openai.js';

export function createLLM(cfg, deps) {
  switch (cfg.provider) {
    case 'stub': return createStub();
    case 'gigachat': return createGigaChat(cfg, deps);
    case 'openai': return createOpenAICompatible(cfg, deps);
    default: throw new Error(`Неизвестный LLM_PROVIDER: ${cfg.provider}`);
  }
}
