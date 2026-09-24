import { describe, expect, it } from 'vitest';
import type { TextField } from 'payload';
import { pageSlugField, reservedSlugs } from './slug';

/**
 * The slug is the page's URL, so a bad one is either a dead route or — for the
 * reserved paths — a page that shadows the admin panel.
 */
function validator() {
  const row = pageSlugField();
  const text = row.fields.find((field): field is TextField => field.type === 'text');
  if (!text?.validate) throw new Error('the slug field lost its validation');
  return (value: string | null | undefined) =>
    (text.validate as (value: unknown) => string | true)(value);
}

describe('pageSlugField validation', () => {
  const validate = validator();

  it.each(['home', 'features', 'get-started', 'legal/imprint'])('accepts %s', (slug) => {
    expect(validate(slug)).toBe(true);
  });

  it('requires a value', () => {
    expect(validate('')).toMatch(/required/i);
    expect(validate(undefined)).toMatch(/required/i);
  });

  it.each(reservedSlugs)('rejects the reserved path %s', (slug) => {
    expect(validate(slug)).toMatch(/reserved/i);
  });

  it.each([
    'Features',
    'get started',
    'features/',
    '-features',
    'features--beta',
    'féatures',
  ])('rejects %s', (slug) => {
    expect(validate(slug)).toMatch(/lowercase/i);
  });
});
