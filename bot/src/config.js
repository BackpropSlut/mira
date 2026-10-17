// Все настройки из переменных окружения, чтобы бот переезжал между серверами без правок кода.

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export function loadConfig(e = env) {
  return {
    telegramToken: e.TELEGRAM_BOT_TOKEN || '',
    webAppUrl: e.WEBAPP_URL || '',
    // Webhook вместо long polling: включается, когда задан секрет и есть публичный HTTPS-адрес (PUBLIC_API_URL)
    telegramWebhookSecret: e.TELEGRAM_WEBHOOK_SECRET || '',
    idSalt: e.ID_SALT || '',
    port: num(e.PORT, 8080),
    sessionSecret: e.SESSION_SECRET || e.ID_SALT || '',
    // Откуда можно звать API из браузера: сайт и превью. Через запятую.
    allowedOrigins: (e.ALLOWED_ORIGINS || 'https://www.heyinlo.com,https://mira-plum-mu.vercel.app').split(',').map((s) => s.trim()).filter(Boolean),
    dbPath: e.DB_PATH || './data/mira.db',
    // Публичный адрес API, чтобы ссылки на голосовые ответы были полными (https://api.heyinlo.com). Пусто = относительные.
    publicApiUrl: (e.PUBLIC_API_URL || '').replace(/\/$/, ''),
    plans: {
      freeVoiceTrial: num(e.FREE_VOICE_TRIAL, 5), // скрытый пробный голос: столько голосовых ответов бесплатно
      freeTextPerDay: num(e.FREE_TEXT_PER_DAY, 15), // сообщений в сутки (МСК) на бесплатном тарифе
    },
    tts: { provider: e.TTS_PROVIDER || 'none' },
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
