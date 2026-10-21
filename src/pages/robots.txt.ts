import type { APIRoute } from 'astro';

// /api закрыт: там только функция демо-чата. Clean-param для Яндекса: ?t= лишь переключает фазу неба для проверки,
// без него робот считал бы /?t=night отдельной страницей-дублем.
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /api/\n\nUser-agent: Yandex\nAllow: /\nDisallow: /api/\nClean-param: t /\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
