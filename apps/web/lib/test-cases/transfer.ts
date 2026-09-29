/**
 * Test cases in and out of files: our own JSON (everything a case holds, with
 * its suite path), and CSV for spreadsheets and other tools' exports
 * (TestRail's among them). Pure functions; the service does the writing.
 */
import { z } from 'zod';
import {
  CASE_AUTOMATION_LABELS,
  CASE_BEHAVIOR_LABELS,
  CASE_PRIORITY_LABELS,
  CASE_SEVERITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  caseKey,
  GHERKIN_KEYWORD_LABELS,
  GHERKIN_KEYWORDS,
  type CaseFieldDef,
  type CaseStep,
  type CustomFieldValue,
} from '@miguelfranken/ui/lib/test-cases';
import { CASE_DEFAULTS, parseCaseKey, type CaseFields } from './model';

export const EXPORT_FORMAT = 'pwr-test-cases';
export const MAX_IMPORT_ROWS = 5_000;

/** A case as a file carries it: the suite as a path of names, not an id. */
export interface TransferCase extends Omit<CaseFields, 'suiteId'> {
  /** `TC-12` in the project it came from; used to match on re-import. */
  key: string | null;
  suite: string[];
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  /** The project the file came from: its keys only mean something there. */
  projectId: string;
  fields: CaseFieldDef[];
  suites: { path: string[]; description: string }[];
  cases: (TransferCase & { links: { file: string; title: string; project: string }[] })[];
}

// ---------------------------------------------------------------- CSV

const CSV_COLUMNS = [
  'key',
  'title',
  'suite',
  'status',
  'priority',
  'severity',
  'type',
  'behavior',
  'automation',
  'muted',
  'tags',
  'description',
  'preconditions',
  'postconditions',
  'steps_format',
  'steps',
] as const;

function csvCell(value: string): string {
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One step per line: `action | test data | expected result`, or `Given …` for Gherkin. */
export function stepsToText(format: CaseFields['stepsFormat'], steps: readonly CaseStep[]): string {
  return steps
    .map((s) => (format === 'gherkin' ? `${GHERKIN_KEYWORD_LABELS[s.keyword]} ${s.action}` : [s.action, s.data, s.expected].map((p) => p.replace(/\|/g, '/')).join(' | ').replace(/( \| )+$/, '')))
    .join('\n');
}

export function stepsFromText(format: CaseFields['stepsFormat'], text: string): CaseStep[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      if (format === 'gherkin') {
        const match = /^(given|when|then|and|but)\s+(.*)$/i.exec(line);
        const keyword = (match?.[1].toLowerCase() ?? 'and') as CaseStep['keyword'];
        return { action: match ? match[2] : line, data: '', expected: '', keyword: GHERKIN_KEYWORDS.includes(keyword) ? keyword : 'and' };
      }
      const [action = '', data = '', expected = ''] = line.split('|').map((p) => p.trim());
      return { action, data, expected, keyword: 'given' as const };
    });
}

