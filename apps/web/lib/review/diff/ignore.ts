/**
 * The areas a checkpoint's variant leaves out of its comparisons — a clock,
 * a rotating ad, a generated name — as rules with a history. Saved per
 * checkpoint and variant (not per capture), so they hold for every later run;
 * a change measures the images again, as the options key changes with them.
 *
 * A rule records the image it was drawn on: on a later image of another size
 * it is suspended rather than applied somewhere else (`applicableRules`).
 * Every change makes a new revision; a caller that read revision 3 and
 * writes expecting 3 is refused when somebody saved 4 in between.
 */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { IGNORE_CATEGORIES, unionArea, type IgnoreCategory, type IgnoreGeometry, type IgnoreRule, type IgnoreSource } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures, reviewIgnoreRegions, reviewIgnoreRevisions, users } from '@/lib/db/schema';
import type { CaptureRecord } from '../queries';
import { diffImages, DiffTooLargeError } from './engine';
import { identityKey, type Identity, type Rect } from './lookup';
import { maxDiffPixels } from './store';

export const MAX_IGNORE_REGIONS = 20;
export const MAX_REASON_LENGTH = 500;
const MAX_COORD = 200_000;

export class IgnoreRegionsError extends Error {}

export class IgnoreRevisionConflict extends IgnoreRegionsError {
  constructor(
    readonly expected: number,
    readonly current: number,
  ) {
    super(`The rules changed since you read them (revision ${current} now, ${expected} expected). Read them again before saving.`);
  }
}

/** Whole, non-negative rectangles of at least one pixel; anything else is refused. */
export function parseIgnoreRegions(input: unknown): Rect[] {
  if (!Array.isArray(input)) throw new IgnoreRegionsError('Regions must be a list.');
  if (input.length > MAX_IGNORE_REGIONS) throw new IgnoreRegionsError(`At most ${MAX_IGNORE_REGIONS} areas.`);
  return input.map((r) => {
    const v = r as Record<string, unknown>;
    const [x, y, width, height] = [v?.x, v?.y, v?.width, v?.height].map((n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : NaN));
    if ([x, y, width, height].some((n) => Number.isNaN(n) || n < 0 || n > MAX_COORD) || width < 1 || height < 1) throw new IgnoreRegionsError('Each area needs a position and a size in pixels.');
    return { x, y, width, height };
  });
}

/** What a caller may say about a rule it saves: a rectangle, and optionally its id (to keep), reason, category and state. */
export interface RuleInput extends Rect {
  id?: string | null;
  reason?: string | null;
  category?: IgnoreCategory | null;
  active?: boolean;
}

/** Rules as posted (by the editor, the API or an accepted suggestion), checked. */
export function parseRuleInputs(input: unknown): RuleInput[] {
  const rects = parseIgnoreRegions(input);
  return rects.map((rect, i) => {
    const v = (input as Record<string, unknown>[])[i];
    const id = typeof v.id === 'string' && /^[\w-]{1,64}$/.test(v.id) ? v.id : null;
    const reason = typeof v.reason === 'string' ? v.reason.trim().slice(0, MAX_REASON_LENGTH) || null : null;
    const category = (IGNORE_CATEGORIES as readonly string[]).includes(String(v.category)) ? (v.category as IgnoreCategory) : null;
    const active = typeof v.active === 'boolean' ? v.active : true;
    return { ...rect, id, reason, category, active };
  });
}

/** The rules of a checkpoint and variant: every rule ever saved, the revision of the set, and whether any was. */
export interface RuleSet {
  rules: IgnoreRule[];
  revision: number;
  ever: boolean;
}

export const EMPTY_RULES: RuleSet = { rules: [], revision: 0, ever: false };

/** Rectangles saved without a history, as rules: applied unchecked, as they always were. */
export function legacyRules(regions: readonly Rect[], updatedAt: Date, revision = 1): RuleSet {
  return {
    rules: regions.map((r, i) => ({
      id: `legacy-${i + 1}`,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      reason: null,
      category: null,
      source: 'legacy' as const,
      active: true,
      createdAt: updatedAt.toISOString(),
      createdBy: null,
      geometry: null,
    })),
    revision,
    ever: true,
  };
}

type RuleRow = Pick<typeof reviewIgnoreRegions.$inferSelect, 'regions' | 'rules' | 'revision' | 'updatedAt'>;

export function ruleSetOf(row: RuleRow | null | undefined): RuleSet {
  if (!row) return EMPTY_RULES;
  if (!row.rules) return legacyRules(row.regions, row.updatedAt, row.revision);
  return { rules: row.rules, revision: row.revision, ever: true };
}

