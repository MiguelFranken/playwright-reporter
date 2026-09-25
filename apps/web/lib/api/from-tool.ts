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
import { fromToolError } from './errors';

export const teamParam = z.string().describe('Team slug, as in the app URL (`/teams/<team>/…`).');
export const projectSlugParam = z.string().describe('Project slug, as in the app URL (`…/projects/<project>`).');

/** MCP-only arguments no REST endpoint takes. */
const MCP_ONLY = ['project', 'format', 'maxChars'];

export interface ToolRoute {
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
}

function without(schema: z.ZodObject, keys: string[]): z.ZodObject {
  const present = keys.filter((k) => k in schema.shape);
  return present.length ? schema.omit(Object.fromEntries(present.map((k) => [k, true])) as Record<string, true> as never) : schema;
}

export function toolInput(tool: ToolDef, route: ToolRoute): z.ZodObject {
  const scoped = route.projectScoped ?? true;
  return without(tool.input, [...MCP_ONLY, ...Object.values(route.rename ?? {}), ...(route.omit ?? [])]).extend({
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
  return authed
    .meta(
      openapi({
        method: 'GET',
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
      const { team, project, ...rest } = input as Record<string, unknown> & { team?: string; project?: string };
      for (const [from, to] of Object.entries(route.rename ?? {})) {
        rest[to] = rest[from];
        delete rest[from];
      }
      const args = scoped ? { ...rest, project: `${team}/${project}` } : rest;
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
