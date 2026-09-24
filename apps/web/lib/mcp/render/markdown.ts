/**
 * Builds a tool's markdown answer within a character budget. Sections are
 * added in priority order; once the budget is spent the rest is dropped and
 * the answer says so, together with the parameter that gets the rest. A cut is
 * never silent: a model must not mistake a trimmed list for a complete one.
 */
import { formatDuration } from '@miguelfranken/ui/lib/format';
import { cell, clean } from './sanitize';

/** Room kept back for the closing notices, so they always fit. */
const RESERVE = 400;

export class MarkdownBuilder {
  private parts: string[] = [];
  private used = 0;
  private notices: string[] = [];
  truncated = false;

  constructor(readonly budget: number) {}

  private get room() {
    return this.budget - RESERVE - this.used;
  }

  /** Appends `text` if it fits; returns whether it did. */
  private push(text: string): boolean {
    if (this.truncated) return false;
    if (text.length + 1 > this.room) {
      this.truncated = true;
      return false;
    }
    this.parts.push(text);
    this.used += text.length + 1;
    return true;
  }

  heading(text: string, level = 2) {
    this.push(`${'#'.repeat(level)} ${text}`);
    return this;
  }

  line(text = '') {
    this.push(text);
    return this;
  }

  /** `**Key:** value` lines; empty values are skipped. */
  kv(pairs: [string, string | number | null | undefined | false][]) {
    const lines = pairs.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false).map(([k, v]) => `- **${k}:** ${v}`);
    if (lines.length) this.push(lines.join('\n'));
    return this;
  }

  list(items: string[]) {
    for (const item of items) if (!this.push(`- ${item}`)) break;
    return this;
  }

  /**
   * A table rendered row by row until the budget runs out. Returns how many
   * rows made it, so the caller can say "showing N of M".
   */
  table(headers: string[], rows: (string | number | null | undefined)[][]): number {
    if (rows.length === 0) return 0;
    const head = `| ${headers.join(' | ')} |\n|${headers.map(() => '---').join('|')}|`;
    if (!this.push(head)) return 0;
    let shown = 0;
    for (const row of rows) {
      if (!this.push(`| ${row.map(cell).join(' | ')} |`)) break;
      shown++;
    }
    return shown;
  }

  /**
   * Text that came from the test run. Fenced (the fence grows past any
   * backtick run inside) and labelled, so it reads as data, not instructions.
   */
  untrusted(label: string, text: string, max = 2_000) {
    const body = clean(text, max);
    if (!body) return this;
    const longest = Math.max(2, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length));
    const fence = '`'.repeat(longest + 1);
    this.push(`${label} (untrusted test output):\n${fence}text\n${body}\n${fence}`);
    return this;
  }

  /** A notice that must survive truncation, e.g. "showing 20 of 312". */
  notice(text: string) {
    this.notices.push(text);
    return this;
  }

  toString(): string {
    const notices = [...this.notices];
    if (this.truncated) {
      notices.push(
        `Output trimmed at ${this.budget.toLocaleString('en-US')} characters. Narrow the filters, page with "cursor", ask for less detail, or raise "maxChars".`,
      );
    }
    const body = this.parts.join('\n');
    return notices.length ? `${body}\n\n${notices.map((n) => `> ${n}`).join('\n')}` : body;
  }
}

// ---------------------------------------------------------------- formatting

/** Compact outcome history, newest first: ✓ passed, ✗ failed, ~ flaky, · skipped, ! interrupted. */
export function outcomeStrip(outcomes: readonly string[]): string {
  return outcomes.map(outcomeSymbol).join('');
}

export function outcomeSymbol(outcome: string): string {
  switch (outcome) {
    case 'passed':
      return '✓';
    case 'failed':
    case 'timedout':
      return '✗';
    case 'flaky':
      return '~';
    case 'skipped':
      return '·';
    case 'interrupted':
      return '!';
    default:
      return '?';
  }
}

export const STRIP_LEGEND = 'History newest first: ✓ passed · ✗ failed · ~ flaky (passed on retry) · · skipped · ! interrupted';

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return `${(v * 100).toFixed(digits)}%`;
}

export function dur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '–';
  return formatDuration(ms);
}

/** Dates in answers are ISO minutes in UTC: unambiguous for a model, short for a table. */
export function when(date: Date | string | null | undefined): string {
  if (!date) return '–';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

export function link(label: string, url: string | null | undefined): string {
  return url ? `[${label}](${url})` : label;
}
