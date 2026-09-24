/**
 * The artifact retention policy: how many days each kind of attachment keeps
 * its bytes. Pure — parsing, defaults and cutoffs — so the rules are unit
 * tested apart from the database and the sweep that applies them.
 */

import { attachmentKindSchema, type AttachmentKind } from '@miguelfranken/protocol';

export type { AttachmentKind };
export const ATTACHMENT_KINDS = attachmentKindSchema.options;

export const MIN_RETENTION_DAYS = 1;
export const MAX_RETENTION_DAYS = 3650;
export const DEFAULT_RETENTION_DAYS = 30;

export interface RetentionPolicy {
  /** Off keeps every artifact forever: nothing is deleted or marked. */
  enabled: boolean;
  /** Days an artifact is kept, unless its kind overrides it. */
  days: number;
  /** Per-kind lifetimes, e.g. videos and traces (the big ones) shorter than screenshots. */
  overrides: Partial<Record<AttachmentKind, number>>;
}

export type PolicySource = 'saved' | 'environment' | 'default';

function clampDays(n: number) {
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, Math.round(n)));
}

function parseDays(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? clampDays(n) : undefined;
}

/**
 * The policy before a superadmin saves one. Off, so an upgrade never deletes
 * anything by itself — unless the deployment opts in with
 * `ARTIFACT_RETENTION_DAYS`, which self-hosted setups can set in their
 * manifests instead of clicking through the admin UI.
 */
export function environmentPolicy(env: Record<string, string | undefined> = process.env): { policy: RetentionPolicy; source: PolicySource } {
  const days = parseDays(env.ARTIFACT_RETENTION_DAYS);
  if (days === undefined) return { policy: { enabled: false, days: DEFAULT_RETENTION_DAYS, overrides: {} }, source: 'default' };
  return { policy: { enabled: true, days, overrides: {} }, source: 'environment' };
}

/** A stored or submitted value, made safe: unknown kinds and nonsense days are dropped. */
export function normalizePolicy(value: unknown): RetentionPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const days = parseDays(v.days);
  if (days === undefined) return null;
  const overrides: RetentionPolicy['overrides'] = {};
  const raw = v.overrides && typeof v.overrides === 'object' ? (v.overrides as Record<string, unknown>) : {};
  for (const kind of ATTACHMENT_KINDS) {
    const d = parseDays(raw[kind]);
    if (d !== undefined && d !== days) overrides[kind] = d;
  }
  return { enabled: v.enabled === true, days, overrides };
}

export function daysFor(policy: RetentionPolicy, kind: AttachmentKind): number {
  return policy.overrides[kind] ?? policy.days;
}

/**
 * The kinds grouped by the cutoff they share: an artifact created before its
 * group's cutoff has expired. Grouping keeps the sweep's `where` to one
 * clause per distinct lifetime, not one per kind.
 */
export function cutoffs(policy: RetentionPolicy, now: Date = new Date()): { before: Date; kinds: AttachmentKind[] }[] {
  const byDays = new Map<number, AttachmentKind[]>();
  for (const kind of ATTACHMENT_KINDS) {
    const d = daysFor(policy, kind);
    byDays.set(d, [...(byDays.get(d) ?? []), kind]);
  }
  return [...byDays.entries()]
    .sort(([a], [b]) => a - b)
    .map(([days, kinds]) => ({ before: new Date(now.getTime() - days * 86_400_000), kinds }));
}

/** When an artifact's bytes go away under this policy, or null when they are kept. */
export function expiresAt(policy: RetentionPolicy, kind: AttachmentKind, createdAt: Date): Date | null {
  if (!policy.enabled) return null;
  return new Date(createdAt.getTime() + daysFor(policy, kind) * 86_400_000);
}

/**
 * Reads a form's fields: `enabled` (checkbox), `days`, and `days.<kind>`
 * (blank inherits the default). Returns an error message for the user, or the
 * policy to save.
 */
export function policyFromForm(form: { get(name: string): FormDataEntryValue | null }): RetentionPolicy | string {
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : '';
  };
  const valid = (s: string) => /^\d+$/.test(s) && Number(s) >= MIN_RETENTION_DAYS && Number(s) <= MAX_RETENTION_DAYS;
  const range = `between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`;

  const days = text('days');
  if (!valid(days)) return `Keep artifacts for a whole number of days ${range}.`;
  const overrides: RetentionPolicy['overrides'] = {};
  for (const kind of ATTACHMENT_KINDS) {
    const d = text(`days.${kind}`);
    if (d === '') continue;
    if (!valid(d)) return `The ${kind} lifetime must be blank or a whole number of days ${range}.`;
    if (Number(d) !== Number(days)) overrides[kind] = Number(d);
  }
  const enabled = form.get('enabled');
  return { enabled: enabled === 'on' || enabled === 'true', days: Number(days), overrides };
}
