import { describe, expect, it } from 'vitest';
import { MAX_LOCATIONS, rerunCommands } from './rerun-command';

describe('rerunCommands', () => {
  it('builds one command per browser project from file:line locations', () => {
    const commands = rerunCommands([
      { title: 'a', file: 'tests/a.spec.ts', line: 10, browser: 'chromium' },
      { title: 'b', file: 'tests/b.spec.ts', line: 20, browser: 'chromium' },
      { title: 'a', file: 'tests/a.spec.ts', line: 10, browser: 'firefox' },
    ]);
    expect(commands).toEqual([
      { browser: 'chromium', tests: 2, style: 'locations', command: 'npx playwright test tests/a.spec.ts:10 tests/b.spec.ts:20 --project=chromium' },
      { browser: 'firefox', tests: 1, style: 'locations', command: 'npx playwright test tests/a.spec.ts:10 --project=firefox' },
    ]);
  });

  it('switches to --grep with escaped, quoted titles', () => {
    const [c] = rerunCommands([{ title: "can't pay (card)", file: 'x.spec.ts', line: 1, browser: 'Mobile Safari' }], { style: 'grep' });
    expect(c.command).toBe("npx playwright test --grep 'can'\\''t pay \\(card\\)' --project='Mobile Safari'");
  });

  it('falls back to --grep past the location limit and adds repeat flags', () => {
    const many = Array.from({ length: MAX_LOCATIONS + 1 }, (_, i) => ({ title: `t${i}`, file: 'x.spec.ts', line: i + 1, browser: 'chromium' }));
    const [c] = rerunCommands(many, { repeat: 10 });
    expect(c.style).toBe('grep');
    expect(c.command.endsWith('--repeat-each=10 --retries=0')).toBe(true);
  });
});
