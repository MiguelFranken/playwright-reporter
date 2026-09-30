/**
 * Exposes an MCP tool as a REST endpoint. The tool's handler holds the logic
 * (access checks included, through `ctx.project()`); the endpoint only moves
 * its parameters into the URL and returns its structured result.
 *
 * - The tool's `project` argument becomes the `{team}/{project}` path segments.
 * - `format` and `maxChars` are MCP rendering knobs and are dropped.
 * - Other path segments (`{run}`, `{test}`, …) replace the tool arguments of the
 *   same name; everything else stays a query parameter with the tool's own
 *   schema and description.
 * - A `ToolError` becomes a problem-details response with the same `code`.
 * - A read tool is a `GET` with its arguments in the query string. A write tool
 *   (the MCP `write` toolset) takes another method, its arguments in a JSON
 *   body, and a token with the `write` scope; the tool still checks the role.
 *
 * So REST and MCP can never disagree about what a run, a verdict or a page of
 * results is.
 */
import { openapi } from '@orpc/openapi';
import { z } from 'zod';
import { TOOLSETS } from '@/lib/mcp/config';
import { ToolError } from '@/lib/mcp/errors';
import type { ToolDef } from '@/lib/mcp/registry';
import { authed } from './base';
import { apiError, fromToolError } from './errors';

export const teamParam = z.string().describe('Team slug, as in the app URL (`/teams/<team>/…`).');
export const projectSlugParam = z.string().describe('Project slug, as in the app URL (`…/projects/<project>`).');

/** MCP-only arguments no REST endpoint takes. */
const MCP_ONLY = ['project', 'format', 'maxChars'];

export interface ToolRoute {
  /** `GET` for read tools (the default); a write tool needs `POST`, `PATCH`, `PUT` or `DELETE`. */
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** The status of a successful answer, e.g. 201 for a create. Default 200. */
  successStatus?: number;
  path: `/${string}`;
  summary: string;
  /** Defaults to the tool's description. */
  description?: string;
  tags: string[];
  /** Path segments besides team and project, with the schema they take in the URL. */
  params?: Record<string, z.ZodType>;
  /** Path segments that feed a differently named tool argument, e.g. `{ run: 'head' }`. */
  rename?: Record<string, string>;
  /** Tool arguments this endpoint does not offer. */
  omit?: string[];
  /** Output fields this endpoint does not return. */
  omitOutput?: string[];
  /** Tools like `whoami` are not about one project. Default true. */
  projectScoped?: boolean;
  /**
   * Arguments the endpoint always passes, and does not offer: e.g. no inline
   * images, which a JSON answer never carries, so none are read and encoded.
   */
  fixedArgs?: Record<string, unknown>;
}

function without(schema: z.ZodObject, keys: string[]): z.ZodObject {
  const present = keys.filter((k) => k in schema.shape);
  return present.length ? schema.omit(Object.fromEntries(present.map((k) => [k, true])) as Record<string, true> as never) : schema;
}

export function toolInput(tool: ToolDef, route: ToolRoute): z.ZodObject {
  const scoped = route.projectScoped ?? true;
  return without(tool.input, [...MCP_ONLY, ...Object.values(route.rename ?? {}), ...(route.omit ?? []), ...Object.keys(route.fixedArgs ?? {})]).extend({
    ...(scoped ? { team: teamParam, project: projectSlugParam } : {}),
    ...route.params,
  });
}

export function toolOutput(tool: ToolDef, route: ToolRoute): z.ZodObject {
  // `truncated` belongs to MCP's character budget; REST answers are never trimmed.
  return without(tool.output, ['truncated', ...(route.omitOutput ?? [])]);
}

export function fromTool(tool: ToolDef, route: ToolRoute) {
  const scoped = route.projectScoped ?? true;
  const method = route.method ?? 'GET';
  const writes = tool.toolset === 'write';
  if (writes === (method === 'GET')) {
    throw new Error(`${tool.name}: ${writes ? 'a write tool needs a method other than GET' : 'a read tool is a GET'}.`);
  }
  return authed
    .meta(
      openapi({
        method,
        ...(route.successStatus ? { successStatus: route.successStatus } : {}),
        path: route.path,
        operationId: tool.name.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
        summary: route.summary,
        description: route.description ?? tool.description,
        tags: route.tags,
      }),
    )
    .input(toolInput(tool, route))
    .output(toolOutput(tool, route))
    .handler(async ({ input, context, signal }) => {
      if (writes && !context.caller.principal.grant?.scopes.includes('write')) {
        throw apiError('INSUFFICIENT_SCOPE', 'This token lacks the "write" scope.', 'Create a token with write access under Account → Access tokens.');
      }
      const { team, project, ...rest } = input as Record<string, unknown> & { team?: string; project?: string };
      for (const [from, to] of Object.entries(route.rename ?? {})) {
        rest[to] = rest[from];
        delete rest[from];
      }
      const args = { ...(scoped ? { ...rest, project: `${team}/${project}` } : rest), ...route.fixedArgs };
      // Loaded per call: the access layer is server-only, and the spec generator
      // (`scripts/gen-openapi.ts`) imports this router outside Next.js.
      const { createToolContext } = await import('@/lib/mcp/context');
      const ctx = createToolContext({
        principal: context.caller.principal,
        credential: context.caller.credential,
        connection: { defaultProject: null, toolsets: [...TOOLSETS], repo: null },
        era: 'modern',
        signal,
      });
      try {
        const result = await tool.handler(args as never, ctx);
        return result.data as Record<string, unknown>;
      } catch (error) {
        if (error instanceof ToolError) throw fromToolError(error);
        throw error;
      }
    });
}
