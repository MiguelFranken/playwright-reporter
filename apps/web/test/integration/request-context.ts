/**
 * The request scope Next.js would normally provide. `next/headers` is mocked in
 * `setup.ts` to read from here, so the `actor` fixture can put a session cookie
 * (or an `x-forwarded-for`) in front of the code under test.
 */
let current = new Headers();

export function currentHeaders(): Headers {
  return current;
}

export function setHeaders(init?: HeadersInit): Headers {
  current = new Headers(init);
  return current;
}
