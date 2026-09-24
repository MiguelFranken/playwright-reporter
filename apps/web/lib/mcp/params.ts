/**
 * The parameter vocabulary every tool shares: one name and one set of accepted
 * forms per concept, so a model that learned `run: "#128"` in one tool can use
 * it in all of them.
 *
 * Schema rules (they keep the zod → JSON Schema conversion faithful): only
 * plain types, no `z.date()`, no transforms, refinements or preprocessing.
 * Anything a schema cannot express is checked by the parsers below, which
 * throw `INVALID_ARGUMENT`.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { invalid } from './errors';

// ------------------------------------------------------------------ schemas

export const projectParam = z
  .string()
  .optional()
  .describe('Project as "team/project" (e.g. "acme/web"), a project id, or any app URL inside it. Optional when the connection has a default project.');

export const runParam = z
  .union([z.number().int().positive(), z.string()])
  .describe('Run number (128 or "#128"), run id, run URL, "latest" or "latest-failed". Scope "latest" with branch/environment.');

export const testParam = z
  .string()
  .describe('Test id, test or result URL, or part of the test title. Add file/browser to pick one when several tests match.');

export const resultParam = z.string().describe('Result id or result URL (…/runs/128/tests/<id>).');

export const sinceParam = z.string().optional().describe('Start of the window: a duration back from now ("24h", "7d", "4w") or an ISO date.');
export const untilParam = z.string().optional().describe('End of the window: a duration back from now or an ISO date. Default: now.');
export const limitParam = z.number().int().min(1).max(100).optional().describe('Rows per page (1–100, default 20).');
export const cursorParam = z.string().optional().describe('Opaque cursor from a previous response, for the next page. Keep the other filters unchanged.');
export const formatParam = z
  .enum(['markdown', 'json'])
  .optional()
  .describe('Text format of the answer: "markdown" (default, compact) or "json" (the structured result as JSON).');
export const maxCharsParam = z.number().int().min(1_000).max(100_000).optional().describe('Character budget for this answer (default 20000).');
export const fileParam = z.string().optional().describe('Part of the spec file path, e.g. "checkout.spec".');
export const browserParam = z.string().optional().describe('Playwright project name, e.g. "chromium" (see list_filters).');
export const branchParam = z.string().optional().describe('Git branch name, e.g. "main".');
export const environmentParam = z.string().optional().describe('Environment label the reporter sent, e.g. "staging".');

/** Parameters every project-scoped tool accepts. */
export const commonParams = {
  project: projectParam,
  format: formatParam,
  maxChars: maxCharsParam,
};

/** A single value or a list, normalised by `asList`. */
export function oneOrMany<T extends z.ZodType>(item: T) {
  return z.union([item, z.array(item)]);
}

export function asList<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

// ------------------------------------------------------------------ time

const DURATION = /^(\d+(?:\.\d+)?)\s*(m|min|h|d|w)$/i;
const UNIT_MS: Record<string, number> = { m: 60_000, min: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "90m", "24h", "7d", "4w" → milliseconds, or null when it is not a duration. */
export function parseDuration(value: string): number | null {
  const match = DURATION.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * UNIT_MS[match[2].toLowerCase()];
}

/** A duration back from `now`, or an absolute ISO date/datetime. */
export function parseTimeBound(value: string, now = new Date()): Date {
  const duration = parseDuration(value);
  if (duration !== null) return new Date(now.getTime() - duration);
  if (/^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    const date = new Date(value.trim());
    if (!Number.isNaN(date.getTime())) return date;
  }
  throw invalid(`"${value}" is neither a duration ("24h", "7d", "4w") nor an ISO date ("2026-09-01").`);
}

export interface TimeWindow {
  since: Date;
  until: Date | null;
  /** Whole days covered by `since`, for the queries that take a day count. */
  days: number;
  /** Human description for the answer, e.g. "last 30 days". */
  label: string;
  /** Set when the requested window was longer than the tool allows. */
  clamped: boolean;
}

/**
 * The effective window of a query. Aggregates clamp to `max` and say so, rather
 * than quietly scanning a year of results.
 */
export function timeWindow(
  input: { since?: string; until?: string },
  opts: { defaultSince: string; max?: string },
  now = new Date(),
): TimeWindow {
  const since = parseTimeBound(input.since ?? opts.defaultSince, now);
  const until = input.until ? parseTimeBound(input.until, now) : null;
  if (until && until <= since) throw invalid('"until" must be later than "since".');
  let effective = since;
  let clamped = false;
  if (opts.max) {
    const earliest = new Date(now.getTime() - parseDuration(opts.max)!);
    if (since < earliest) {
      effective = earliest;
      clamped = true;
    }
  }
  const days = Math.max(1, Math.ceil((now.getTime() - effective.getTime()) / 86_400_000));
  const label = input.since && !parseDuration(input.since) ? `since ${effective.toISOString().slice(0, 10)}` : `last ${describeDays(days)}`;
  return { since: effective, until, days, label: until ? `${label} until ${until.toISOString().slice(0, 16).replace('T', ' ')}` : label, clamped };
}

function describeDays(days: number) {
  return days === 1 ? '24 hours' : `${days} days`;
}

// ------------------------------------------------------------------ paging

const DEFAULT_LIMIT = 20;

export interface Page {
  limit: number;
  offset: number;
}

/**
 * Cursors are opaque to the model but plain to us: the offset plus a hash of
 * the filters it was issued for, so reusing one with other filters is caught
 * instead of silently paging through a different list.
 */
export function readPage(tool: string, filters: unknown, input: { limit?: number; cursor?: string }): Page {
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!input.cursor) return { limit, offset: 0 };
  let decoded: { v?: number; t?: string; o?: number; f?: string };
  try {
    decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid('The cursor is not valid. Omit it to start from the first page.');
  }
  if (decoded.v !== 1 || decoded.t !== tool || typeof decoded.o !== 'number' || decoded.o < 0) {
    throw invalid('The cursor belongs to another tool or is corrupted. Omit it to start from the first page.');
  }
  if (decoded.f !== filtersHash(filters)) {
    throw invalid('The cursor was issued for different filters. Repeat the original filters, or omit the cursor to start over.');
  }
  return { limit, offset: decoded.o };
}

