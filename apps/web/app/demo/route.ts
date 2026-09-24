import { auth } from '@/lib/auth/auth';

/**
 * The public demo link. Better Auth does the work (`lib/auth/demo.ts`): it
 * signs the visitor in as the read-only demo account and redirects, or
 * answers 404 on an instance without a demo.
 */
export async function GET(request: Request) {
  const url = new URL('/api/auth/demo/sign-in', request.url);
  return auth.handler(new Request(url, { headers: request.headers }));
}
