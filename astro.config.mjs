import { defineConfig } from 'astro/config';

// Статический сайт: Vercel отдаёт только HTML/CSS/JS. Данные пользователей сюда не попадают (152-ФЗ),
// будущий чат ходит в API на сервере в РФ напрямую из браузера.
export default defineConfig({
  site: 'https://mira-plum-mu.vercel.app',
  trailingSlash: 'never',
  build: { format: 'file' },
});
