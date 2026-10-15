import type { RequestHandler } from './$types';

// The public pages, and nothing else. Rooms are never listed.
const PAGES = ['/', '/poker', '/schema', '/text', '/privacy'];

export const GET: RequestHandler = ({ url }) => {
  const entries = PAGES.map((path) => `  <url><loc>${url.origin}${path}</loc></url>`).join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'max-age=3600',
      },
    },
  );
};
