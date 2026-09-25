/**
 * Errors of the public REST API, answered as RFC 9457 problem details:
 *
 *   { "type": "about:blank", "title": "Not Found", "status": 404,
 *     "code": "NOT_FOUND", "detail": "Run #12 not found.", "hint": "…" }
 *
 * The codes are the MCP server's (`lib/mcp/errors.ts`) plus the ones oRPC
 * raises itself (`BAD_REQUEST` for input validation, `INTERNAL_SERVER_ERROR`),
 * so a client can branch on `code` whether it came through REST or MCP. The
 * HTTP status says the same thing in coarser terms.
 */
import { COMMON_ERROR_STATUS_MAP } from '@orpc/client';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { ToolError, type ToolErrorCode } from '@/lib/mcp/errors';

export const ERROR_STATUS: Record<string, number> = {
  ...COMMON_ERROR_STATUS_MAP,
  INVALID_ARGUMENT: 400,
  PROJECT_REQUIRED: 400,
  UNAUTHORIZED: 401,
  INSUFFICIENT_SCOPE: 403,
  NOT_FOUND: 404,
  AMBIGUOUS: 409,
  ARTIFACT_UNAVAILABLE: 409,
  ARTIFACT_EXPIRED: 410,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} satisfies Partial<Record<ToolErrorCode, number>> & Record<string, number>;

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Content Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  503: 'Service Unavailable',
};

export const statusOf = (code: string) => ERROR_STATUS[code] ?? 500;

export type ProblemData = { hint?: string | null; details?: unknown; retryAfterSeconds?: number };

/** The problem-details body for an oRPC error. */
export function problemBody(error: ORPCError<string, unknown>) {
  const status = statusOf(error.code);
  const data = (error.data ?? {}) as ProblemData & { issues?: unknown };
  // oRPC puts zod issues on `data.issues` for input validation failures.
  const details = data.details ?? data.issues ?? null;
  return {
    type: 'about:blank',
    title: TITLES[status] ?? 'Error',
    status,
    code: error.code,
    detail: error.message,
    hint: data.hint ?? null,
    ...(details ? { details } : {}),
  };
}

export const problemSchema = z
  .object({
    type: z.string().describe('Always "about:blank"; branch on `code` instead.'),
    title: z.string().describe('The HTTP status phrase.'),
    status: z.number().int().describe('The HTTP status code, repeated.'),
    code: z
      .string()
      .describe(
        'Stable machine-readable code: BAD_REQUEST, INVALID_ARGUMENT, PROJECT_REQUIRED, UNAUTHORIZED, INSUFFICIENT_SCOPE, NOT_FOUND, AMBIGUOUS, ARTIFACT_UNAVAILABLE, ARTIFACT_EXPIRED, RATE_LIMITED, INTERNAL_SERVER_ERROR.',
      ),
    detail: z.string().describe('What went wrong, for a person.'),
    hint: z.string().nullable().describe('What to do about it, when there is something to do.'),
    details: z.unknown().optional().describe('Structured context: validation issues, or the candidates of an ambiguous test reference.'),
  })
  .meta({ id: 'Problem' });

/** A tool's error, as the REST API reports it. */
export function fromToolError(error: ToolError): ORPCError<string, ProblemData> {
  return new ORPCError(error.code, {
    message: error.message,
    data: { hint: error.hint ?? null, details: error.details ?? undefined },
    cause: error,
  });
}

export function apiError(code: keyof typeof ERROR_STATUS, message: string, hint?: string, extra: Omit<ProblemData, 'hint'> = {}) {
  return new ORPCError(code, { message, data: { hint: hint ?? null, ...extra } });
}

/**
 * Problem responses are JSON with their own media type. oRPC writes
 * `application/json`; the route handler swaps the header on error responses.
 */
export function asProblemResponse(response: Response): Response {
  if (response.status < 400 || !response.headers.get('content-type')?.startsWith('application/json')) return response;
  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/problem+json');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