/** The rule sets of the identities, by `identityKey`. */
export async function rulesFor(identities: readonly Identity[]): Promise<Map<string, RuleSet>> {
  const out = new Map<string, RuleSet>();
  const unique = new Map(identities.map((i) => [identityKey(i), i]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((i) => sql`(${i.testId}::uuid, ${i.checkpointName}, ${i.variant})`);
  const rows = await db
    .select({
      testId: reviewIgnoreRegions.testId,
      checkpointName: reviewIgnoreRegions.checkpointName,
      variant: reviewIgnoreRegions.variant,
      regions: reviewIgnoreRegions.regions,
      rules: reviewIgnoreRegions.rules,
      revision: reviewIgnoreRegions.revision,
      updatedAt: reviewIgnoreRegions.updatedAt,
    })
    .from(reviewIgnoreRegions)
    .where(sql`(${reviewIgnoreRegions.testId}, ${reviewIgnoreRegions.checkpointName}, ${reviewIgnoreRegions.variant}) in (${sql.join(tuples, sql`, `)})`);
  for (const r of rows) out.set(identityKey(r), ruleSetOf(r));
  return out;
}

/**
 * A screen's rule set without a capture — for a set whose images are all
 * gone (retention, a renamed checkpoint): it can still be pruned. Answers
 * the set with a stand-in capture that has no image, so nothing can be
 * drawn on it. Null when the project has no rules for the screen.
 */
export async function rulesOfIdentity(projectId: string, identity: Identity) {
  const [row] = await db
    .select({ regions: reviewIgnoreRegions.regions, rules: reviewIgnoreRegions.rules, revision: reviewIgnoreRegions.revision, updatedAt: reviewIgnoreRegions.updatedAt })
    .from(reviewIgnoreRegions)
    .where(
      and(
        eq(reviewIgnoreRegions.projectId, projectId),
        eq(reviewIgnoreRegions.testId, identity.testId),
        eq(reviewIgnoreRegions.checkpointName, identity.checkpointName),
        eq(reviewIgnoreRegions.variant, identity.variant),
      ),
    );
  if (!row) return null;
  const capture = { id: '', ...identity, width: null, height: null, viewportWidth: null, viewportHeight: null, deviceScaleFactor: null };
  return { capture, ...ruleSetOf(row) };
}

/** The rule set of one capture's checkpoint and variant, with the capture; null when the capture is not in the project. */
export async function rulesOfCapture(projectId: string, captureId: string) {
  const [capture] = await db
    .select({
      id: reviewCaptures.id,
      testId: reviewCaptures.testId,
      checkpointName: reviewCaptures.checkpointName,
      variant: reviewCaptures.variant,
      width: reviewCaptures.width,
      height: reviewCaptures.height,
      viewportWidth: reviewCaptures.viewportWidth,
      viewportHeight: reviewCaptures.viewportHeight,
      deviceScaleFactor: reviewCaptures.deviceScaleFactor,
    })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId)));
  if (!capture) return null;
  const set = (await rulesFor([capture])).get(identityKey(capture)) ?? EMPTY_RULES;
  return { capture, ...set };
}

export interface SetRulesInput {
  projectId: string;
  /** The capture the rules are drawn on: its identity gets the rules, its geometry is recorded on new ones. */
  capture: Pick<CaptureRecord, 'id' | 'testId' | 'checkpointName' | 'variant' | 'width' | 'height' | 'viewportWidth' | 'viewportHeight' | 'deviceScaleFactor'>;
  /** The whole set after the change, or how to make it from the set as saved (read under the row lock, so a merge cannot lose a concurrent write). */
  rules: readonly RuleInput[] | ((current: RuleSet) => readonly RuleInput[]);
  /** The revision the caller read; the write is refused when it moved. Omit to overwrite whatever is there. */
  expectedRevision?: number | null;
  reason?: string | null;
  source: 'app' | 'mcp' | 'api' | 'ai_suggestion' | 'migration';
  userId: string | null;
  /** On rules accepted from an analysis: which one. */
  analysisId?: string | null;
}

/**
 * Replaces the rule set of the capture's checkpoint and variant atomically:
 * rules posted with a known id keep their id, origin and reason (unless a
 * new one is given); new rectangles become rules drawn on this capture.
 * Writes the new revision to the history and answers the new set.
 */
