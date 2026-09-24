import { describe, expect, it } from 'vitest';
import { safeNext } from './next-param';

describe('safeNext', () => {
  it('keeps same-origin paths', () => {
    expect(safeNext('/teams/a/projects/b/runs/3')).toBe('/teams/a/projects/b/runs/3');
    expect(safeNext('/invite/abc?x=1')).toBe('/invite/abc?x=1');
  });

  it('refuses anything that could leave the origin', () => {
    for (const value of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'teams/a', '']) {
      expect(safeNext(value)).toBe('/');
    }
  });

  it('takes the first value of a repeated parameter and falls back when absent', () => {
    expect(safeNext(['/a', '/b'])).toBe('/a');
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(undefined, '/admin')).toBe('/admin');
  });
});
