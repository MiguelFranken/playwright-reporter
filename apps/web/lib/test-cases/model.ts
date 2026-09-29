/**
 * The rules of a test case, free of the database: what a valid case, step and
 * suite look like, how `TC-12` is read, how a Playwright test names the cases
 * it covers, and how two versions of a case differ. Every write path (server
 * actions, MCP tools, import) validates through these schemas.
 */
import { z } from 'zod';
import type { Annotation } from '@miguelfranken/protocol';
import {
  CASE_AUTOMATIONS,
  CASE_BEHAVIORS,
  CASE_PRIORITIES,
  CASE_SEVERITIES,
  CASE_STATUSES,
  CASE_TYPES,
  FIELD_KINDS,
  GHERKIN_KEYWORDS,
  STEP_FORMATS,
  type CaseFieldDef,
  type CaseStep,
  type CustomFieldValue,
} from '@miguelfranken/ui/lib/test-cases';

export const LIMITS = {
  title: 500,
  description: 20_000,
  conditions: 5_000,
  steps: 100,
  stepText: 5_000,
  tags: 30,
  tag: 60,
  suiteName: 200,
  suiteDescription: 2_000,
  fields: 30,
  fieldLabel: 80,
  fieldOptions: 30,
  fieldValue: 5_000,
  linksPerCase: 50,
} as const;

const trimmed = (max: number) => z.string().trim().max(max);

export const stepSchema = z.object({
  action: trimmed(LIMITS.stepText),
  data: trimmed(LIMITS.stepText).default(''),
  expected: trimmed(LIMITS.stepText).default(''),
  keyword: z.enum(GHERKIN_KEYWORDS).default('given'),
});

/** Steps with nothing in them are dropped rather than rejected: an editor always has a blank last row. */
export const stepsSchema = z
  .array(stepSchema)
  .max(LIMITS.steps)
  .transform((steps): CaseStep[] => steps.filter((s) => s.action || s.data || s.expected));

/** Tags are trimmed, stripped of a leading `@`, de-duplicated, and kept in the order given. */
export const tagsSchema = z
  .array(z.string())
  .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))])
  .pipe(z.array(z.string().max(LIMITS.tag)).max(LIMITS.tags));

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^@+/, '').replace(/\s+/g, '-');
}

export const customFieldsSchema = z.record(
  z.string().max(64),
  z.union([z.string().max(LIMITS.fieldValue), z.number().finite(), z.boolean(), z.null()]),
);

/** Every field a person edits. `suiteId: null` is "unassigned". */
export const caseFieldsSchema = z.object({
  title: trimmed(LIMITS.title).min(1, 'A test case needs a title.'),
  suiteId: z.uuid().nullable(),
  description: trimmed(LIMITS.description),
  preconditions: trimmed(LIMITS.conditions),
  postconditions: trimmed(LIMITS.conditions),
  stepsFormat: z.enum(STEP_FORMATS),
  steps: stepsSchema,
  status: z.enum(CASE_STATUSES),
  priority: z.enum(CASE_PRIORITIES),
  severity: z.enum(CASE_SEVERITIES),
  type: z.enum(CASE_TYPES),
  behavior: z.enum(CASE_BEHAVIORS),
  automation: z.enum(CASE_AUTOMATIONS),
  muted: z.boolean(),
  tags: tagsSchema,
  customFields: customFieldsSchema,
});
export type CaseFields = z.output<typeof caseFieldsSchema>;
export type CaseFieldsInput = z.input<typeof caseFieldsSchema>;

export const CASE_DEFAULTS: Omit<CaseFields, 'title' | 'suiteId'> = {
  description: '',
  preconditions: '',
  postconditions: '',
  stepsFormat: 'classic',
  steps: [],
  status: 'active',
  priority: 'none',
  severity: 'normal',
  type: 'functional',
  behavior: 'none',
  automation: 'manual',
  muted: false,
  tags: [],
  customFields: {},
};

/** A new case: the title is required, everything else falls back to the defaults. */
export const createCaseSchema = caseFieldsSchema.partial().required({ title: true });
/** An edit: any subset of the fields. */
export const updateCaseSchema = caseFieldsSchema.partial();

export const suiteFieldsSchema = z.object({
  name: trimmed(LIMITS.suiteName).min(1, 'A suite needs a name.'),
  description: trimmed(LIMITS.suiteDescription).default(''),
  parentId: z.uuid().nullable().default(null),
});

export const fieldDefSchema = z
  .object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, 'Keys are lowercase letters, digits and underscores, starting with a letter.'),
    label: trimmed(LIMITS.fieldLabel).min(1, 'A field needs a label.'),
    kind: z.enum(FIELD_KINDS),
    options: z.array(trimmed(LIMITS.fieldLabel).min(1)).max(LIMITS.fieldOptions).default([]),
    required: z.boolean().default(false),
  })
  .refine((f) => f.kind !== 'select' || f.options.length > 0, { message: 'A dropdown needs at least one option.', path: ['options'] })
  .transform((f) => ({ ...f, options: f.kind === 'select' ? [...new Set(f.options)] : [] }));
