import type { RequestHandler } from './$types';

// Rooms are private: their addresses are secrets and must never be crawled.
export const GET: RequestHandler = ({ url }) =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /poker/r/\n\nSitemap: ${url.origin}/sitemap.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'max-age=3600' } },
  );
