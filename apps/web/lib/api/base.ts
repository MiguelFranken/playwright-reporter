/**
 * The builder every public REST procedure starts from: bearer authentication,
 * then the per-token rate limit. Handlers receive the caller in `context`.
 *
 * The rate limit is the MCP server's: one fixed-window budget per token in the
 * `rate_limits` table, so it holds across serverless instances, and a token
 * used by both an assistant and a script shares one budget.
 */
import { os } from '@orpc/server';
import type { ResponseHeadersHandlerPluginContext } from '@orpc/server/plugins';
import { consumeRateLimit } from '@/lib/mcp/rate-limit';
import { authenticate, type ApiCaller } from './auth';
import { apiError } from './errors';

export interface ApiInitialContext extends ResponseHeadersHandlerPluginContext {
  /** The incoming request's headers. */
  headers: Headers;
}

export interface ApiContext extends ApiInitialContext {
  caller: ApiCaller;
}

export const base = os.$context<ApiInitialContext>();

export const authed = base
  .use(async ({ context, next }) => next({ context: { caller: await authenticate(context.headers) } }))
  .use(async ({ context, next }) => {
    const grant = context.caller.principal.grant!;
    const limit = await consumeRateLimit(grant);
    const headers = context.resHeaders;
    headers?.set('ratelimit-limit', String(limit.limit));
    headers?.set('ratelimit-remaining', String(Math.max(0, limit.limit - limit.count)));
    headers?.set('ratelimit-reset', String(limit.retryAfterSeconds));
    if (!limit.allowed) {
      headers?.set('retry-after', String(limit.retryAfterSeconds));
      throw apiError('RATE_LIMITED', `Too many requests: ${limit.limit} per minute per token.`, `Wait ${limit.retryAfterSeconds} seconds.`, {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    return next();
  });
