import { describe, expect, test } from 'vitest';
import {
  applicableRules,
  decodeComparisonId,
  encodeComparisonId,
  ignoreStates,
  intersection,
  labelRegions,
  pathWithin,
  resolvePolicy,
  ruleValidity,
  unionArea,
  type IgnoreRule,
  type PolicyRule,
} from './visual-diff';

const base = '0b1f5e8a-3c4d-4e6f-8a9b-0c1d2e3f4a5b';
const head = 'ffffffff-1111-4222-8333-444444444444';

describe('comparison ids', () => {
  test('round-trip two capture ids, whatever their case', () => {
    const id = encodeComparisonId(base.toUpperCase(), head);
    expect(id).toMatch(/^vc_[A-Za-z0-9_-]{43}$/);
    expect(decodeComparisonId(id)).toEqual({ baseCaptureId: base, headCaptureId: head });
  });

  test('refuse anything that is not two uuids', () => {
    expect(() => encodeComparisonId('nope', head)).toThrow();
    expect(decodeComparisonId('vc_short')).toBeNull();
    expect(decodeComparisonId(base)).toBeNull();
  });
});

describe('geometry', () => {
  test('intersection and union count pixels once', () => {
    expect(intersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(intersection({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 1, height: 1 })).toBeNull();
    expect(
      unionArea([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 },
      ]),
    ).toBe(175);
    expect(unionArea([])).toBe(0);
  });
});

describe('labelRegions', () => {
  test('numbers regions in reading order and says what the rules touch', () => {
    const regions = labelRegions(
      [
        { x: 100, y: 200, width: 10, height: 10, pixels: 50 },
        { x: 0, y: 0, width: 20, height: 20, pixels: 400 },
        { x: 50, y: 0, width: 20, height: 20, pixels: 10 },
      ],
      { base: { width: 300, height: 300 }, head: { width: 300, height: 300 } },
      [
        { id: 'rule-a', x: 0, y: 0, width: 20, height: 20 },
        { id: 'rule-b', x: 55, y: 5, width: 4, height: 4 },
      ],
    );
    expect(regions.map((r) => [r.label, r.headRect!.x, r.ignore, r.ignoredBy])).toEqual([
      ['D1', 0, 'full', ['rule-a']],
      ['D2', 50, 'partial', ['rule-b']],
      ['D3', 100, 'none', []],
    ]);
    expect(regions[0].baseRect).toEqual(regions[0].headRect);
    expect(regions[0].id).toBe('r0-0-20-20');
  });

  test('area only the base has becomes a removed-area region without a head rectangle', () => {
    const regions = labelRegions([{ x: 0, y: 100, width: 50, height: 20, pixels: 1000 }], { base: { width: 50, height: 150 }, head: { width: 50, height: 120 } });
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({ label: 'D1', kind: 'change', headRect: { y: 100 }, baseRect: { x: 0, y: 100, width: 50, height: 20 } });
    expect(regions[1]).toMatchObject({ label: 'D2', kind: 'removed-area', headRect: null, baseRect: { x: 0, y: 120, width: 50, height: 30 }, rawChangedPixels: 1500 });
  });
});

const rule = (over: Partial<IgnoreRule> = {}): IgnoreRule => ({
  id: 'r1',
  x: 10,
  y: 10,
  width: 50,
  height: 20,
  reason: null,
  category: null,
  source: 'manual',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  createdBy: null,
  geometry: { imageWidth: 800, imageHeight: 600, originCaptureId: null, viewportWidth: null, viewportHeight: null, deviceScaleFactor: null },
  ...over,
});

describe('rule validity', () => {
  test('a rule fits the image it was drawn on, is suspended on another size, and legacy rules apply unchecked', () => {
    expect(ruleValidity(rule(), { width: 800, height: 600 })).toBe('valid');
    expect(ruleValidity(rule(), { width: 800, height: 900 })).toBe('geometry_changed');
    expect(ruleValidity(rule({ x: 790 }), { width: 800, height: 600 })).toBe('out_of_bounds');
    expect(ruleValidity(rule({ geometry: null }), { width: 1, height: 1 })).toBe('out_of_bounds');
    expect(ruleValidity(rule({ geometry: null }), { width: 800, height: 900 })).toBe('legacy');
    expect(ruleValidity(rule({ active: false }), null)).toBe('inactive');
    const { applied, suspended } = applicableRules([rule(), rule({ id: 'r2', geometry: null }), rule({ id: 'r3', active: false })], { width: 800, height: 900 });
    expect(applied.map((r) => r.id)).toEqual(['r2']);
    expect(suspended).toEqual([{ rule: expect.objectContaining({ id: 'r1' }), validity: 'geometry_changed' }]);
  });
});

describe('ignoreStates', () => {
  test('tells applied from suppressed from fully suppressed', () => {
    expect([...ignoreStates({ active: 1, ever: true, applied: 1, suspended: 0, revision: 2, rawChangedPixels: 100, suppressedPixels: 100 })]).toEqual(['active', 'ever', 'applied', 'suppressed', 'fully-suppressed']);
    expect([...ignoreStates({ active: 0, ever: true, applied: 0, suspended: 0, revision: 3, rawChangedPixels: null, suppressedPixels: null })]).toEqual(['ever']);
    expect([...ignoreStates({ active: 1, ever: true, applied: 0, suspended: 1, revision: 1, rawChangedPixels: 100, suppressedPixels: 0 })]).toEqual(['active', 'ever', 'needs-review']);
  });
});

describe('policies', () => {
  const target = { file: 'tests/checkout/pay.spec.ts', suiteIds: ['s-checkout'], testId: 't1', checkpointName: 'summary', variant: 'desktop' };
  const rules: PolicyRule[] = [
    { id: 'a', scope: { kind: 'project' }, capability: 'ai', effect: 'allow' },
    { id: 'b', scope: { kind: 'file', path: 'tests/checkout' }, capability: 'ai', effect: 'deny' },
    { id: 'c', scope: { kind: 'screen', testId: 't1', checkpointName: 'summary' }, capability: 'ai', effect: 'allow' },
  ];

  test('a deny on a folder wins over an allow on a screen inside it', () => {
    expect(resolvePolicy(rules, 'ai', target, false)).toMatchObject({ allowed: false, rule: { id: 'b' } });
    expect(resolvePolicy(rules, 'ai', { ...target, file: 'tests/home.spec.ts' }, false)).toMatchObject({ allowed: true, rule: { id: 'c' } });
    expect(resolvePolicy(rules, 'ai', { ...target, file: 'tests/home.spec.ts', checkpointName: 'other' }, false)).toMatchObject({ allowed: true, rule: { id: 'a' } });
    expect(resolvePolicy(rules, 'ignore', target, true)).toMatchObject({ allowed: true, rule: null });
    expect(resolvePolicy([], 'ai', target, false)).toMatchObject({ allowed: false, rule: null });
  });

  test('folders match by whole segments, not by prefix', () => {
    expect(pathWithin('tests/checkout/pay.spec.ts', 'tests/checkout')).toBe(true);
    expect(pathWithin('tests/checkout-legacy/pay.spec.ts', 'tests/checkout')).toBe(false);
    expect(pathWithin('./tests/checkout/', 'tests/checkout')).toBe(true);
  });
});
