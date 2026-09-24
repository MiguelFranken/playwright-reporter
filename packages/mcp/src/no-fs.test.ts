/**
 * Security property: the bridge never reads or writes local files. Its only contact with the machine is one
 * `git remote get-url origin`; everything else is stdio in, HTTPS out. A model driving the bridge therefore can't use
 * it to exfiltrate files, and this test keeps it that way by failing on any filesystem import in shipped sources.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SRC = new URL('./', import.meta.url);
const FS_MODULE = /^(node:)?fs(\/promises)?$/;
/** Static imports and re-exports, dynamic `import()` and `require()`. */
const SPECIFIERS = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const shipped = readdirSync(SRC).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

describe('no local file access', () => {
  it('scans the shipped sources', () => {
    expect(shipped).toEqual(expect.arrayContaining(['bridge.ts', 'cli.ts', 'config.ts', 'index.ts']));
  });

  it.each(shipped)('%s imports no filesystem module', (file) => {
    const source = readFileSync(new URL(file, SRC), 'utf8');
    const specifiers = [...source.matchAll(SPECIFIERS)].map((match) => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => FS_MODULE.test(specifier!))).toEqual([]);
  });

  it('detects the forms it guards against', () => {
    const offenders = ["import fs from 'fs'", 'import { readFile } from "node:fs/promises"', "await import('node:fs')", "require('fs')"];
    for (const line of offenders) expect([...line.matchAll(SPECIFIERS)].map((m) => m[1]).some((s) => FS_MODULE.test(s!))).toBe(true);
  });
});
