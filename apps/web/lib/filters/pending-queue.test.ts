import { describe, expect, it } from 'vitest';
import { latest, sameSearch, settle } from './pending-queue';

const cases = '/teams/a/projects/b/cases';

describe('pending filter queue', () => {
  it('compares queries whatever their param order', () => {
    expect(sameSearch('priority=high&status=active', 'status=active&priority=high')).toBe(true);
    expect(sameSearch('priority=high&priority=critical', 'priority=critical&priority=high')).toBe(true);
    expect(sameSearch('priority=high', 'priority=critical')).toBe(false);
  });

  it('keeps later targets when an earlier one commits, so quick ticks add up', () => {
    const queue = [
      { pathname: cases, search: 'priority=critical' },
      { pathname: cases, search: 'priority=critical&priority=high' },
    ];
    expect(settle(queue, cases, 'priority=critical')).toEqual([queue[1]]);
    expect(settle(queue, cases, 'priority=high&priority=critical')).toEqual([]);
  });

  it('drops everything when the router lands where no filter led', () => {
    const queue = [{ pathname: cases, search: 'priority=critical' }];
    expect(settle(queue, cases, 'suite=x')).toEqual([]);
    expect(settle(queue, '/teams/a/projects/b/runs', 'priority=critical')).toEqual([]);
  });

  it('reads the newest target of the route on screen only', () => {
    const queue = [
      { pathname: cases, search: 'status=active' },
      { pathname: '/other', search: 'x=1' },
      { pathname: cases, search: 'status=active&status=draft' },
    ];
    expect(latest(queue, cases)?.search).toBe('status=active&status=draft');
    expect(latest(queue, '/runs')).toBeUndefined();
  });
});
