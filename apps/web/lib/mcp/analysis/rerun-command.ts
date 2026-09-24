/**
 * The exact Playwright command that re-runs a run's failed or flaky tests on
 * the same browser projects. We print it; we never run anything.
 */
export interface RerunTest {
  title: string;
  file: string;
  line: number;
  browser: string;
}

export const MAX_LOCATIONS = 50;

function shellQuote(value: string) {
  return /^[\w./:@-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rerunCommands(tests: RerunTest[], opts: { style?: 'locations' | 'grep'; repeat?: number } = {}) {
  const byBrowser = new Map<string, RerunTest[]>();
  for (const t of tests) byBrowser.set(t.browser, [...(byBrowser.get(t.browser) ?? []), t]);
  const suffix = opts.repeat && opts.repeat > 1 ? ` --repeat-each=${opts.repeat} --retries=0` : '';
  return [...byBrowser.entries()].map(([browser, list]) => {
    const useGrep = opts.style === 'grep' || list.length > MAX_LOCATIONS || list.some((t) => !t.line);
    const selector = useGrep
      ? `--grep ${shellQuote([...new Set(list.map((t) => escapeRegex(t.title)))].join('|'))}`
      : [...new Set(list.map((t) => `${t.file}:${t.line}`))].map(shellQuote).join(' ');
    return {
      browser,
      tests: list.length,
      style: useGrep ? ('grep' as const) : ('locations' as const),
      command: `npx playwright test ${selector} --project=${shellQuote(browser)}${suffix}`,
    };
  });
}
