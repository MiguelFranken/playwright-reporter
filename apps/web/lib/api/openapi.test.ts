import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openApiDocument } from './openapi';

describe('docs/openapi.json', () => {
  it('matches the router (regenerate with `nub run api:docs` in apps/web)', async () => {
    const committed = readFileSync(path.resolve(import.meta.dirname, '../../../../docs/openapi.json'), 'utf8');
    expect(committed).toBe(`${JSON.stringify(await openApiDocument(), null, 2)}\n`);
  });

  it('documents every endpoint as a bearer-authenticated GET with problem-details errors', async () => {
    const doc = await openApiDocument();
    expect(doc.openapi).toBe('3.1.1');
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
    const operations = Object.values(doc.paths ?? {}).flatMap((item) => Object.entries(item ?? {}));
    expect(operations.length).toBeGreaterThan(10);
    for (const [method, operation] of operations) {
      expect(method).toBe('get');
      const op = operation as { operationId?: string; summary?: string; responses: Record<string, { content?: Record<string, unknown> }> };
      expect(op.operationId).toBeTruthy();
      expect(op.summary).toBeTruthy();
      expect(op.responses['404'].content).toHaveProperty('application/problem+json');
    }
  });

  it('has no reference that points nowhere', async () => {
    const doc = await openApiDocument();
    const text = JSON.stringify(doc);
    const refs = [...new Set([...text.matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]))];
    for (const ref of refs) {
      const target = ref.replace(/^#\//, '').split('/').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], doc);
      expect(target, ref).toBeDefined();
    }
  });

  it('exposes no MCP-only arguments', async () => {
    const doc = await openApiDocument();
    const names = Object.values(doc.paths ?? {}).flatMap((item) =>
      Object.values(item ?? {}).flatMap((op) => ((op as { parameters?: { name: string }[] }).parameters ?? []).map((p) => p.name)),
    );
    expect(names).not.toContain('format');
    expect(names).not.toContain('maxChars');
  });
});
