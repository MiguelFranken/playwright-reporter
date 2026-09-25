/**
 * The data retention policy: how long this database keeps run history and
 * the rows around it. Pure — parsing, defaults and cutoffs — so the rules are
 * unit tested apart from the database and the sweep that applies them.
 *
 * Separate from the artifact retention policy (`lib/storage/retention`),
 * which decides how long the *bytes* in the store live. Deleting a run takes
 * its artifacts with it, so the run lifetime is an upper bound for theirs.
 */

export const MIN_DAYS = 1;
export const MAX_DAYS = 3650;
export const MAX_KEEP_LATEST = 10_000;

export const DEFAULT_RUN_DAYS = 90;
export const DEFAULT_KEEP_LATEST = 20;
export const DEFAULT_EVENT_DAYS = 7;

export interface DataRetentionPolicy {
  /** Off keeps every row forever: the sweep deletes nothing. */
  enabled: boolean;
  /** Finished runs that started longer ago than this are deleted, with everything under them. */
  runDays: number;
  /** The newest runs of every project that are kept whatever their age, so a quiet project keeps its history. */
  keepLatestRuns: number;
  /** The live event log of a finished run is only read while it runs; it goes after this many days. */
  eventDays: number;
  /** Audit entries older than this are deleted. `null` keeps the audit log forever. */
  auditDays: number | null;
  /** Deletes what has already expired: sessions, verifications, OAuth codes and tokens, invitations, old sweep logs. */
  housekeeping: boolean;
}

export type PolicySource = 'saved' | 'environment' | 'default';

export const DEFAULT_POLICY: DataRetentionPolicy = {
  enabled: false,
  runDays: DEFAULT_RUN_DAYS,
  keepLatestRuns: DEFAULT_KEEP_LATEST,
  eventDays: DEFAULT_EVENT_DAYS,
  auditDays: null,
  housekeeping: true,
};

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function parseDays(value: unknown): number | undefined {
  const n = toNumber(value);
  return n !== undefined && n > 0 ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(n))) : undefined;
}

function parseKeep(value: unknown): number | undefined {
  const n = toNumber(value);
  return n !== undefined && n >= 0 ? Math.min(MAX_KEEP_LATEST, Math.round(n)) : undefined;
}

/**
 * The policy before a superadmin saves one. Off, so an upgrade never deletes
 * anything by itself — unless the deployment opts in with
 * `DATA_RETENTION_DAYS`, the run lifetime, for setups configured by manifest.
 */
export function environmentPolicy(env: Record<string, string | undefined> = process.env): {
  policy: DataRetentionPolicy;
  source: PolicySource;
} {
  const days = parseDays(env.DATA_RETENTION_DAYS);
  if (days === undefined) return { policy: { ...DEFAULT_POLICY }, source: 'default' };
  return { policy: { ...DEFAULT_POLICY, enabled: true, runDays: days }, source: 'environment' };
}

/** A stored value, made safe: missing or nonsense fields fall back to the defaults. */
export function normalizePolicy(value: unknown): DataRetentionPolicy | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const runDays = parseDays(v.runDays);
  if (runDays === undefined) return null;
  return {
    enabled: v.enabled === true,
    runDays,
    keepLatestRuns: parseKeep(v.keepLatestRuns) ?? DEFAULT_KEEP_LATEST,
    eventDays: parseDays(v.eventDays) ?? DEFAULT_EVENT_DAYS,
    auditDays: v.auditDays === null || v.auditDays === undefined ? null : (parseDays(v.auditDays) ?? null),
    housekeeping: v.housekeeping !== false,
  };
}

const DAY_MS = 86_400_000;

export interface Cutoffs {
  /** Runs that started before this may go. */
  runs: Date;
  /** Events of runs that finished before this go. */
  events: Date;
  /** Audit entries created before this go; `null` keeps them. */
  audit: Date | null;
}

export function cutoffs(policy: DataRetentionPolicy, now: Date = new Date()): Cutoffs {
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return {
    runs: ago(policy.runDays),
    // The event log never outlives its run.
    events: ago(Math.min(policy.eventDays, policy.runDays)),
    audit: policy.auditDays === null ? null : ago(policy.auditDays),
  };
}

/**
 * Reads a form's fields: `enabled` and `housekeeping` (checkboxes),
 * `runDays`, `keepLatestRuns`, `eventDays` and `auditDays` (blank keeps the
 * audit log forever). Returns an error message for the user, or the policy.
 */
export function policyFromForm(form: { get(name: string): FormDataEntryValue | null }): DataRetentionPolicy | string {
  const text = (name: string) => {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : '';
  };
  const checked = (name: string) => {
    const v = form.get(name);
    return v === 'on' || v === 'true';
  };
  const whole = (s: string) => /^\d+$/.test(s);
  const days = (s: string) => whole(s) && Number(s) >= MIN_DAYS && Number(s) <= MAX_DAYS;
  const range = `between ${MIN_DAYS} and ${MAX_DAYS}`;

  const runDays = text('runDays');
  if (!days(runDays)) return `Keep runs for a whole number of days ${range}.`;
  const keep = text('keepLatestRuns');
  if (!whole(keep) || Number(keep) > MAX_KEEP_LATEST) return `Keep the latest 0 to ${MAX_KEEP_LATEST.toLocaleString('en-US')} runs per project.`;
  const eventDays = text('eventDays');
  if (!days(eventDays)) return `Keep live events for a whole number of days ${range}.`;
  const auditDays = text('auditDays');
  if (auditDays !== '' && !days(auditDays)) return `The audit log lifetime must be blank or a whole number of days ${range}.`;

  return {
    enabled: checked('enabled'),
    runDays: Number(runDays),
    keepLatestRuns: Number(keep),
    eventDays: Number(eventDays),
    auditDays: auditDays === '' ? null : Number(auditDays),
    housekeeping: checked('housekeeping'),
  };
}

// ---------------------------------------------------------------- series

export interface IngestDay {
  /** `YYYY-MM-DD`, UTC. */
  day: string;
  runs: number;
  results: number;
  attempts: number;
  artifactBytes: number;
}

/**
 * The last `days` UTC days ending today, oldest first, with a zero row for
 * every day nothing was ingested: a chart of only the busy days would squeeze
 * a quiet week into nothing and read as steady traffic.
 */
export function fillDays(rows: readonly IngestDay[], days: number, now: Date = new Date()): IngestDay[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: IngestDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today - i * DAY_MS).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, runs: 0, results: 0, attempts: 0, artifactBytes: 0 });
  }
  return out;
}