export type FieldDefInput = z.input<typeof fieldDefSchema>;

// ---------------------------------------------------------------- keys

/** Reads `TC-12`, `tc-12`, `#12` or `12` as case number 12. */
export function parseCaseKey(value: string): number | null {
  const match = /^\s*(?:tc-|#)?(\d{1,9})\s*$/i.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return n > 0 ? n : null;
}

/** Annotation types a Playwright test may use to name the case it covers. */
export const CASE_ANNOTATION_TYPES = ['test-case', 'testcase', 'tc', 'case'] as const;

/**
 * The case numbers a Playwright test names in its code: tags like `@TC-12`
 * and annotations like `{ type: 'test-case', description: 'TC-12, TC-13' }`.
 */
export function caseRefsFromTest(tags: readonly string[], annotations: readonly Annotation[]): number[] {
  const refs = new Set<number>();
  for (const tag of tags) {
    const match = /^@?tc-(\d{1,9})$/i.exec(tag.trim());
    if (match) refs.add(Number(match[1]));
  }
  for (const a of annotations) {
    if (!(CASE_ANNOTATION_TYPES as readonly string[]).includes(a.type.trim().toLowerCase())) continue;
    for (const part of (a.description ?? '').split(/[\s,;]+/)) {
      const n = parseCaseKey(part);
      if (n) refs.add(n);
    }
  }
  refs.delete(0);
  return [...refs].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- custom fields

/**
 * Keeps the values of fields the project defines, coerced to each field's
 * kind; unknown keys are dropped. Returns an error for a missing required one.
 */
export function coerceCustomFields(
  defs: readonly CaseFieldDef[],
  values: Record<string, CustomFieldValue>,
  { requireAll }: { requireAll: boolean },
): { ok: true; value: Record<string, CustomFieldValue> } | { ok: false; message: string } {
  const out: Record<string, CustomFieldValue> = {};
  for (const def of defs) {
    const raw = values[def.key];
    const value = coerce(def, raw);
    if (value === undefined) return { ok: false, message: `${def.label} is not a valid ${def.kind}.` };
    if (value === null) {
      if (requireAll && def.required) return { ok: false, message: `${def.label} is required.` };
      if (raw !== undefined) out[def.key] = null;
      continue;
    }
    out[def.key] = value;
  }
  return { ok: true, value: out };
}

function coerce(def: CaseFieldDef, raw: CustomFieldValue | undefined): CustomFieldValue | undefined {
  if (raw === undefined || raw === null || raw === '') return def.kind === 'checkbox' && raw !== undefined ? false : null;
  switch (def.kind) {
    case 'checkbox':
      return raw === true || raw === 'true' || raw === 'on' || raw === 1;
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date': {
      const s = String(raw).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined;
    }
    case 'select': {
      const s = String(raw).trim();
      return def.options.includes(s) ? s : undefined;
    }
    default:
      return String(raw).trim().slice(0, LIMITS.fieldValue) || null;
  }
}

// ---------------------------------------------------------------- versions

/** The fields a version snapshot keeps, in the order a diff lists them. */
export const VERSIONED_FIELDS = [
  'title',
  'suiteId',
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
  'stepsFormat',
  'steps',
  'customFields',
] as const satisfies readonly (keyof CaseFields)[];
export type VersionedField = (typeof VERSIONED_FIELDS)[number];
export type CaseSnapshot = Pick<CaseFields, VersionedField>;

export function snapshotOf(c: CaseSnapshot): CaseSnapshot {
  const out = {} as Record<VersionedField, unknown>;
  for (const f of VERSIONED_FIELDS) out[f] = structuredClone(c[f]);
  return out as CaseSnapshot;
}

/** The fields that differ between two snapshots (a missing field in an old snapshot counts as its default). */
export function changedFields(before: Partial<CaseSnapshot>, after: Partial<CaseSnapshot>): VersionedField[] {
  return VERSIONED_FIELDS.filter((f) => !sameValue(before[f] ?? defaultOf(f), after[f] ?? defaultOf(f)));
}

function defaultOf(f: VersionedField): unknown {
  if (f === 'title') return '';
  if (f === 'suiteId') return null;
  return CASE_DEFAULTS[f];
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  }
  return v;
}

/** Turns a failed zod parse into the one sentence a form shows. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'The test case is not valid.';
  const path = issue.path.join('.');
  return issue.message && !issue.message.startsWith('Invalid') ? issue.message : `${path || 'Value'}: ${issue.message}`;
}
