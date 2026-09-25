/**
 * Up to two letters standing in for a person or team without an image: the
 * first letters of the first two words, where an email address, a dotted or
 * dashed handle splits into words too. "Ada Lovelace" → "AL", "ada@acme.test"
 * → "AA", "acme" → "A".
 */
export function initials(value: string): string {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return (((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).slice(0, 2) || value.slice(0, 2)).toUpperCase();
}
