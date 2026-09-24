import type { NextConfig } from 'next';
import { withPayload } from '@payloadcms/next/withPayload';

const nextConfig: NextConfig = {
  // Deliberately no `cacheComponents` (which apps/web does enable): Payload's
  // admin panel misbehaves under it, and this app needs none of it — pages are
  // statically generated and revalidated on publish (WEBSITE_TECHNICAL.md §1).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
};

export default withPayload(nextConfig);