export async function setRules(input: SetRulesInput): Promise<RuleSet> {
  if (typeof input.rules !== 'function' && input.rules.length > MAX_IGNORE_REGIONS) throw new IgnoreRegionsError(`At most ${MAX_IGNORE_REGIONS} areas.`);
  const { capture } = input;
  const [author] = input.userId ? await db.select({ name: users.name }).from(users).where(eq(users.id, input.userId)) : [];
  const geometry: IgnoreGeometry | null =
    capture.width && capture.height
      ? { imageWidth: capture.width, imageHeight: capture.height, originCaptureId: capture.id, viewportWidth: capture.viewportWidth, viewportHeight: capture.viewportHeight, deviceScaleFactor: capture.deviceScaleFactor }
      : null;
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(reviewIgnoreRegions)
      .where(and(eq(reviewIgnoreRegions.testId, capture.testId), eq(reviewIgnoreRegions.checkpointName, capture.checkpointName), eq(reviewIgnoreRegions.variant, capture.variant)))
      .for('update');
    const current = ruleSetOf(existing);
    if (input.expectedRevision != null && input.expectedRevision !== current.revision) throw new IgnoreRevisionConflict(input.expectedRevision, current.revision);
    const wanted = typeof input.rules === 'function' ? input.rules(current) : input.rules;
    if (wanted.length > MAX_IGNORE_REGIONS) throw new IgnoreRegionsError(`At most ${MAX_IGNORE_REGIONS} areas.`);
    const byId = new Map(current.rules.map((r) => [r.id, r]));
    const now = new Date().toISOString();
    const source: IgnoreSource = input.source === 'ai_suggestion' ? 'ai_suggestion' : 'manual';
    const next: IgnoreRule[] = wanted.map((r) => {
      const kept = r.id ? byId.get(r.id) : undefined;
      const sameRect = kept && kept.x === r.x && kept.y === r.y && kept.width === r.width && kept.height === r.height;
      return {
        id: kept?.id ?? randomUUID(),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        reason: r.reason ?? kept?.reason ?? null,
        category: r.category ?? kept?.category ?? null,
        source: kept?.source ?? source,
        active: r.active ?? kept?.active ?? true,
        createdAt: kept?.createdAt ?? now,
        createdBy: kept?.createdBy ?? author?.name ?? null,
        analysisId: kept?.analysisId ?? input.analysisId ?? null,
        // A moved rectangle is a new drawing on this image.
        geometry: kept && sameRect ? kept.geometry : geometry,
      };
    });
    // Compared as values: jsonb hands the saved rules back with their keys in another order.
    const unchanged = existing && isDeepStrictEqual(current.rules, next);
    if (unchanged) return current;
    const revision = current.revision + 1;
    const regions = next.filter((r) => r.active).map(({ x, y, width, height }) => ({ x, y, width, height }));
    await tx
      .insert(reviewIgnoreRegions)
      .values({ id: randomUUID(), projectId: input.projectId, testId: capture.testId, checkpointName: capture.checkpointName, variant: capture.variant, regions, rules: next, revision, updatedBy: input.userId })
      .onConflictDoUpdate({
        target: [reviewIgnoreRegions.testId, reviewIgnoreRegions.checkpointName, reviewIgnoreRegions.variant],
        set: { regions, rules: next, revision, updatedBy: input.userId, updatedAt: sql`now()` },
      });
    await tx.insert(reviewIgnoreRevisions).values({
      id: randomUUID(),
      projectId: input.projectId,
      testId: capture.testId,
      checkpointName: capture.checkpointName,
      variant: capture.variant,
      revision,
      rules: next,
      reason: input.reason?.trim().slice(0, MAX_REASON_LENGTH) || null,
      source: input.source,
      changedBy: input.userId,
    });
    return { rules: next, revision, ever: true };
  });
}

/**
 * The editor's save, as before: rectangles for a capture's checkpoint and
 * variant. Rules the editor kept (same id) keep their history; new ones are
 * drawn on this capture. Null when the capture is not in the project.
 */
export async function setIgnoreRegions(projectId: string, captureId: string, rules: readonly RuleInput[], userId: string | null, opts: { expectedRevision?: number | null; reason?: string | null; source?: SetRulesInput['source'] } = {}) {
  const found = await rulesOfCapture(projectId, captureId);
  if (!found) return null;
  const set = await setRules({ projectId, capture: found.capture, rules, expectedRevision: opts.expectedRevision, reason: opts.reason, source: opts.source ?? 'app', userId });
  return { capture: found.capture, ...set };
}

export interface RulePatch {
  /** New rectangles. One the same as a rule already there is not added twice, so a retried call changes nothing. */
  add?: readonly RuleInput[];
  /** Ids of rules to remove (kept in the history). */
  remove?: readonly string[];
  /** Ids of rules to switch off (kept, not applied) or back on. */
  deactivate?: readonly string[];
  activate?: readonly string[];
}

/**
 * A set with rules added and removed, every other rule as it was — the
 * change an assistant means by "also leave this name out", without
 * re-sending (and possibly dropping) the rules it did not touch.
 */
