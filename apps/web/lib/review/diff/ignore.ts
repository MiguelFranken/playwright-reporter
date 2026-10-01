/**
 * The areas a checkpoint's variant leaves out of its comparisons. Saved per
 * checkpoint and variant (not per capture), so they hold for every later run;
 * a change measures the images again, as the options key changes with them.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { IgnoreRule } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures, reviewIgnoreRegions } from '@/lib/db/schema';
import { identityKey, type Identity, type Rect } from './lookup';

export const MAX_IGNORE_REGIONS = 20;
const MAX_COORD = 200_000;

export class IgnoreRegionsError extends Error {}

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

/** Saves a capture's checkpoint and variant's ignored areas; null when the capture is not in the project. */
export async function setIgnoreRegions(projectId: string, captureId: string, regions: readonly Rect[], userId: string | null) {
  const [capture] = await db
    .select({ testId: reviewCaptures.testId, checkpointName: reviewCaptures.checkpointName, variant: reviewCaptures.variant })
    .from(reviewCaptures)
    .where(and(eq(reviewCaptures.projectId, projectId), eq(reviewCaptures.id, captureId)));
  if (!capture) return null;
  await db
    .insert(reviewIgnoreRegions)
    .values({ id: randomUUID(), projectId, ...capture, regions: [...regions], updatedBy: userId })
    .onConflictDoUpdate({
      target: [reviewIgnoreRegions.testId, reviewIgnoreRegions.checkpointName, reviewIgnoreRegions.variant],
      set: { regions: [...regions], updatedBy: userId, updatedAt: sql`now()` },
    });
  return capture;
}

/** The rules of a checkpoint and variant: every rule ever saved, the revision of the set, and whether any was. */
export interface RuleSet {
  rules: IgnoreRule[];
  revision: number;
  ever: boolean;
}

export const EMPTY_RULES: RuleSet = { rules: [], revision: 0, ever: false };

/**
 * The rule sets of the identities, by `identityKey`. A set saved before rules
 * had a history reads as one `legacy` rule per rectangle, drawn on no image in
 * particular: applied unchecked, as it always was.
 */
export async function rulesFor(identities: readonly Identity[]): Promise<Map<string, RuleSet>> {
  const out = new Map<string, RuleSet>();
  const unique = new Map(identities.map((i) => [identityKey(i), i]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((i) => sql`(${i.testId}::uuid, ${i.checkpointName}, ${i.variant})`);
  const rows = await db
    .select({ testId: reviewIgnoreRegions.testId, checkpointName: reviewIgnoreRegions.checkpointName, variant: reviewIgnoreRegions.variant, regions: reviewIgnoreRegions.regions, updatedAt: reviewIgnoreRegions.updatedAt })
    .from(reviewIgnoreRegions)
    .where(sql`(${reviewIgnoreRegions.testId}, ${reviewIgnoreRegions.checkpointName}, ${reviewIgnoreRegions.variant}) in (${sql.join(tuples, sql`, `)})`);
  for (const r of rows) out.set(identityKey(r), legacyRules(r.regions, r.updatedAt));
  return out;
}

/** Rectangles saved without a history, as rules. */
export function legacyRules(regions: readonly Rect[], updatedAt: Date): RuleSet {
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
    revision: 1,
    ever: true,
  };
}
