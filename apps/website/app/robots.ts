import type { MetadataRoute } from 'next';

const serverURL = process.env.BASE_URL ?? 'http://localhost:3001';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/next/'] }],
    sitemap: `${serverURL}/sitemap.xml`,
  };
}