export function nextCursor(tool: string, filters: unknown, page: Page, total: number): string | null {
  const next = page.offset + page.limit;
  if (next >= total) return null;
  return Buffer.from(JSON.stringify({ v: 1, t: tool, o: next, f: filtersHash(filters) })).toString('base64url');
}

function filtersHash(filters: unknown) {
  return createHash('sha1').update(stableStringify(filters)).digest('base64url').slice(0, 12);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

// ------------------------------------------------------------------ references

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

export interface AppUrl {
  teamSlug: string;
  projectSlug: string;
  runNumber?: number;
  resultId?: string;
  testId?: string;
}

/**
 * Pulls team, project and entity out of an app URL, absolute or relative, so
 * a link pasted from the browser (or a "Debug with AI" prompt) resolves.
 */
export function parseAppUrl(value: string): AppUrl | null {
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  path = path.split(/[?#]/)[0];
  const match = /^\/?teams\/([^/]+)\/projects\/([^/]+)(\/.*)?$/.exec(path);
  if (!match) return null;
  const [, team, project, rest = ''] = match;
  const url: AppUrl = { teamSlug: decodeURIComponent(team), projectSlug: decodeURIComponent(project) };
  const result = /^\/runs\/(\d+)\/tests\/([0-9a-f-]{36})/i.exec(rest);
  if (result) return { ...url, runNumber: Number(result[1]), resultId: result[2] };
  const run = /^\/runs\/(\d+)/.exec(rest);
  if (run) return { ...url, runNumber: Number(run[1]) };
  const test = /^\/tests\/([0-9a-f-]{36})/i.exec(rest);
  if (test) return { ...url, testId: test[1] };
  return url;
}

export type RunRef =
  | { kind: 'number'; number: number }
  | { kind: 'id'; id: string }
  | { kind: 'latest'; failedOnly: boolean }
  | { kind: 'url'; url: AppUrl & { runNumber: number } };

export function parseRunRef(value: number | string): RunRef {
  if (typeof value === 'number') return { kind: 'number', number: value };
  const v = value.trim();
  if (/^#?\d+$/.test(v)) return { kind: 'number', number: Number(v.replace('#', '')) };
  if (isUuid(v)) return { kind: 'id', id: v.toLowerCase() };
  const lower = v.toLowerCase();
  if (lower === 'latest' || lower === 'last') return { kind: 'latest', failedOnly: false };
  if (lower === 'latest-failed' || lower === 'latest failed' || lower === 'last-failed') return { kind: 'latest', failedOnly: true };
  const url = parseAppUrl(v);
  if (url?.runNumber) return { kind: 'url', url: { ...url, runNumber: url.runNumber } };
  throw invalid(`"${value}" is not a run reference. Use a run number ("#128"), a run id, a run URL, "latest" or "latest-failed".`);
}