export function patchRules(current: RuleSet, patch: RulePatch): RuleInput[] {
  const remove = new Set(patch.remove ?? []);
  const off = new Set(patch.deactivate ?? []);
  const on = new Set(patch.activate ?? []);
  const named = [...remove, ...off, ...on];
  const unknown = [...new Set(named)].filter((id) => !current.rules.some((r) => r.id === id));
  if (unknown.length) throw new IgnoreRegionsError(`No rule ${unknown.join(', ')} in this set. Read the rules again.`);
  if (new Set(named).size !== named.length) throw new IgnoreRegionsError('Name each rule once: to remove, to switch off or to switch on.');
  const kept: RuleInput[] = current.rules
    .filter((r) => !remove.has(r.id))
    .map(({ id, x, y, width, height, active }) => ({ id, x, y, width, height, active: off.has(id) ? false : on.has(id) ? true : active }));
  const same = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const added: RuleInput[] = [];
  for (const r of patch.add ?? []) if (![...kept, ...added].some((k) => k.active !== false && same(k, r))) added.push({ ...r, id: null, active: true });
  return [...kept, ...added];
}

/** The history of a checkpoint and variant's rules, newest first. */
export async function ruleHistory(projectId: string, identity: Identity, limit = 50) {
  return db
    .select({ revision: reviewIgnoreRevisions.revision, rules: reviewIgnoreRevisions.rules, reason: reviewIgnoreRevisions.reason, source: reviewIgnoreRevisions.source, changedBy: users.name, createdAt: reviewIgnoreRevisions.createdAt })
    .from(reviewIgnoreRevisions)
    .leftJoin(users, eq(users.id, reviewIgnoreRevisions.changedBy))
    .where(and(eq(reviewIgnoreRevisions.projectId, projectId), eq(reviewIgnoreRevisions.testId, identity.testId), eq(reviewIgnoreRevisions.checkpointName, identity.checkpointName), eq(reviewIgnoreRevisions.variant, identity.variant)))
    .orderBy(sql`${reviewIgnoreRevisions.revision} desc`)
    .limit(limit);
}

/** Every checkpoint and variant of a project with rules, with the set. */
export async function listRuleSets(projectId: string) {
  const rows = await db
    .select()
    .from(reviewIgnoreRegions)
    .where(eq(reviewIgnoreRegions.projectId, projectId))
    .orderBy(sql`${reviewIgnoreRegions.updatedAt} desc`);
  return rows.map((r) => ({ identity: { testId: r.testId, checkpointName: r.checkpointName, variant: r.variant }, updatedAt: r.updatedAt, ...ruleSetOf(r) }));
}

/** The most pixels a preview measures in the request; larger pairs are measured by the workers. */
export const PREVIEW_MAX_PIXELS = 12_000_000;

export interface PreviewResult {
  rawChangedPixels: number;
  effectiveChangedPixels: number;
  suppressedPixels: number;
  totalPixels: number;
  ignoredAreaPixels: number;
  /** Regions of the raw measurement, and which the proposed rectangles cover wholly. */
  regions: { x: number; y: number; width: number; height: number; pixels: number; covered: 'none' | 'partial' | 'full' }[];
  remainingRegions: number;
  sizeChanged: boolean;
}

/**
 * What a set of rectangles would do to a comparison, measured now on the two
 * images: the raw change, what the rectangles would leave out, what remains.
 * A simulation: nothing is saved.
 */
export async function previewRules(base: Buffer, head: Buffer, rects: readonly Rect[], threshold: number): Promise<PreviewResult> {
  const maxPixels = Math.min(maxDiffPixels(), PREVIEW_MAX_PIXELS);
  let raw;
  let effective;
  try {
    [raw, effective] = await Promise.all([diffImages(base, head, { threshold, maxPixels, overlay: false }), rects.length ? diffImages(base, head, { threshold, maxPixels, ignore: rects, overlay: false }) : null]);
  } catch (error) {
    if (error instanceof DiffTooLargeError) throw new IgnoreRegionsError(`Too large to preview in one request (${error.base.width}×${error.base.height}): save the rules and let the measurement run.`);
    throw error;
  }
  const effectiveChanged = effective?.changedPixels ?? raw.changedPixels;
  const covered = (r: Rect): 'none' | 'partial' | 'full' => {
    const hits = rects.filter((i) => i.x < r.x + r.width && r.x < i.x + i.width && i.y < r.y + r.height && r.y < i.y + i.height);
    if (!hits.length) return 'none';
    return hits.some((i) => i.x <= r.x && i.y <= r.y && i.x + i.width >= r.x + r.width && i.y + i.height >= r.y + r.height) ? 'full' : 'partial';
  };
  return {
    rawChangedPixels: raw.changedPixels,
    effectiveChangedPixels: effectiveChanged,
    suppressedPixels: Math.max(0, raw.changedPixels - effectiveChanged),
    totalPixels: raw.totalPixels,
    ignoredAreaPixels: unionArea(rects),
    regions: raw.regions.map((r) => ({ ...r, covered: covered(r) })),
    remainingRegions: effective?.regions.length ?? raw.regions.length,
    sizeChanged: raw.sizeChanged,
  };
}
