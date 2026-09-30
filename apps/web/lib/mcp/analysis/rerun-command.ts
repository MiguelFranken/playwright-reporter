/**
 * The exact Playwright command that re-runs a run's failed or flaky tests on
 * the same browser projects. We print it; we never run anything.
 *
 * How Playwright selects, which every selector here is built around:
 *
 * - Positional arguments are file filters: each is compiled as a regular
 *   expression (case-insensitive) and tested against the test file's absolute
 *   path; `file:line` additionally requires the test to start on that line.
 *   So a bare `coupon.spec.ts` also matches `incentive-coupon.spec.ts`, and the
 *   `.` matches any character. We anchor the path at a directory boundary and
 *   the end: `(^|/)tests/coupon\.spec\.ts$`.
 * - `--grep` is a case-insensitive regular expression tested against one
 *   string: the project name, the test file name (relative to the config's
 *   rootDir), the describe titles, the test title and the tags, joined by
 *   spaces, e.g. "chromium tests/cart.spec.ts cart adds an item @smoke". An
 *   unanchored title also matches every test whose title merely contains it,
 *   in any file. We anchor each test on its file name (preceded by a space, so
 *   only the whole name matches; any directory suffix of our path is accepted,
 *   so a testDir-relative name matches too) followed by its full title path,
 *   followed by either the end or a tag (" @…").
 *
 * Line numbers come from the reported run: in a checkout that has changed
 * since, they may point at another test or at none. Title selection does not
 * depend on them.
 */
export interface RerunTest {
  title: string;
  file: string;
  line: number;
  browser: string;
  /** The describe titles and the test title, outermost first. Defaults to [title]. */
  titlePath?: string[];
}

export type RerunStyle = 'locations' | 'titles' | 'grep';

export const MAX_LOCATIONS = 50;

export const DEFAULT_LAUNCHER = 'npx playwright test';

export function shellQuote(value: string) {
  return /^[\w./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function segments(t: RerunTest) {
  const path = (t.titlePath?.length ? t.titlePath : [t.title]).filter(Boolean);
  return path.length ? path : [t.title];
}

/** The file filter for a test file: anchored at a directory boundary and at the end of the path. */
export function fileFilter(file: string) {
  return `(^|/)${escapeRegex(file)}$`;
}

/**
 * The --grep pattern for one test. `[\\/]` accepts Windows separators in the
 * file name Playwright builds; `\s+` between titles tolerates an anonymous
 * describe that leaves an empty title in the joined string.
 */
export function titlePattern(t: RerunTest) {
  const parts = t.file.split('/').filter(Boolean);
  const suffixes = parts.map((_, i) => parts.slice(i).map(escapeRegex).join('[\\\\/]')).reverse();
  const names = suffixes.length > 1 ? `(?:${suffixes.join('|')})` : (suffixes[0] ?? '');
  return `\\s${names}\\s+${segments(t).map(escapeRegex).join('\\s+')}(?:\\s@|$)`;
}

const key = (t: RerunTest) => `${t.file}\0${t.line}\0${segments(t).join('\0')}`;

export interface RerunCommandOptions {
  style?: RerunStyle;
  repeat?: number;
  /** The command prefix to run Playwright with, e.g. "pnpm test:e2e --". Default "npx playwright test". */
  launcher?: string;
}

export function rerunCommands(tests: RerunTest[], opts: RerunCommandOptions = {}) {
  const byBrowser = new Map<string, RerunTest[]>();
  for (const t of tests) byBrowser.set(t.browser, [...(byBrowser.get(t.browser) ?? []), t]);
  const suffix = opts.repeat && opts.repeat > 1 ? ` --repeat-each=${opts.repeat} --retries=0` : '';
  const launcher = opts.launcher?.trim() || DEFAULT_LAUNCHER;
  return [...byBrowser.entries()].map(([browser, all]) => {
    const list = [...new Map(all.map((t) => [key(t), t])).values()];
    const byTitle = opts.style === 'grep' || opts.style === 'titles' || list.length > MAX_LOCATIONS || list.some((t) => !t.line);
    const style: RerunStyle = byTitle ? (opts.style === 'grep' ? 'grep' : 'titles') : 'locations';
    const files = [...new Set(list.map((t) => t.file))];
    const selector = byTitle
      ? `${files.map((f) => shellQuote(fileFilter(f))).join(' ')} --grep ${shellQuote([...new Set(list.map(titlePattern))].map((p) => `(?:${p})`).join('|'))}`
      : [...new Set(list.map((t) => `${fileFilter(t.file)}:${t.line}`))].map(shellQuote).join(' ');
    const base = `${launcher} ${selector} --project=${shellQuote(browser)}`;
    return {
      browser,
      tests: all.length,
      style,
      command: `${base}${suffix}`,
      /** The same selection with --list: run it first and compare with `expected` and the test identities. */
      listCommand: `${base} --list`,
      /** How many tests the selection should list (Playwright prints "Total: N tests in M files"). */
      expected: list.length,
    };
  });
}

/**
 * Selections that title or line matching may not tell apart. Playwright's
 * --grep ignores case, so titles are compared case-insensitively.
 */
export function selectionCollisions(tests: RerunTest[]) {
  const notes: string[] = [];
  const titleFiles = new Map<string, { title: string; files: Set<string> }>();
  const perFile = new Map<string, { browser: string; file: string; title: string; n: number }>();
  const perLine = new Map<string, Set<string>>();
  const seen = new Set<string>();
  for (const t of tests) {
    const title = segments(t).join(' › ');
    const id = `${t.browser}\0${t.file}\0${title}\0${t.line}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const lower = title.toLowerCase();
    const entry = titleFiles.get(lower) ?? { title, files: new Set<string>() };
    titleFiles.set(lower, entry);
    entry.files.add(t.file);
    const inFile = `${t.browser}\0${t.file}\0${lower}`;
    const same = perFile.get(inFile) ?? { browser: t.browser, file: t.file, title, n: 0 };
    perFile.set(inFile, same);
    same.n += 1;
    if (t.line) {
      const loc = `${t.browser}\0${t.file}:${t.line}`;
      perLine.set(loc, (perLine.get(loc) ?? new Set()).add(title));
    }
  }
  for (const { title, files } of titleFiles.values()) {
    if (files.size > 1) notes.push(`The title "${title}" exists in ${files.size} files (${[...files].join(', ')}); each title selector is scoped to its own file.`);
  }
  for (const { browser, file, title, n } of perFile.values()) {
    if (n > 1) {
      notes.push(`"${title}" appears ${n} times in ${file} (${browser}); titles cannot tell these apart, so use style "locations" or check the --list output.`);
    }
  }
  for (const [loc, titles] of perLine) {
    if (titles.size > 1) {
      const [browser, where] = loc.split('\0');
      notes.push(`${titles.size} selected tests start at ${where} (${browser}), e.g. a test generated in a loop; a location selects every test on that line.`);
    }
  }
  return notes;
}

/** Per-test selector hints: the location from the reported run, and the anchored file filter and --grep pattern. */
export function selectorHints(t: RerunTest) {
  return {
    location: t.line ? `${t.file}:${t.line}` : null,
    file: fileFilter(t.file),
    grep: titlePattern(t),
  };
}
