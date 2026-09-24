/**
 * How a tool is declared and run. `defineTool` is the only way tools come into
 * existence; `registerTool` is the only place that hands one to the SDK. In
 * between sits the call pipeline every tool shares: rate limit, handler,
 * budgeted rendering, error mapping and one log line.
 *
 * What SDK v2 does around our callback (verified against 2.1): it validates
 * input before calling us and turns failures into `isError` results; it
 * validates `structuredContent` against `outputSchema` on success results only
 * (never on `isError`), so error results may carry their own structure.
 */
import type { CallToolResult, ImageContent, McpServer, ResourceLink, ServerContext, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Toolset } from './config';
import type { ToolContext } from './context';
import { ToolError } from './errors';
import { consumeRateLimit } from './rate-limit';
import { MarkdownBuilder } from './render/markdown';
import { trimStructured } from './render/structured';

export interface ToolResult<T> {
  /** Becomes `structuredContent` (trimmed to the budget if needed). */
  data: T;
  /** Writes the markdown answer; called with the (untrimmed) data. */
  render(md: MarkdownBuilder, data: T): void;
  /** Inline images, e.g. a failure screenshot. */
  images?: ImageContent[];
  /** Links to MCP resources, e.g. artifacts. */
  resourceLinks?: ResourceLink[];
}

export interface ToolDef<I extends z.ZodObject = z.ZodObject, O extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  toolset: Toolset;
  /** First sentence: when to call it. Kept under ~600 characters. */
  description: string;
  /** Defined at module scope so the SDK's schema conversion can be memoised per instance. */
  input: I;
  output: O;
  annotations?: Partial<ToolAnnotations>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<ToolResult<z.infer<O>>>;
}

export const DEFAULT_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  // Closed world: the answers come from this instance's database, not the web.
  openWorldHint: false,
};

export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(def: ToolDef<I, O>): ToolDef<I, O> {
  return def;
}

/** Every output schema carries the truncation flag the pipeline may set. */
export function output<S extends z.ZodRawShape>(shape: S) {
  return z.object({ ...shape, truncated: z.boolean().optional().describe('Set when the answer was trimmed to the character budget.') });
}

export function registerTool(server: McpServer, def: ToolDef, ctx: ToolContext) {
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input,
      outputSchema: def.output,
      annotations: { ...DEFAULT_ANNOTATIONS, ...def.annotations, title: def.title },
    },
    // The SDK's callback typing is generic over the schema; ours is already
    // parsed against the same schema, so the cast only erases that generic.
    ((args: unknown, sdkCtx: ServerContext) => runTool(def, args as Record<string, unknown>, { ...ctx, signal: sdkCtx.mcpReq.signal })) as never,
  );
}

export async function runTool(def: ToolDef, args: Record<string, unknown>, ctx: ToolContext): Promise<CallToolResult> {
  const started = Date.now();
  const budget = typeof args.maxChars === 'number' ? args.maxChars : ctx.budget;
  const format = args.format === 'json' ? 'json' : 'markdown';
  let outcome = 'ok';
  let chars = 0;
  let truncated = false;
  try {
    if (ctx.principal.grant) {
      const limit = await consumeRateLimit(ctx.principal.grant);
      if (!limit.allowed) {
        throw new ToolError(
          'RATE_LIMITED',
          `Too many tool calls: ${limit.limit} per minute per token.`,
          `Wait ${limit.retryAfterSeconds} seconds before the next call.`,
          { retryAfterSeconds: limit.retryAfterSeconds },
        );
      }
    }
    const result = await def.handler(args as never, ctx);
    const md = new MarkdownBuilder(budget);
    result.render(md, result.data);
    const structured = trimStructured(
      { ...(result.data as Record<string, unknown>), ...(md.truncated ? { truncated: true } : {}) },
      Math.max(budget * 2, 4_000),
    );
    truncated = md.truncated || structured.truncated === true;
    const text = format === 'json' ? JSON.stringify(structured) : md.toString();
    chars = text.length;
    return {
      content: [{ type: 'text', text }, ...(result.images ?? []), ...(result.resourceLinks ?? [])],
      structuredContent: structured,
    };
  } catch (error) {
    const toolError = error instanceof ToolError ? error : internal(error, ctx.requestId, def.name);
    outcome = `error:${toolError.code}`;
    const result = errorResult(toolError);
    chars = (result.content[0] as { text: string }).text.length;
    return result;
  } finally {
    logToolCall({ tool: def.name, ctx, ms: Date.now() - started, chars, truncated, outcome, args });
  }
}

function internal(error: unknown, requestId: string, tool: string): ToolError {
  console.error(`[mcp] ${tool} failed (request ${requestId})`, error);
  return new ToolError('INTERNAL', `Something went wrong on the server (request id ${requestId}).`, 'Try again; if it keeps failing, give the request id to an administrator.');
}

export function errorResult(error: ToolError): CallToolResult {
  const lines = [`Error ${error.code}: ${error.message}`];
  if (error.hint) lines.push(`Next: ${error.hint}`);
  const candidates = (error.details as { candidates?: { id: string; title: string; file: string; browser: string; outcomeInRun?: string | null }[] } | undefined)
    ?.candidates;
  if (candidates?.length) {
    lines.push('', '| id | test | file | browser |', '|---|---|---|---|');
    for (const c of candidates) lines.push(`| ${c.id} | ${c.title.replace(/\|/g, '\\|')} | ${c.file} | ${c.browser} |`);
  }
  return {
    isError: true,
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: { error: { code: error.code, message: error.message, hint: error.hint ?? null, details: error.details ?? null } },
  };
}

/**
 * One line per call on stdout, for the usage and reliability numbers the
 * product plan tracks. Argument *values* are never logged — test titles and
 * searches can be sensitive — only which arguments were present.
 */
function logToolCall(entry: { tool: string; ctx: ToolContext; ms: number; chars: number; truncated: boolean; outcome: string; args: Record<string, unknown> }) {
  if (process.env.VITEST) return;
  const grant = entry.ctx.principal.grant;
  console.log(
    JSON.stringify({
      evt: 'mcp.tool',
      tool: entry.tool,
      user: entry.ctx.principal.user.id,
      grant: grant ? `${grant.kind}:${grant.id}` : 'session',
      era: entry.ctx.era,
      args: Object.keys(entry.args).filter((k) => entry.args[k] !== undefined),
      ms: entry.ms,
      chars: entry.chars,
      truncated: entry.truncated,
      outcome: entry.outcome,
      rid: entry.ctx.requestId,
    }),
  );
}
