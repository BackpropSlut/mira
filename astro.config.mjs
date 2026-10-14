import { defineConfig } from 'astro/config';

// Статический сайт. Исключение: демо-чат на главной (api/chat.js, функция Vercel → Gemini, без хранения).
// Настоящий чат будет ходить в API на сервере в РФ напрямую из браузера (152-ФЗ).
export default defineConfig({
  site: 'https://mira-plum-mu.vercel.app',
  trailingSlash: 'never',
  build: { format: 'file' },
});
