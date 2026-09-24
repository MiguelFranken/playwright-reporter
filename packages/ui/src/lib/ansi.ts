/** Strips ANSI escape sequences (SGR colour codes such as ESC[31m) from terminal output. */
export function stripAnsi(s: string | null | undefined): string {
  if (!s) return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*[A-Za-z]/g, '');
}

export function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** First non-empty line of an (ANSI-stripped) message, truncated. */
export function firstLine(s: string | null | undefined, max = 200): string {
  const line = stripAnsi(s).split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