export function toCsv(doc: ExportDocument): string {
  const fieldKeys = doc.fields.map((f) => f.key);
  const header = [...CSV_COLUMNS, ...fieldKeys.map((k) => `field:${k}`)];
  const rows = doc.cases.map((c) => [
    c.key ?? '',
    c.title,
    c.suite.join(' / '),
    c.status,
    c.priority,
    c.severity,
    c.type,
    c.behavior,
    c.automation,
    c.muted ? 'yes' : 'no',
    c.tags.join(', '),
    c.description,
    c.preconditions,
    c.postconditions,
    c.stepsFormat,
    stepsToText(c.stepsFormat, c.steps),
    ...fieldKeys.map((k) => {
      const v = c.customFields[k];
      return v === null || v === undefined ? '' : String(v);
    }),
  ]);
  return [header, ...rows].map((r) => r.map((v) => csvCell(String(v))).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180: quoted fields, doubled quotes, line breaks inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------- lenient values

function normalize(v: string): string {
  return v.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Finds an enum value by its value or its label, case- and spacing-insensitively. */
function lookup<T extends string>(labels: Record<T, string>, raw: string, aliases: Record<string, T> = {}): T | undefined {
  const n = normalize(raw);
  if (!n) return undefined;
  if (aliases[n]) return aliases[n];
  for (const [value, label] of Object.entries(labels) as [T, string][]) {
    if (normalize(value) === n || normalize(label) === n) return value;
  }
  return undefined;
}

const PRIORITY_ALIASES = { p0: 'critical', p1: 'high', p2: 'medium', p3: 'low', '1 critical': 'critical', '2 high': 'high', '3 medium': 'medium', '4 low': 'low', 'not set': 'none', '': 'none' } as const;
const STATUS_ALIASES = { ready: 'active', approved: 'active', design: 'draft', obsolete: 'deprecated', archived: 'deprecated' } as const;
const AUTOMATION_ALIASES = { 'to be automated': 'planned', planned: 'planned', automatable: 'planned', yes: 'automated', no: 'manual', none: 'manual' } as const;
const TYPE_ALIASES = { 'end to end': 'e2e', e2e: 'e2e', other: 'other', 'automated': 'functional' } as const;

/** The header names a CSV may use for each of our columns (TestRail's included). */
const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  id: 'key',
  key: 'key',
  'case id': 'key',
  title: 'title',
  name: 'title',
  summary: 'title',
  suite: 'suite',
  section: 'suite',
  'section hierarchy': 'suite',
  folder: 'suite',
  path: 'suite',
  status: 'status',
  state: 'status',
  priority: 'priority',
  severity: 'severity',
  type: 'type',
  'case type': 'type',
  behavior: 'behavior',
  behaviour: 'behavior',
  automation: 'automation',
  'automation status': 'automation',
  'automation type': 'automation',
  muted: 'muted',
  tags: 'tags',
  labels: 'tags',
  description: 'description',
  goals: 'description',
  mission: 'description',
  preconditions: 'preconditions',
  'pre conditions': 'preconditions',
  postconditions: 'postconditions',
  'post conditions': 'postconditions',
  'steps format': 'steps_format',
  'step format': 'steps_format',
  steps: 'steps',
  'steps (step)': 'steps',
  'steps (text)': 'steps',
};

export interface ParsedImport {
  /** Set for our own JSON: the project whose keys the file uses. */
  projectId: string | null;
  cases: TransferCase[];
  /** Suite paths with their descriptions, from a JSON export. */
  suites: { path: string[]; description: string }[];
  errors: string[];
}

function suitePath(raw: string): string[] {
  return raw
    .split(/\s*(?:\/|>)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bool(raw: string): boolean {
  return ['yes', 'true', '1', 'x', 'muted'].includes(normalize(raw));
}

function fromCsv(text: string, defs: readonly CaseFieldDef[]): ParsedImport {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { projectId: null, cases: [], suites: [], errors: ['The file is empty.'] };
  const header = rows[0].map((h) => normalize(h));
  const columns = header.map((h) => HEADER_ALIASES[h] ?? (h.startsWith('field:') ? h : null));
  if (!columns.includes('title')) return { projectId: null, cases: [], suites: [], errors: ['The CSV needs a "title" column.'] };
  const fieldByKey = new Map(defs.map((d) => [d.key, d]));
  const fieldByLabel = new Map(defs.map((d) => [normalize(d.label), d]));
  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) errors.push(`Only the first ${MAX_IMPORT_ROWS} rows were read.`);
  const cases: TransferCase[] = [];
  body.slice(0, MAX_IMPORT_ROWS).forEach((cells, i) => {
    const get = (col: string) => {
      const at = columns.indexOf(col as never);
      return at >= 0 ? (cells[at] ?? '').trim() : '';
    };
    const title = get('title');
    if (!title) {
      errors.push(`Row ${i + 2}: A test case needs a title.`);
      return;
    }
    const format = normalize(get('steps_format')) === 'gherkin' ? 'gherkin' : 'classic';
    const customFields: Record<string, CustomFieldValue> = {};
    header.forEach((h, at) => {
      const def = h.startsWith('field:') ? fieldByKey.get(h.slice(6).replace(/ /g, '_')) : fieldByLabel.get(h);
      if (def && cells[at]?.trim()) customFields[def.key] = cells[at].trim();
    });
    cases.push({
      ...CASE_DEFAULTS,
      key: get('key') || null,
      title: title.slice(0, 500),
      suite: suitePath(get('suite')),
      status: lookup(CASE_STATUS_LABELS, get('status'), STATUS_ALIASES) ?? CASE_DEFAULTS.status,
      priority: lookup(CASE_PRIORITY_LABELS, get('priority'), PRIORITY_ALIASES) ?? CASE_DEFAULTS.priority,
      severity: lookup(CASE_SEVERITY_LABELS, get('severity')) ?? CASE_DEFAULTS.severity,
      type: lookup(CASE_TYPE_LABELS, get('type'), TYPE_ALIASES) ?? CASE_DEFAULTS.type,
      behavior: lookup(CASE_BEHAVIOR_LABELS, get('behavior')) ?? CASE_DEFAULTS.behavior,
      automation: lookup(CASE_AUTOMATION_LABELS, get('automation'), AUTOMATION_ALIASES) ?? CASE_DEFAULTS.automation,
      muted: bool(get('muted')),
      tags: get('tags')
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      description: get('description'),
      preconditions: get('preconditions'),
      postconditions: get('postconditions'),
      stepsFormat: format,
      steps: stepsFromText(format, get('steps')),
      customFields,
    });
  });
  return { projectId: null, cases, suites: [], errors };
}

const jsonCase = z
  .object({
    key: z.string().nullable().optional(),
    title: z.string(),
    suite: z.array(z.string()).default([]),
  })
  .passthrough();

const jsonDocument = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  projectId: z.string().optional(),
  suites: z.array(z.object({ path: z.array(z.string()), description: z.string().default('') })).default([]),
  cases: z.array(jsonCase),
});

function fromJson(text: string): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { projectId: null, cases: [], suites: [], errors: ['The JSON file could not be read.'] };
  }
  const parsed = jsonDocument.safeParse(data);
  if (!parsed.success) return { projectId: null, cases: [], suites: [], errors: [`This is not a test case export (${EXPORT_FORMAT}, version 1).`] };
  const errors: string[] = [];
  if (parsed.data.cases.length > MAX_IMPORT_ROWS) errors.push(`Only the first ${MAX_IMPORT_ROWS} cases were read.`);
  const cases = parsed.data.cases.slice(0, MAX_IMPORT_ROWS).map((c) => {
    const { links: _links, ...rest } = c as Record<string, unknown>;
    return { ...CASE_DEFAULTS, ...rest, key: (c.key as string | null | undefined) ?? null, suite: c.suite } as TransferCase;
  });
  return { projectId: parsed.data.projectId ?? null, cases, suites: parsed.data.suites, errors };
}

/** Reads an uploaded file by its content: JSON when it looks like JSON, CSV otherwise. */
export function parseImport(file: { name: string; text: string }, defs: readonly CaseFieldDef[]): ParsedImport {
  const trimmed = file.text.trimStart();
  if (trimmed.startsWith('{') || /\.json$/i.test(file.name)) return fromJson(file.text);
  return fromCsv(file.text, defs);
}

/** The number a file's key names, if any. */
export function importedNumber(key: string | null): number | null {
  return key ? parseCaseKey(key) : null;
}

export { caseKey };
