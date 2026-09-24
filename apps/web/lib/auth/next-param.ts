/**
 * `?next=` comes from the URL, so it can only ever be a same-origin path.
 * Anything else (absolute URL, protocol-relative `//evil.com`) falls back to `/`.
 */
export function safeNext(value: string | string[] | undefined, fallback = '/'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}
