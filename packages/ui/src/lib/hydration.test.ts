import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Views render on the server and hydrate in the browser, where the locale and
 * the time zone are the visitor's. A number or date formatted with the
 * machine's defaults ("1,234" on the server, "1.234" in a German browser)
 * fails hydration. `lib/format.ts` pins them; this keeps it that way.
 */
const UNPINNED = /\.toLocale(?:String|DateString|TimeString)\(\s*(?:\)|undefined\b)|new Intl\.\w+\(\s*(?:\)|undefined\b)/;

describe('hydration-safe formatting', () => {
  it('formats numbers and dates with a pinned locale and time zone', () => {
    const offenders = sourceFiles(SRC).filter((file) => UNPINNED.test(readFileSync(file, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length))).toEqual([]);
  });

  it('recognises an unpinned call', () => {
    expect(UNPINNED.test('n.toLocaleString()')).toBe(true);
    expect(UNPINNED.test("d.toLocaleString(undefined, { dateStyle: 'medium' })")).toBe(true);
    expect(UNPINNED.test('new Intl.NumberFormat()')).toBe(true);
    expect(UNPINNED.test("n.toLocaleString('en-US')")).toBe(false);
  });
});
