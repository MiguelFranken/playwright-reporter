import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { fileFilter, MAX_LOCATIONS, rerunCommands, selectionCollisions, titlePattern, type RerunTest } from './rerun-command';

/** The arguments a POSIX shell passes to the launcher, so quoting is checked by a real shell. */
function argv(command: string) {
  return execFileSync('sh', ['-c', `printf '%s\\0' ${command}`], { encoding: 'utf8' }).split('\0').slice(0, -1);
}

/** What Playwright does with the arguments: file filters are case-insensitive regexes over the absolute path. */
function selects(command: string, candidates: { abs: string; grepTitle: string }[]) {
  const args = argv(command).slice(3); // npx playwright test
  const files: RegExp[] = [];
  let grep: RegExp | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--grep') grep = new RegExp(args[++i], 'i');
    else if (!args[i].startsWith('--')) files.push(new RegExp(/^(.*?):(\d+):?(\d+)?$/.exec(args[i])?.[1] ?? args[i], 'i'));
  }
  return candidates.filter((c) => (!files.length || files.some((re) => re.test(c.abs))) && (!grep || grep.test(c.grepTitle))).map((c) => c.abs + ' ' + c.grepTitle);
}

const t = (title: string, file: string, line = 0, extra: Partial<RerunTest> = {}): RerunTest => ({ title, file, line, browser: 'chromium', ...extra });

