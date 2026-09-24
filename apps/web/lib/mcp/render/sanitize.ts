/**
 * Everything a test run reports — titles, error messages, snippets, logs,
 * annotations — comes from the code under test and can contain anything,
 * including text that looks like instructions. It is shortened, stripped of
 * terminal escapes and, in markdown, fenced under a label that says so.
 */
import { stripAnsi } from '@miguelfranken/ui/lib/ansi';

export function clean(text: string | null | undefined, max = 2_000): string {
  if (!text) return '';
  const stripped = stripAnsi(text).replace(/\r\n?/g, '\n');
  return stripped.length > max ? `${stripped.slice(0, max)}… [${stripped.length - max} more characters]` : stripped;
}

/** First non-empty line, shortened: for table cells. */
export function firstLine(text: string | null | undefined, max = 160): string {
  const line = clean(text, 4_000)
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** The last `lines` lines of a log. */
export function tail(text: string | null | undefined, lines: number): string {
  const all = clean(text, 200_000).split('\n');
  const kept = all.slice(-lines);
  return (all.length > lines ? `… [${all.length - lines} earlier lines]\n` : '') + kept.join('\n');
}

/** A stack shortened to its first frames, which is where the test's own code shows up. */
export function shortStack(stack: string | null | undefined, frames = 15): string {
  const lines = clean(stack, 20_000).split('\n');
  return lines.length > frames ? `${lines.slice(0, frames).join('\n')}\n… [${lines.length - frames} more frames]` : lines.join('\n');
}

/** Markdown table cells cannot hold pipes or newlines. */
export function cell(text: string | number | null | undefined): string {
  if (text === null || text === undefined || text === '') return '–';
  return String(text).replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}
