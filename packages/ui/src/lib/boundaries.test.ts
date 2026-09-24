import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * The design system must stay host-agnostic: no Next.js, no ORM, no auth, no
 * reach back into the app through its `@/` alias. Cheap to run, and it fails
 * the moment someone re-introduces the coupling this package exists to remove.
 */
const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'next/*', pattern: /from\s+['"]next(\/|['"])/ },
  { label: 'drizzle-orm', pattern: /from\s+['"]drizzle-orm/ },
  { label: 'better-auth', pattern: /from\s+['"]better-auth/ },
  { label: "the app's @/ alias", pattern: /from\s+['"]@\// },
  { label: 'postgres', pattern: /from\s+['"]postgres['"]/ },
];

describe('packages/ui boundaries', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('never imports $label', ({ pattern }) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length))).toEqual([]);
  });

  it('only imports @miguelfranken/protocol as types', () => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /(?<!import type )(?:^|\n)import\s+(?!type\b)[^;]*from\s+['"]@miguelfranken\/protocol/.test(source);
    });
    expect(offenders.map((f) => f.slice(SRC.length))).toEqual([]);
  });
});
