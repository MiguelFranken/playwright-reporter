/**
 * A fixed one-minute window per credential, kept in the `rate_limits` table
 * Better Auth already uses (keys are namespaced `mcp:`), so it holds across
 * serverless instances without another store. One upsert per tool call.
 *
 * `last_request` holds the start of the current window here, in epoch ms.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { rateLimits } from '@/lib/db/schema';
import type { Grant } from '@/lib/auth/principal';
import { rateLimitPerMinute } from './config';

const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(grant: Pick<Grant, 'kind' | 'id'>, now = Date.now()): Promise<RateLimitResult> {
  const limit = rateLimitPerMinute();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: `mcp:${grant.kind}:${grant.id}`, count: 1, lastRequest: windowStart })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.lastRequest} < ${windowStart} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: windowStart,
      },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart + WINDOW_MS - now) / 1000)),
  };
}
