import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ToolDef } from '@/lib/mcp/registry';

const scopes: string[] = [];

vi.mock('./auth', () => ({
  authenticate: async () => ({ principal: { grant: { scopes } }, credential: { name: null, prefix: null, expiresAt: null } }),
}));
vi.mock('@/lib/mcp/rate-limit', () => ({ consumeRateLimit: async () => ({ allowed: true, limit: 100, count: 1, retryAfterSeconds: 60 }) }));
vi.mock('@/lib/mcp/context', () => ({ createToolContext: (options: unknown) => options }));

const { fromTool } = await import('./from-tool');

const handler = vi.fn(async (args: Record<string, unknown>) => ({ data: { got: args }, render() {} }));

function writeTool(): ToolDef {
  return {
    name: 'create_thing',
    title: 'Create a thing',
    toolset: 'write',
    description: 'Creates a thing.',
    input: z.object({ project: z.string().optional(), name: z.string() }),
    output: z.object({ got: z.record(z.string(), z.unknown()) }),
    handler: handler as never,
  };
}

const context = { headers: new Headers() };

describe('fromTool for a write tool', () => {
  beforeEach(() => {
    scopes.length = 0;
    handler.mockClear();
  });

  it('refuses a token without the write scope, before the tool runs', async () => {
    scopes.push('read');
    const procedure = fromTool(writeTool(), { method: 'POST', path: '/projects/{team}/{project}/things', summary: 'Create', tags: [] });
    await expect(call(procedure, { team: 'acme', project: 'web', name: 'x' }, { context })).rejects.toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the tool with the project from the path for a write-scoped token', async () => {
    scopes.push('read', 'write');
    const procedure = fromTool(writeTool(), { method: 'POST', path: '/projects/{team}/{project}/things', summary: 'Create', tags: [] });
    await expect(call(procedure, { team: 'acme', project: 'web', name: 'x' }, { context })).resolves.toEqual({ got: { name: 'x', project: 'acme/web' } });
  });

  it('must not be a GET, and a read tool must be one', () => {
    expect(() => fromTool(writeTool(), { path: '/things', summary: 'Create', tags: [] })).toThrow(/write tool/);
    expect(() => fromTool({ ...writeTool(), toolset: 'core' }, { method: 'POST', path: '/things', summary: 'Create', tags: [] })).toThrow(/read tool/);
  });
});
