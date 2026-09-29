import { describe, expect, it } from 'vitest';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import { CASE_DEFAULTS } from './model';
import { parseCsv, parseImport, stepsFromText, stepsToText, toCsv, type ExportDocument } from './transfer';

const defs: CaseFieldDef[] = [{ key: 'owner', label: 'Owner', kind: 'text', options: [], required: false }];

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, line breaks in quotes, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",\n\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', ''],
    ]);
  });
});

describe('steps as text', () => {
  it('round-trips classic steps', () => {
    const steps = [
      { action: 'Open the page', data: '', expected: 'The form shows', keyword: 'given' as const },
      { action: 'Log in', data: 'kim / pw', expected: '', keyword: 'given' as const },
    ];
    const text = stepsToText('classic', steps);
    expect(text).toBe('Open the page |  | The form shows\nLog in | kim / pw');
    expect(stepsFromText('classic', text)).toEqual(steps);
  });

  it('reads Gherkin keywords and numbered lines', () => {
    expect(stepsFromText('gherkin', '1. Given a cart\n2) When I pay\nthe receipt arrives')).toEqual([
      { action: 'a cart', data: '', expected: '', keyword: 'given' },
      { action: 'I pay', data: '', expected: '', keyword: 'when' },
      { action: 'the receipt arrives', data: '', expected: '', keyword: 'and' },
    ]);
  });
});

describe('parseImport', () => {
  it('maps TestRail-style headers and lenient values', () => {
    const csv = 'ID,Title,Section Hierarchy,Priority,Type,Automation Type,Steps (Step),Owner\nC12,Log in,Accounts > Login,P1,End to end,To be automated,Open | | Shown,Kim\n,, ,,,,,\n,No title here?,,,,,,';
    const parsed = parseImport({ name: 'testrail.csv', text: csv }, defs);
    expect(parsed.errors).toEqual([]);
    expect(parsed.cases).toHaveLength(2);
    expect(parsed.cases[0]).toMatchObject({
      key: 'C12',
      title: 'Log in',
      suite: ['Accounts', 'Login'],
      priority: 'high',
      type: 'e2e',
      automation: 'planned',
      steps: [{ action: 'Open', data: '', expected: 'Shown' }],
      customFields: { owner: 'Kim' },
    });
  });

  it('reports rows without a title and files without a title column', () => {
    expect(parseImport({ name: 'a.csv', text: 'title,priority\n,high\nok,low' }, []).errors).toEqual(['Row 2: A test case needs a title.']);
    expect(parseImport({ name: 'a.csv', text: 'name2,priority\nx,high' }, []).errors).toEqual(['The CSV needs a "title" column.']);
  });

  it('rejects JSON that is not an export', () => {
    expect(parseImport({ name: 'x.json', text: '{"cases":[]}' }, []).errors[0]).toMatch(/not a test case export/);
    expect(parseImport({ name: 'x.json', text: '{nope' }, []).errors).toEqual(['The JSON file could not be read.']);
  });

  it('round-trips our CSV, formula-safe', () => {
    const doc: ExportDocument = {
      format: 'pwr-test-cases',
      version: 1,
      exportedAt: '2026-09-29T00:00:00Z',
      projectId: 'p',
      fields: defs,
      suites: [],
      cases: [
        {
          ...CASE_DEFAULTS,
          key: 'TC-3',
          title: '=HYPERLINK("x")',
          suite: ['Checkout', 'Coupons'],
          tags: ['smoke', 'promo'],
          priority: 'critical',
          stepsFormat: 'gherkin',
          steps: [{ action: 'a cart', data: '', expected: '', keyword: 'given' }],
          customFields: { owner: 'Kim' },
          links: [],
        },
      ],
    };
    const csv = toCsv(doc);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    const back = parseImport({ name: 'export.csv', text: csv }, defs).cases[0];
    expect(back).toMatchObject({ key: 'TC-3', suite: ['Checkout', 'Coupons'], tags: ['smoke', 'promo'], priority: 'critical', stepsFormat: 'gherkin', customFields: { owner: 'Kim' } });
    expect(back.steps).toEqual([{ action: 'a cart', data: '', expected: '', keyword: 'given' }]);
  });
});
