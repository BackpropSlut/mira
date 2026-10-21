// Service worker для приложения Inlo (/chat с домашнего экрана).
// Трогаем только GET своего домена. Разговор не кэшируется никогда: /api/* (демо через Gemini) пропускаем,
// API бота живёт на другом домене и сюда не попадает. Сообщения о самочувствии в кэш браузера не пишем (152-ФЗ).
// Страницы: сначала сеть. Нет сети: /help и /breathe из кэша (номера помощи и дыхание работают офлайн), остальное → /offline.
// Адреса без .html: на Vercel включён cleanUrls, /offline.html отвечает редиректом, а ответ после редиректа браузер не отдаёт на навигацию.
// Файлы сборки /_astro/* с хэшем в имени: сначала кэш, они не меняются.
// Поменял этот файл или список ниже: подними VERSION, иначе у людей останется старый кэш.
const VERSION = 'inlo-v3';
const PAGES = ['/chat', '/help', '/breathe'];
const OFFLINE_PAGES = ['/help', '/breathe'];
const STATIC = ['/offline', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(STATIC);
    // Оболочка: CSS и JS страниц, чтобы приложение открывалось быстро и /help с /breathe работали без сети
    for (const url of PAGES) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) continue;
        const html = await res.clone().text();
        if (OFFLINE_PAGES.includes(url)) await cache.put(url, res);
        const assets = [...new Set(html.match(/\/_astro\/[^"'\s)]+/g) || [])];
        await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
      } catch {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && OFFLINE_PAGES.includes(url.pathname)) (await caches.open(VERSION)).put(url.pathname, res.clone());
        return res;
      } catch {
        return (OFFLINE_PAGES.includes(url.pathname) && (await caches.match(url.pathname))) || (await caches.match('/offline')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_astro/')) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // Иконки, шрифты, картинки неба: отдаём из кэша, если есть, и тихо обновляем
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
    return fresh;
  })());
});
