import { describe, expect, it } from 'vitest';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import {
  CASE_DEFAULTS,
  caseRefsFromTest,
  caseVerdict,
  changedFields,
  coerceCustomFields,
  createCaseSchema,
  fieldDefSchema,
  parseCaseKey,
  snapshotOf,
  suiteFieldsSchema,
  tagsSchema,
} from './model';

describe('parseCaseKey', () => {
  it.for([
    ['TC-12', 12],
    ['tc-7', 7],
    [' #3 ', 3],
    ['42', 42],
  ] as const)('reads %s', ([input, n]) => {
    expect(parseCaseKey(input)).toBe(n);
  });

  it.for(['', 'TC-', 'TC-0', 'TC-1a', 'abc', '-3', 'TC-1234567890'])('rejects %j', (input) => {
    expect(parseCaseKey(input)).toBeNull();
  });
});

describe('caseRefsFromTest', () => {
  it('reads tags in any case, with or without @', () => {
    expect(caseRefsFromTest(['@TC-12', 'tc-3', '@smoke', '@TC-12'], [])).toEqual([3, 12]);
  });

  it('reads case annotations with one or several keys', () => {
    expect(
      caseRefsFromTest([], [
        { type: 'test-case', description: 'TC-5, TC-9' },
        { type: 'TC', description: '#11' },
        { type: 'issue', description: 'TC-99' },
        { type: 'testcase' },
      ]),
    ).toEqual([5, 9, 11]);
  });

  it('ignores tags that only look similar', () => {
    expect(caseRefsFromTest(['@TC-12-login', '@ATC-1', '@TC-0'], [])).toEqual([]);
  });
});

describe('tagsSchema', () => {
  it('trims, strips @, joins whitespace and de-duplicates', () => {
    expect(tagsSchema.parse([' @smoke ', 'smoke', 'check out', ''])).toEqual(['smoke', 'check-out']);
  });
});

describe('createCaseSchema', () => {
  it('requires a title', () => {
    expect(createCaseSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('drops blank steps and fills step defaults', () => {
    const parsed = createCaseSchema.parse({
      title: 'Log in',
      steps: [{ action: 'Open the page' }, { action: '', data: '', expected: '' }, { action: '', expected: 'Shown' }],
    });
    expect(parsed.steps).toEqual([
      { action: 'Open the page', data: '', expected: '', keyword: 'given' },
      { action: '', data: '', expected: 'Shown', keyword: 'given' },
    ]);
  });

  it('rejects unknown enum values', () => {
    expect(createCaseSchema.safeParse({ title: 'x', priority: 'urgent' }).success).toBe(false);
  });
});

describe('suiteFieldsSchema', () => {
  it('defaults to a root suite', () => {
    expect(suiteFieldsSchema.parse({ name: ' Checkout ' })).toEqual({ name: 'Checkout', description: '', parentId: null });
  });
});

describe('fieldDefSchema', () => {
  it('requires options for a dropdown and de-duplicates them', () => {
    expect(fieldDefSchema.safeParse({ key: 'team', label: 'Team', kind: 'select', options: [] }).success).toBe(false);
    expect(fieldDefSchema.parse({ key: 'team', label: 'Team', kind: 'select', options: ['A', 'A', 'B'] }).options).toEqual(['A', 'B']);
  });

  it('drops options for other kinds and validates the key', () => {
    expect(fieldDefSchema.parse({ key: 'points', label: 'Points', kind: 'number', options: ['x'] }).options).toEqual([]);
    expect(fieldDefSchema.safeParse({ key: 'Story Points', label: 'x', kind: 'text' }).success).toBe(false);
  });
});

describe('coerceCustomFields', () => {
  const defs: CaseFieldDef[] = [
    { key: 'owner', label: 'Owner', kind: 'text', options: [], required: true },
    { key: 'points', label: 'Points', kind: 'number', options: [], required: false },
    { key: 'due', label: 'Due', kind: 'date', options: [], required: false },
    { key: 'area', label: 'Area', kind: 'select', options: ['Cart', 'Auth'], required: false },
    { key: 'legacy', label: 'Legacy', kind: 'checkbox', options: [], required: false },
  ];

  it('coerces each kind and drops unknown keys', () => {
    const result = coerceCustomFields(defs, { owner: ' Kim ', points: '3', due: '2026-10-01', area: 'Cart', legacy: 'on', other: 'x' }, { requireAll: true });
    expect(result).toEqual({ ok: true, value: { owner: 'Kim', points: 3, due: '2026-10-01', area: 'Cart', legacy: true } });
  });

  it('reports a missing required field only when asked to', () => {
    expect(coerceCustomFields(defs, {}, { requireAll: true })).toEqual({ ok: false, message: 'Owner is required.' });
    expect(coerceCustomFields(defs, {}, { requireAll: false })).toEqual({ ok: true, value: {} });
  });

  it('rejects a value outside a dropdown and a malformed number or date', () => {
    expect(coerceCustomFields(defs, { owner: 'a', area: 'Search' }, { requireAll: true }).ok).toBe(false);
    expect(coerceCustomFields(defs, { owner: 'a', points: 'many' }, { requireAll: true }).ok).toBe(false);
    expect(coerceCustomFields(defs, { owner: 'a', due: '01.10.2026' }, { requireAll: true }).ok).toBe(false);
  });
});

describe('changedFields', () => {
  const base = snapshotOf({ ...CASE_DEFAULTS, title: 'Log in', suiteId: null });

  it('lists nothing for an identical snapshot', () => {
    expect(changedFields(base, snapshotOf(base))).toEqual([]);
  });

  it('lists every field that differs, in diff order', () => {
    const after = { ...base, tags: ['smoke'], title: 'Log in with SSO', steps: [{ action: 'a', data: '', expected: '', keyword: 'given' as const }] };
    expect(changedFields(base, after)).toEqual(['title', 'tags', 'steps']);
  });

  it('treats a field missing from an old snapshot as its default', () => {
    const { customFields: _, ...old } = base;
    expect(changedFields(old, base)).toEqual([]);
  });

  it('ignores key order inside objects', () => {
    expect(changedFields({ ...base, customFields: { a: 1, b: 2 } }, { ...base, customFields: { b: 2, a: 1 } })).toEqual([]);
  });
});

describe('caseVerdict', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const link = (lastOutcome: string | null, ranDaysAgo: number | null, flaky = 0) => ({
    lastOutcome,
    lastRunAt: ranDaysAgo === null ? null : daysAgo(ranDaysAgo),
    flaky,
  });

  it('has no verdict without links, and "not run" before any result', () => {
    expect(caseVerdict([], now)).toBe('none');
    expect(caseVerdict([link(null, null)], now)).toBe('not_run');
  });

  it('is stale when no linked test ran recently', () => {
    expect(caseVerdict([link('passed', 20), link('failed', 30)], now)).toBe('stale');
  });

  it('puts a failing latest result above flakiness', () => {
    expect(caseVerdict([link('passed', 1, 2), link('timedout', 2)], now)).toBe('failing');
  });

  it('is flaky when a linked test flaked in the window', () => {
    expect(caseVerdict([link('passed', 1, 1), link('passed', 1)], now)).toBe('flaky');
    expect(caseVerdict([link('flaky', 1)], now)).toBe('flaky');
  });

  it('passes when every recent result passed or was skipped', () => {
    expect(caseVerdict([link('passed', 1), link('skipped', 3), link(null, null)], now)).toBe('passing');
  });
});
