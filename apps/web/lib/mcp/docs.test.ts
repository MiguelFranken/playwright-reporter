import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToolsDoc } from './docs';

describe('docs/mcp-tools.md', () => {
  it('matches the registry (regenerate with `nub run mcp:docs` in apps/web)', () => {
    const committed = readFileSync(path.resolve(import.meta.dirname, '../../../../docs/mcp-tools.md'), 'utf8');
    expect(committed).toBe(renderToolsDoc());
  });
});
