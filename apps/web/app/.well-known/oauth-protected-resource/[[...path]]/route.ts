import { protectedResourceResponse } from '@/lib/oauth/metadata';

/** RFC 9728 protected resource metadata, at the root and path-suffixed (`…/api/mcp`). */
export const GET = protectedResourceResponse;
export const OPTIONS = protectedResourceResponse;
