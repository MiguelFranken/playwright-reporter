/**
 * The OpenAPI 3.1 document of the REST API, generated from the router. The
 * same function serves `/api/v1/openapi.json` (with this instance's URL) and
 * writes `docs/openapi.json` (with a server variable, since every self-hosted
 * instance has its own), which the docs site renders.
 *
 * oRPC documents what the procedures declare; this adds what every endpoint
 * shares: bearer authentication and the problem-details error responses.
 */
import { OpenAPIGenerator, type OpenAPIDocument } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { z } from 'zod';
import { problemSchema } from './errors';
import { router } from './v1/router';

export const API_VERSION = '1.0.0';

const converters = [new ZodToJsonSchemaConverter()];
const generator = new OpenAPIGenerator({ converters });

type Server = { url: string; description?: string; variables?: Record<string, { default: string; description?: string }> };

const INSTANCE_SERVER: Server = {
  url: '{origin}/api/v1',
  description: 'Your instance. Every self-hosted deployment serves the API under its own origin.',
  variables: { origin: { default: 'https://reporter.example.com', description: 'The origin of your Playwright Reporter instance.' } },
};

const DESCRIPTION = `Read the test history your Playwright suites report: runs, results, retries, errors, attachments, flakiness and trends.

Authenticate with a personal access token from **Account → Access tokens**, sent as \`Authorization: Bearer pwr_pat_…\`. A token sees exactly what its owner sees in the app, narrowed to the teams or project it was restricted to.

Errors are [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details with a stable \`code\`. Lists page with \`limit\` and the opaque \`nextCursor\`. Each token may make a limited number of requests per minute (shared with the MCP server); the \`RateLimit-*\` headers say how many remain.`;

const ERRORS: Record<string, string> = {
  '400': 'Invalid parameters (`BAD_REQUEST`, `INVALID_ARGUMENT`).',
  '401': 'Missing, invalid, expired or revoked token (`UNAUTHORIZED`).',
  '403': 'The token lacks the required scope (`INSUFFICIENT_SCOPE`).',
  '404': 'Not found, or not visible to this token (`NOT_FOUND`). The two are never told apart.',
  '409': 'A test reference matches several tests (`AMBIGUOUS`; candidates in `details`), or an attachment is not available (`ARTIFACT_UNAVAILABLE`).',
  '429': 'Rate limit exceeded (`RATE_LIMITED`); see `Retry-After`.',
};

const problemRef = { $ref: '#/components/schemas/Problem' };

export async function openApiDocument(servers: Server[] = [INSTANCE_SERVER]): Promise<OpenAPIDocument<'3.1.1'>> {
  const doc = await generator.generate(router, {
    version: '3.1.1',
    base: {
      info: { title: 'Playwright Reporter API', version: API_VERSION, description: DESCRIPTION, license: { name: 'MIT', identifier: 'MIT' } },
      servers,
      tags: [
        { name: 'Account', description: 'The token and what it can read.' },
        { name: 'Projects', description: 'Filters and health of a project.' },
        { name: 'Runs', description: 'Test runs and their results.' },
        { name: 'Results', description: 'One test in one run, and its attachments.' },
        { name: 'Tests', description: 'Tests across runs.' },
        { name: 'Diagnostics', description: 'Verdicts computed from stored attempts: failure groups, flakiness, run diffs, fix verification.' },
      ],
    },
  });
  const schemas = (doc.components ??= {}).schemas ?? {};
  const problem = z.toJSONSchema(problemSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete problem.$schema;
  delete problem.id;
  doc.components.schemas = { ...schemas, Problem: problem as never };
  doc.components.securitySchemes = {
    bearerAuth: { type: 'http', scheme: 'bearer', description: 'A personal access token (`pwr_pat_…`) from Account → Access tokens, with the `read` scope.' },
  };
  doc.security = [{ bearerAuth: [] }];
  for (const item of Object.values(doc.paths ?? {})) {
    for (const operation of Object.values(item ?? {})) {
      if (!operation || typeof operation !== 'object' || !('responses' in operation)) continue;
      const responses = (operation.responses ??= {}) as Record<string, unknown>;
      for (const [status, description] of Object.entries(ERRORS)) {
        responses[status] ??= { description, content: { 'application/problem+json': { schema: problemRef } } };
      }
    }
  }
  return doc;
}

/** This instance's own document, as `/api/v1/openapi.json` serves it. */
export function instanceServers(origin: string): Server[] {
  return [{ url: `${origin}/api/v1`, description: 'This instance.' }];
}
