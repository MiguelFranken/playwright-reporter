import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Grace Brewster Murray Hopper')).toBe('GB');
  });

  it('splits email addresses and handles into words', () => {
    expect(initials('ada@acme.test')).toBe('AA');
    expect(initials('platform-team')).toBe('PT');
    expect(initials('j.doe')).toBe('JD');
  });

  it('uses one letter for a single word', () => {
    expect(initials('acme')).toBe('A');
    expect(initials('x')).toBe('X');
  });

  it('falls back to the raw value when nothing is left after splitting', () => {
    expect(initials('--')).toBe('--');
  });
});
