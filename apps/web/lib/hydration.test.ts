import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * The app's side of `packages/ui/src/lib/hydration.test.ts`: numbers and dates
 * go through `@miguelfranken/ui/lib/format`, which pins the locale and the time
 * zone, so what the server renders is what the browser hydrates.
 */
const UNPINNED = /\.toLocale(?:String|DateString|TimeString)\(\s*(?:\)|undefined\b)|new Intl\.\w+\(\s*(?:\)|undefined\b)/;

describe('hydration-safe formatting', () => {
  it('formats numbers and dates with a pinned locale and time zone', () => {
    const files = ['app', 'components', 'lib'].flatMap((dir) => sourceFiles(join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((file) => UNPINNED.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(ROOT.length))).toEqual([]);
  });
});
