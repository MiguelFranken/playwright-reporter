import type { AttemptStatus, RunStatus, TestOutcome } from '@miguelfranken/protocol';

/**
 * The display vocabulary is wider than the wire's. It adds the three states the
 * UI needs but the protocol never sends as a status, and it accepts both
 * spellings of timed-out because `AttemptStatus` says `timedOut` while
 * `RunStatus` says `timedout`.
 */
export type AnyStatus =
  | RunStatus
  | TestOutcome
  | AttemptStatus
  | 'running'
  | 'flaky'
  | 'incomplete';

/**
 * Every outcome resolves to one of five semantic roles. Colour is never the only
 * carrier: each badge also ships a label and an icon.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Reliability grades, a separate four-step scale mapped onto the same tones. */
export type Grade = 'good' | 'warn' | 'bad' | 'muted';

const TONE: Record<string, Tone> = {
  running: 'info',
  passed: 'success',
  expected: 'success',
  failed: 'danger',
  unexpected: 'danger',
  flaky: 'warning',
  skipped: 'neutral',
  timedout: 'danger',
  timedOut: 'danger',
  interrupted: 'danger',
  incomplete: 'neutral',
};

const LABELS: Record<string, string> = {
  running: 'Running',
  passed: 'Passed',
  expected: 'Passed',
  failed: 'Failed',
  unexpected: 'Failed',
  flaky: 'Flaky',
  skipped: 'Skipped',
  timedout: 'Timed out',
  timedOut: 'Timed out',
  interrupted: 'Interrupted',
  // Stored as `incomplete`: the reporter went silent and the run was closed.
  incomplete: 'Abandoned',
};

/** Subtle background + matching hairline + readable text, per role. */
export const toneBadge: Record<Tone, string> = {
  success: 'border-success-border bg-success-subtle text-success-text',
  warning: 'border-warning-border bg-warning-subtle text-warning-text',
  danger: 'border-danger-border bg-danger-subtle text-danger-text',
  info: 'border-info-border bg-info-subtle text-info-text',
  neutral: 'border-neutral-border bg-neutral-subtle text-neutral-text',
};

/** Text-only role colours, for numbers and inline counts. */
export const toneText: Record<Tone, string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
  neutral: 'text-muted-foreground',
};

/**
 * The unfilled remainder of a meter: a lighter step of the *same* ramp as the
 * fill, never a flat grey. State then reads across the whole bar rather than
 * only across the part that happens to be filled.
 */
export const toneTrack: Record<Tone, string> = {
  success: 'bg-success-subtle',
  warning: 'bg-warning-subtle',
  danger: 'bg-danger-subtle',
  info: 'bg-info-subtle',
  neutral: 'bg-neutral-subtle',
};

/** Solid fills, for dots, bars and sparkline cells. */
export const toneSolid: Record<Tone, string> = {
  success: 'bg-success-solid',
  warning: 'bg-warning-solid',
  danger: 'bg-danger-solid',
  info: 'bg-info-solid',
  neutral: 'bg-neutral-solid',
};

/** Reliability grades map onto the same roles the outcomes use. */
export const GRADE_TONE: Record<Grade, Tone> = {
  good: 'success',
  warn: 'warning',
  bad: 'danger',
  muted: 'neutral',
};

/** Text colour for a reliability grade. */
export const gradeText: Record<Grade, string> = {
  good: toneText.success,
  warn: toneText.warning,
  bad: toneText.danger,
  muted: toneText.neutral,
};

/** Badge colours for a reliability grade. */
export const gradeBadge: Record<Grade, string> = {
  good: toneBadge.success,
  warn: toneBadge.warning,
  bad: toneBadge.danger,
  muted: toneBadge.neutral,
};

export function statusTone(status: AnyStatus | string): Tone {
  return TONE[status] ?? 'neutral';
}

export function statusLabel(status: AnyStatus | string): string {
  return LABELS[status] ?? status;
}

/** Every known status, in the order the catalogue shows them. */
export const ALL_STATUSES: AnyStatus[] = [
  'running',
  'passed',
  'expected',
  'failed',
  'unexpected',
  'flaky',
  'skipped',
  'timedout',
  'timedOut',
  'interrupted',
  'incomplete',
];

/** Kept for callers that only need the fill class of an outcome. */
export const statusDot: Record<string, string> = Object.fromEntries(
  Object.entries(TONE).map(([status, tone]) => [status, toneSolid[tone]]),
);
