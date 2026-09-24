/**
 * Registration is unauthenticated by design (any MCP client may register), so
 * it is rate limited per client address in the shared `rate_limits` table.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { rateLimits } from '@/lib/db/schema';

const WINDOW_MS = 3_600_000;
const LIMIT = 30;

export async function consumeRegistrationLimit(request: Request): Promise<boolean> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `oauth:register:${ip}`, count: 1, lastRequest: windowStart })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`case when ${rateLimits.lastRequest} < ${windowStart} then 1 else ${rateLimits.count} + 1 end`, lastRequest: windowStart },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? 1) <= LIMIT;
}
