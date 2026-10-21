// Карта сайта для Яндекса и Google. Новую страницу добавляем сюда же, вместе с файлами, от которых зависит её текст.
// lastmod: дата последнего коммита, который трогал эти файлы. Если истории нет (неглубокий клон на Vercel), дата последнего коммита вообще.
import type { APIRoute } from 'astro';
import { execFileSync } from 'node:child_process';

const pages = [
  { path: '/', priority: '1.0', files: ['src/pages/index.astro', 'src/components/Phone.astro'] },
  { path: '/chat', priority: '0.9', files: ['src/pages/chat.astro'] },
  { path: '/breathe', priority: '0.8', files: ['src/pages/breathe.astro'] },
  { path: '/help', priority: '0.8', files: ['src/pages/help.astro'] },
  { path: '/privacy', priority: '0.3', files: ['src/pages/privacy.astro'] },
];

function lastCommit(files: string[] = []) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}
const fallback = lastCommit() || new Date().toISOString().slice(0, 10);

export const GET: APIRoute = ({ site }) => {
  const urls = pages
    .map((p) => `  <url><loc>${new URL(p.path, site).href}</loc><lastmod>${lastCommit(p.files) || fallback}</lastmod><priority>${p.priority}</priority></url>`)
    .join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
