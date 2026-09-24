/**
 * Guards around SDK v2 behaviour the design depends on (see the technical
 * plan, "Known SDK v2 issues"): a fresh server per request, list-changed off,
 * and tool schemas that survive the zod → JSON Schema conversion.
 */
import type { AuthInfo } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Principal } from '@/lib/auth/principal';
import { buildServer, isToolEnabled } from './server';
import { TOOLS } from './tools';

const principal: Principal = {
  user: { id: 'u', email: 'u@example.test', name: 'U', image: null, isSuperadmin: false },
  grant: { kind: 'pat', id: 't', scopes: ['read'], teamIds: null, projectId: null, allTeams: false },
};
const authInfo: AuthInfo = { token: 'x', clientId: 'pat:t', scopes: ['read'], expiresAt: 9_999_999_999, extra: { principal } };

describe('buildServer', () => {
  it('returns a new instance for every request', () => {
    const a = buildServer({ era: 'legacy', authInfo });
    const b = buildServer({ era: 'legacy', authInfo });
    expect(a).not.toBe(b);
  });

  it('refuses to build without a principal', () => {
    expect(() => buildServer({ era: 'legacy' })).toThrow(/principal/);
  });
});

describe('tool definitions', () => {
  it('have unique snake_case names, a title and a description under 600 characters', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThanOrEqual(600);
    }
  });

  it('convert to JSON Schema without losing their properties', () => {
    for (const tool of TOOLS) {
      const input = z.toJSONSchema(tool.input, { io: 'input' }) as { properties?: Record<string, unknown> };
      const output = z.toJSONSchema(tool.output, { io: 'output' }) as { properties?: Record<string, unknown> };
      if (tool.name !== 'whoami') expect(Object.keys(input.properties ?? {}).length, `${tool.name} input`).toBeGreaterThan(0);
      expect(Object.keys(output.properties ?? {}).length, `${tool.name} output`).toBeGreaterThan(0);
      expect(JSON.stringify(input), `${tool.name} uses z.date()`).not.toContain('date-time');
    }
  });

  it('are listed per toolset, and write tools only for write tokens', () => {
    const ctx = { principal, connection: { defaultProject: null, repo: null, toolsets: ['core' as const] } };
    const enabled = TOOLS.filter((t) => isToolEnabled(t, ctx)).map((t) => t.toolset);
    expect(new Set(enabled)).toEqual(new Set(['core']));
    expect(isToolEnabled({ ...TOOLS[0], toolset: 'write' }, ctx)).toBe(false);
  });
});
