import { describe, expect, it } from 'vitest';
import {
  CHRONIC_FAILURE_RATE,
  CHRONIC_MIN_RUNS,
  CHRONIC_STREAK,
  flakyLabel,
  reliabilityLabel,
  reliabilityScore,
} from './score';

describe('reliabilityScore', () => {
  it.each([
    { failureRate: 0, flakyRate: 0, expected: 100 },
    { failureRate: 1, flakyRate: 0, expected: 0 },
    { failureRate: 0, flakyRate: 1, expected: 50 },
    // Failures weigh fully, flakiness half.
    { failureRate: 0.25, flakyRate: 0.5, expected: 50 },
    { failureRate: 0.1, flakyRate: 0.2, expected: 80 },
  ])('scores failureRate $failureRate / flakyRate $flakyRate as $expected', ({ failureRate, flakyRate, expected }) => {
    expect(reliabilityScore(failureRate, flakyRate)).toBe(expected);
  });

  it('clamps into 0…100 instead of going negative', () => {
    expect(reliabilityScore(1, 1)).toBe(0);
    expect(reliabilityScore(2, 2)).toBe(0);
    expect(reliabilityScore(-1, 0)).toBe(100);
  });

  it('rounds to a whole number', () => {
    expect(reliabilityScore(1 / 3, 0)).toBe(67);
    expect(Number.isInteger(reliabilityScore(1 / 7, 1 / 7))).toBe(true);
  });
});

describe('reliabilityLabel', () => {
  it.each([
    [100, 'Healthy'],
    [80, 'Healthy'],
    [79, 'Shaky'],
    [50, 'Shaky'],
    [49, 'Unreliable'],
    [0, 'Unreliable'],
  ] as const)('labels %i as %s', (score, label) => {
    expect(reliabilityLabel(score).label).toBe(label);
  });

  it('has a distinct label when there is no score at all', () => {
    expect(reliabilityLabel(null)).toEqual({ label: 'No data', tone: 'muted' });
    expect(reliabilityLabel(undefined).label).toBe('No data');
  });

  it('pairs each label with a tone', () => {
    expect(reliabilityLabel(90).tone).toBe('good');
    expect(reliabilityLabel(60).tone).toBe('warn');
    expect(reliabilityLabel(10).tone).toBe('bad');
  });
});

describe('flakyLabel', () => {
  it.each([
    [0, 'Occasional'],
    [0.09, 'Occasional'],
    [0.1, 'Unreliable'],
    [0.29, 'Unreliable'],
    [0.3, 'Unstable'],
    [1, 'Unstable'],
  ] as const)('labels a rate of %f as %s', (rate, label) => {
    expect(flakyLabel(rate).label).toBe(label);
  });
});

describe('the chronic-failure thresholds', () => {
  it('are the values the SQL and the explorer both read', () => {
    expect({ CHRONIC_STREAK, CHRONIC_MIN_RUNS, CHRONIC_FAILURE_RATE }).toEqual({
      CHRONIC_STREAK: 5,
      CHRONIC_MIN_RUNS: 5,
      CHRONIC_FAILURE_RATE: 0.7,
    });
  });
});
