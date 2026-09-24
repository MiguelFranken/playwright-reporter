/**
 * Keeps `structuredContent` within reach of the character budget as well. The
 * largest arrays are halved until the JSON fits, and the result is flagged
 * `truncated`, so the structured answer is never cut mid-document and never
 * pretends to be complete.
 */
export function trimStructured<T extends Record<string, unknown>>(data: T, maxChars: number): T {
  let current: Record<string, unknown> = data;
  let size = JSON.stringify(current).length;
  let guard = 0;
  while (size > maxChars && guard++ < 40) {
    const path = largestArray(current);
    if (!path) break;
    current = sliceAt(current, path);
    current.truncated = true;
    const next = JSON.stringify(current).length;
    if (next >= size) break;
    size = next;
  }
  return current as T;
}

function largestArray(value: unknown, path: string[] = [], depth = 0): string[] | null {
  if (depth > 3 || value === null || typeof value !== 'object') return null;
  let best: { path: string[]; size: number } | null = null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(child) && child.length > 1) {
      const size = JSON.stringify(child).length;
      if (!best || size > best.size) best = { path: [...path, key], size };
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      const nested = largestArray(child, [...path, key], depth + 1);
      if (nested) {
        const size = JSON.stringify(nested.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], value)).length;
        if (!best || size > best.size) best = { path: nested, size };
      }
    }
  }
  return best?.path ?? null;
}

function sliceAt(value: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const [head, ...rest] = path;
  const child = value[head];
  if (rest.length === 0 && Array.isArray(child)) return { ...value, [head]: child.slice(0, Math.max(1, Math.floor(child.length / 2))) };
  return { ...value, [head]: sliceAt(child as Record<string, unknown>, rest) };
}
