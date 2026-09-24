/**
 * Environment configuration of the MCP server. Parsed on every call (cheap)
 * so tests can flip a variable without re-importing modules.
 */
import { baseUrl, trustedOrigins } from '@/lib/auth/config';

export const TOOLSETS = ['core', 'debug'] as const;
export type Toolset = (typeof TOOLSETS)[number] | 'write';

function positive(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function mcpEnabledByEnv() {
  return (process.env.MCP_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function defaultToolsets(): Toolset[] {
  const raw = process.env.MCP_DEFAULT_TOOLSETS;
  if (!raw) return [...TOOLSETS];
  const parsed = parseToolsets(raw);
  return parsed.length ? parsed : [...TOOLSETS];
}

export function parseToolsets(raw: string): Toolset[] {
  const known = new Set<string>(TOOLSETS);
  return [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()))].filter((s): s is Toolset => known.has(s));
}

export const responseBudgetChars = () => positive('MCP_RESPONSE_BUDGET_CHARS', 20_000);
export const rateLimitPerMinute = () => positive('MCP_RATE_LIMIT_PER_MINUTE', 120);
export const artifactUrlTtlSeconds = () => positive('MCP_ARTIFACT_URL_TTL_SECONDS', 900);
export const inlineImageMaxBytes = () => positive('MCP_INLINE_IMAGE_MAX_BYTES', 1024 * 1024);

/**
 * Host header values the DNS-rebinding guard accepts: the public origin, the
 * trusted origins (Vercel aliases included) and any extra `MCP_ALLOWED_HOSTS`.
 * Hostnames only — the SDK's check is port-agnostic.
 */
export function allowedHosts(): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1', '[::1]']);
  for (const origin of [baseUrl(), ...trustedOrigins()]) {
    try {
      hosts.add(new URL(origin).hostname);
    } catch {
      // A malformed entry in TRUSTED_ORIGINS is ignored here, as Better Auth ignores it.
    }
  }
  for (const extra of (process.env.MCP_ALLOWED_HOSTS ?? '').split(',')) {
    const host = extra.trim().replace(/:\d+$/, '');
    if (host) hosts.add(host);
  }
  return [...hosts];
}