describe('rerunCommands', () => {
  it('builds one command per browser project from anchored file:line locations', () => {
    const commands = rerunCommands([t('a', 'tests/a.spec.ts', 10), t('b', 'tests/b.spec.ts', 20), t('a', 'tests/a.spec.ts', 10, { browser: 'firefox' })]);
    expect(commands).toEqual([
      {
        browser: 'chromium',
        tests: 2,
        style: 'locations',
        command: "npx playwright test '(^|/)tests/a\\.spec\\.ts$:10' '(^|/)tests/b\\.spec\\.ts$:20' --project=chromium",
        listCommand: "npx playwright test '(^|/)tests/a\\.spec\\.ts$:10' '(^|/)tests/b\\.spec\\.ts$:20' --project=chromium --list",
        expected: 2,
      },
      {
        browser: 'firefox',
        tests: 1,
        style: 'locations',
        command: "npx playwright test '(^|/)tests/a\\.spec\\.ts$:10' --project=firefox",
        listCommand: "npx playwright test '(^|/)tests/a\\.spec\\.ts$:10' --project=firefox --list",
        expected: 1,
      },
    ]);
  });

  it('coupon.spec.ts cannot select incentive-coupon.spec.ts, by location or by title', () => {
    const candidates = [
      { abs: '/repo/tests/coupon.spec.ts', grepTitle: 'chromium tests/coupon.spec.ts applies a coupon' },
      { abs: '/repo/tests/incentive-coupon.spec.ts', grepTitle: 'chromium tests/incentive-coupon.spec.ts applies a coupon' },
      { abs: '/repo/tests/couponXspec.ts', grepTitle: 'chromium tests/couponXspec.ts applies a coupon' },
    ];
    for (const style of ['locations', 'titles'] as const) {
      const [c] = rerunCommands([t('applies a coupon', 'tests/coupon.spec.ts', 12)], { style });
      expect(selects(c.command, candidates)).toEqual(['/repo/tests/coupon.spec.ts chromium tests/coupon.spec.ts applies a coupon']);
    }
    expect(new RegExp(fileFilter('coupon.spec.ts'), 'i').test('/repo/incentive-coupon.spec.ts')).toBe(false);
  });

  it('keeps the same title in two files scoped to the file it was selected in', () => {
    const [c] = rerunCommands([t('checkout works', 'tests/a.spec.ts'), t('other', 'tests/b.spec.ts')]);
    expect(c.style).toBe('titles');
    const selected = selects(c.command, [
      { abs: '/r/tests/a.spec.ts', grepTitle: 'chromium tests/a.spec.ts checkout works' },
      { abs: '/r/tests/b.spec.ts', grepTitle: 'chromium tests/b.spec.ts checkout works' },
      { abs: '/r/tests/b.spec.ts', grepTitle: 'chromium tests/b.spec.ts other' },
    ]);
    expect(selected).toEqual(['/r/tests/a.spec.ts chromium tests/a.spec.ts checkout works', '/r/tests/b.spec.ts chromium tests/b.spec.ts other']);
  });

  it('anchors the full title path: no prefixes, suffixes or other describes, tags allowed', () => {
    const re = new RegExp(titlePattern(t('pay', 'e2e/cart.spec.ts', 0, { titlePath: ['cart', 'pay'] })), 'i');
    expect(re.test('chromium e2e/cart.spec.ts cart pay')).toBe(true);
    expect(re.test(' chromium e2e/cart.spec.ts cart pay @smoke @slow')).toBe(true);
    expect(re.test('chromium cart.spec.ts cart pay')).toBe(true); // a testDir-relative file name
    expect(re.test('chromium e2e\\cart.spec.ts cart pay')).toBe(true); // Windows separators
    expect(re.test('chromium e2e/cart.spec.ts cart pay twice')).toBe(false);
    expect(re.test('chromium e2e/cart.spec.ts cart prepay')).toBe(false);
    expect(re.test('chromium e2e/cart.spec.ts outer cart pay')).toBe(false);
    expect(re.test('chromium e2e/mini-cart.spec.ts cart pay')).toBe(false);
    expect(re.test('chromium other/e2e/cart.spec.ts cart pay')).toBe(false);
  });

  it('escapes regex and shell special characters in titles and paths', () => {
    const title = "can't pay (card) $5.00 [x] a|b *";
    const [c] = rerunCommands([t(title, 'tests/it’s (1).spec.ts', 0, { browser: 'Mobile Safari' })]);
    const args = argv(c.command);
    expect(args.slice(-1)).toEqual(['--project=Mobile Safari']);
    const selected = selects(c.command, [
      { abs: '/r/tests/it’s (1).spec.ts', grepTitle: `Mobile Safari tests/it’s (1).spec.ts ${title}` },
      { abs: '/r/tests/it’s (1).spec.ts', grepTitle: "Mobile Safari tests/it’s (1).spec.ts can't pay card 5.00 x a" },
    ]);
    expect(selected).toHaveLength(1);
  });

  it('falls back to titles past the location limit or when a line is unknown, and adds repeat flags to the run only', () => {
    const many = Array.from({ length: MAX_LOCATIONS + 1 }, (_, i) => t(`t${i}`, 'x.spec.ts', i + 1));
    const [c] = rerunCommands(many, { repeat: 10 });
    expect(c.style).toBe('titles');
    expect(c.expected).toBe(MAX_LOCATIONS + 1);
    expect(c.command.endsWith('--repeat-each=10 --retries=0')).toBe(true);
    expect(c.listCommand.endsWith('--project=chromium --list')).toBe(true);
    expect(rerunCommands([t('a', 'x.spec.ts', 1), t('b', 'x.spec.ts', 0)])[0].style).toBe('titles');
  });

  it('keeps "grep" as the anchored title selection', () => {
    const [grep] = rerunCommands([t('a', 'x.spec.ts', 3)], { style: 'grep' });
    const [titles] = rerunCommands([t('a', 'x.spec.ts', 3)], { style: 'titles' });
    expect(grep.style).toBe('grep');
    expect(grep.command).toBe(titles.command);
    expect(argv(grep.command).slice(3)).toEqual(['(^|/)x\\.spec\\.ts$', '--grep', '(?:\\sx\\.spec\\.ts\\s+a(?:\\s@|$))', '--project=chromium']);
  });

  it('counts each distinct test once in expected', () => {
    const [c] = rerunCommands([t('a', 'x.spec.ts', 1), t('a', 'x.spec.ts', 1), t('b', 'x.spec.ts', 2)]);
    expect(c.expected).toBe(2);
  });

  it('uses the repository’s launcher in place of npx playwright test', () => {
    const [c] = rerunCommands([t('a', 'x.spec.ts', 1)], { launcher: '  pnpm test:e2e:prod -- ' });
    expect(c.command).toBe("pnpm test:e2e:prod -- '(^|/)x\\.spec\\.ts$:1' --project=chromium");
    expect(c.listCommand).toBe("pnpm test:e2e:prod -- '(^|/)x\\.spec\\.ts$:1' --project=chromium --list");
  });
});

describe('selectionCollisions', () => {
  it('reports titles in two files, titles twice in one file (ignoring case) and shared lines', () => {
    const notes = selectionCollisions([
      t('checkout', 'a.spec.ts', 1),
      t('checkout', 'b.spec.ts', 1),
      t('Pay', 'c.spec.ts', 5),
      t('pay', 'c.spec.ts', 9),
      t('row 1', 'd.spec.ts', 3),
      t('row 2', 'd.spec.ts', 3),
      t('checkout', 'a.spec.ts', 1, { browser: 'firefox' }),
    ]);
    expect(notes).toEqual([
      expect.stringContaining('"checkout" exists in 2 files (a.spec.ts, b.spec.ts)'),
      expect.stringContaining('"Pay" appears 2 times in c.spec.ts (chromium)'),
      expect.stringContaining('2 selected tests start at d.spec.ts:3 (chromium)'),
    ]);
  });

  it('is quiet for distinct tests', () => {
    expect(selectionCollisions([t('a', 'a.spec.ts', 1), t('b', 'a.spec.ts', 2)])).toEqual([]);
  });
});
