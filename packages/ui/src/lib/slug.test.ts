import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and dashes a display name', () => {
    expect(slugify('Acme Web Shop')).toBe('acme-web-shop');
  });

  it('drops accents and trims dashes at both ends', () => {
    expect(slugify('  Café — Checkout! ')).toBe('cafe-checkout');
  });

  it('caps the length at 50', () => {
    expect(slugify('a'.repeat(80))).toHaveLength(50);
  });
});
