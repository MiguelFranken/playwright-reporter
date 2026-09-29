/**
 * The vocabulary of test case management: every classification a case can
 * carry, in display order, with its label. The app builds its Postgres enums
 * and zod schemas from these lists, so a value added here is a migration there.
 */

export const CASE_STATUSES = ['active', 'draft', 'deprecated'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  deprecated: 'Deprecated',
};

export const CASE_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];
export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'Not set',
};

export const CASE_SEVERITIES = ['blocker', 'critical', 'major', 'normal', 'minor', 'trivial', 'none'] as const;
export type CaseSeverity = (typeof CASE_SEVERITIES)[number];
export const CASE_SEVERITY_LABELS: Record<CaseSeverity, string> = {
  blocker: 'Blocker',
  critical: 'Critical',
  major: 'Major',
  normal: 'Normal',
  minor: 'Minor',
  trivial: 'Trivial',
  none: 'Not set',
};

export const CASE_TYPES = [
  'functional',
  'smoke',
  'regression',
  'integration',
  'e2e',
  'api',
  'unit',
  'performance',
  'security',
  'accessibility',
  'usability',
  'compatibility',
  'acceptance',
  'exploratory',
  'other',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  functional: 'Functional',
  smoke: 'Smoke',
  regression: 'Regression',
  integration: 'Integration',
  e2e: 'End-to-end',
  api: 'API',
  unit: 'Unit',
  performance: 'Performance',
  security: 'Security',
  accessibility: 'Accessibility',
  usability: 'Usability',
  compatibility: 'Compatibility',
  acceptance: 'Acceptance',
  exploratory: 'Exploratory',
  other: 'Other',
};

export const CASE_BEHAVIORS = ['positive', 'negative', 'destructive', 'none'] as const;
export type CaseBehavior = (typeof CASE_BEHAVIORS)[number];
export const CASE_BEHAVIOR_LABELS: Record<CaseBehavior, string> = {
  positive: 'Positive',
  negative: 'Negative',
  destructive: 'Destructive',
  none: 'Not set',
};

/**
 * `automated` is what a link to a Playwright test earns; a case marked
 * automated by hand without one is shown as unverified.
 */
export const CASE_AUTOMATIONS = ['manual', 'planned', 'automated'] as const;
export type CaseAutomation = (typeof CASE_AUTOMATIONS)[number];
export const CASE_AUTOMATION_LABELS: Record<CaseAutomation, string> = {
  manual: 'Manual',
  planned: 'To be automated',
  automated: 'Automated',
};

export const STEP_FORMATS = ['classic', 'gherkin'] as const;
export type StepFormat = (typeof STEP_FORMATS)[number];
export const STEP_FORMAT_LABELS: Record<StepFormat, string> = { classic: 'Classic', gherkin: 'Gherkin' };

export const GHERKIN_KEYWORDS = ['given', 'when', 'then', 'and', 'but'] as const;
export type GherkinKeyword = (typeof GHERKIN_KEYWORDS)[number];
export const GHERKIN_KEYWORD_LABELS: Record<GherkinKeyword, string> = {
  given: 'Given',
  when: 'When',
  then: 'Then',
  and: 'And',
  but: 'But',
};

/**
 * One step, in either format. Gherkin reads `keyword` and `action`; classic
 * reads `action`, `data` and `expected`. Switching formats keeps the text.
 */
export interface CaseStep {
  action: string;
  data: string;
  expected: string;
  keyword: GherkinKeyword;
}

export const LINK_SOURCES = ['manual', 'code'] as const;
export type LinkSource = (typeof LINK_SOURCES)[number];
export const LINK_SOURCE_LABELS: Record<LinkSource, string> = {
  manual: 'Linked by hand',
  code: 'Linked from code',
};

export const FIELD_KINDS = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];
export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  checkbox: 'Checkbox',
};

/** A custom field as the editor and the detail page render it. */
export interface CaseFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  options: string[];
  required: boolean;
}

export type CustomFieldValue = string | number | boolean | null;

/**
 * What the linked Playwright tests say about a case, computed from their runs:
 * `none` without links, `stale` when none of them ran recently.
 */
export const CASE_VERDICTS = ['passing', 'failing', 'flaky', 'stale', 'not_run', 'none'] as const;
export type CaseVerdict = (typeof CASE_VERDICTS)[number];
export const CASE_VERDICT_LABELS: Record<CaseVerdict, string> = {
  passing: 'Passing',
  failing: 'Failing',
  flaky: 'Flaky',
  stale: 'Stale',
  not_run: 'Not run yet',
  none: 'No linked tests',
};

/** Suites nest at most this deep, the root level included. */
export const MAX_SUITE_DEPTH = 6;
/** Bulk actions take at most this many cases at once. */
export const MAX_BULK_CASES = 200;

export function caseKey(number: number): string {
  return `TC-${number}`;
}

export function labelItems<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({ value, label: labels[value] }));
}
