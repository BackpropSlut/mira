// Карта сайта для Яндекса и Google. Новую страницу добавляем сюда же.
import type { APIRoute } from 'astro';

const pages = [
  { path: '/', priority: '1.0' },
  { path: '/help', priority: '0.8' },
  { path: '/privacy', priority: '0.3' },
];

export const GET: APIRoute = ({ site }) => {
  const urls = pages
    .map((p) => `  <url><loc>${new URL(p.path, site).href}</loc><priority>${p.priority}</priority></url>`)
    .join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
