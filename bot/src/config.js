// Все настройки из переменных окружения, чтобы бот переезжал между серверами без правок кода.

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export function loadConfig(e = env) {
  return {
    telegramToken: e.TELEGRAM_BOT_TOKEN || '',
    webAppUrl: e.WEBAPP_URL || '',
    idSalt: e.ID_SALT || '',
    llm: {
      provider: (e.LLM_PROVIDER || 'stub').toLowerCase(),
      model: e.LLM_MODEL || 'GigaChat-2',
      temperature: num(e.LLM_TEMPERATURE, 0.6),
      maxTokens: num(e.LLM_MAX_TOKENS, 600),
      timeoutMs: num(e.LLM_TIMEOUT_MS, 30000),
      gigachat: {
        authKey: e.GIGACHAT_AUTH_KEY || '',
        scope: e.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS',
        oauthUrl: e.GIGACHAT_OAUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
        apiUrl: e.GIGACHAT_API_URL || 'https://gigachat.devices.sberbank.ru/api/v1',
      },
      openai: {
        baseUrl: e.OPENAI_BASE_URL || '',
        apiKey: e.OPENAI_API_KEY || '',
      },
    },
    dialog: {
      maxTurns: num(e.DIALOG_MAX_TURNS, 16), // сколько последних реплик помнит модель
      maxChars: num(e.DIALOG_MAX_CHARS, 2000), // длина одного сообщения пользователя
      idleMs: num(e.DIALOG_IDLE_MS, 6 * 60 * 60 * 1000), // через сколько тишины забываем разговор
      rateLimit: num(e.DIALOG_RATE_LIMIT, 20), // сообщений
      rateWindowMs: num(e.DIALOG_RATE_WINDOW_MS, 10 * 60 * 1000), // за окно
    },
  };
}
