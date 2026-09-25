import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: '/', destination: '/docs', permanent: false }];
  },
  async rewrites() {
    // Every page as Markdown for AI agents: /docs/deployment/vercel.md
    return [{ source: '/docs/:slug*.md', destination: '/llms.mdx/docs/:slug*/content.md' }];
  },
};

export default createMDX()(config);
