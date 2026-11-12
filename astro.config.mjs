import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import { loadEnv } from 'vite';

// Статический сайт. /chat это SPA на Preact (остров client:only, src/chat), сервер для него не нужен.
// Исключение: демо-чат (api/chat.js, функция Vercel → DeepSeek, без хранения).
// Настоящий чат будет ходить в API на сервере в РФ напрямую из браузера (152-ФЗ).

// На Vercel /api/chat обслуживает сама платформа. В `npm run dev` функции нет, поэтому этот плагин
// отдаёт запрос той же функции из api/chat.js. Ключ DEEPSEEK_API_KEY берётся из .env.
function devChatApi() {
  return {
    name: 'inlo-dev-chat-api',
    apply: 'serve',
    configureServer(server) {
      // .env в process.env, не перетирая то, что уже задано в окружении
      for (const [k, v] of Object.entries(loadEnv('development', process.cwd(), ''))) process.env[k] ??= v;
      server.middlewares.use('/api/chat', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const host = req.headers.host || 'localhost';
          const request = new Request(`http://${host}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', host, origin: req.headers.origin || `http://${host}`, 'x-forwarded-for': '127.0.0.1' },
            body: Buffer.concat(chunks),
          });
          const { POST } = await server.ssrLoadModule('/api/chat.js');
          const r = await POST(request);
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  site: 'https://www.heyinlo.com',
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [preact()],
  vite: { plugins: [devChatApi()] },
});
