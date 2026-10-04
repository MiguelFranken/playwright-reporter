/**
 * Whether the rules that leave areas out still earn their place, judged on
 * the screen's latest runs: a rule that no longer fits the image as it is
 * captured now is suspended; one that covered no change in several measured
 * comparisons may guard something that became stable (a fixture fixed); a
 * set whose screen is no longer captured guards nothing. Read-only: it uses
 * the measurements that exist and plans none.
 */
import { and, eq, lte, sql } from 'drizzle-orm';
import { ruleValidity, type IgnoreRule, type RuleValidity } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { reviewCaptures, runs } from '@/lib/db/schema';
import { capturesById, type CaptureRecord } from '../queries';
import { compare, regionsOf, type CapturePair } from './comparison';
import { identityKey, type Identity } from './lookup';

/** How many of the screen's latest captures are compared, each with the one before. */
export const ASSESS_CAPTURES = 6;

export const RULE_ASSESSMENTS = ['in_use', 'unused', 'suspended', 'inactive', 'not_captured', 'unmeasured'] as const;
export type RuleAssessment = (typeof RULE_ASSESSMENTS)[number];

/** The assessments that ask a person (or an assistant) to look at the rule again. */
export const STALE_ASSESSMENTS: readonly RuleAssessment[] = ['unused', 'suspended', 'not_captured'];

export interface RuleCheck {
  ruleId: string;
  assessment: RuleAssessment;
  /** On the latest capture: valid, legacy, geometry_changed, out_of_bounds or inactive; null when nothing is captured. */
  validityNow: RuleValidity | null;
  /** Measured comparisons of the latest captures the rule was applied in. */
  comparisons: number;
  /** Of those, the ones where it covered a changed region. */
  matched: number;
  /** Changed pixels of the regions it covered, summed. */
  coveredPixels: number;
}

export interface SetCheck {
  latest: { captureId: string; run: number; at: string; width: number | null; height: number | null } | null;
  /** Measured comparisons looked at. */
  comparisons: number;
  rules: RuleCheck[];
}

type Recent = { id: string; key: string; run: number; at: Date };

async function recentCaptures(projectId: string, identities: readonly Identity[], perIdentity: number): Promise<Map<string, Recent[]>> {
  const out = new Map<string, Recent[]>();
  const unique = new Map(identities.map((i) => [identityKey(i), i]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((i) => sql`(${i.testId}::uuid, ${i.checkpointName}, ${i.variant})`);
  const ranked = db.$with('ranked').as(
    db
      .select({
        id: reviewCaptures.id,
        testId: reviewCaptures.testId,
        checkpointName: reviewCaptures.checkpointName,
        variant: reviewCaptures.variant,
        run: runs.number,
        at: runs.startedAt,
        rank: sql<number>`row_number() over (partition by ${reviewCaptures.testId}, ${reviewCaptures.checkpointName}, ${reviewCaptures.variant} order by ${runs.startedAt} desc, ${reviewCaptures.createdAt} desc)`.as('rank'),
      })
      .from(reviewCaptures)
      .innerJoin(runs, eq(runs.id, reviewCaptures.runId))
      .where(and(eq(reviewCaptures.projectId, projectId), sql`(${reviewCaptures.testId}, ${reviewCaptures.checkpointName}, ${reviewCaptures.variant}) in (${sql.join(tuples, sql`, `)})`)),
  );
  const rows = await db.with(ranked).select().from(ranked).where(lte(ranked.rank, perIdentity)).orderBy(ranked.rank);
  for (const r of rows) {
    const key = identityKey(r);
    (out.get(key) ?? out.set(key, []).get(key)!).push({ id: r.id, key, run: r.run, at: r.at });
  }
  return out;
}

/** Each set's rules checked against the screen's latest captures, by `identityKey`. */
export async function assessRuleSets(projectId: string, sets: readonly { identity: Identity; rules: readonly IgnoreRule[] }[], perIdentity = ASSESS_CAPTURES): Promise<Map<string, SetCheck>> {
  const out = new Map<string, SetCheck>();
  if (sets.length === 0) return out;
  const recent = await recentCaptures(
    projectId,
    sets.map((s) => s.identity),
    perIdentity,
  );
  const records = new Map((await capturesById([...recent.values()].flat().map((r) => r.id))).map((c) => [c.id, c]));
  const pairs: CapturePair[] = [];
  for (const list of recent.values()) {
    const caps = list.map((r) => records.get(r.id)).filter((c): c is CaptureRecord => Boolean(c));
    for (let i = 0; i + 1 < caps.length; i++)
      pairs.push({ identity: { testId: caps[i].testId, checkpointName: caps[i].checkpointName, variant: caps[i].variant }, base: caps[i + 1], head: caps[i], baseCarriedForward: false, headCarriedForward: false });
  }
  const comparisons = await compare(pairs);
  const byKey = new Map<string, typeof comparisons>();
  for (const c of comparisons) {
    const key = identityKey(c.pair.identity);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(c);
  }

  for (const s of sets) {
    const key = identityKey(s.identity);
    const newest = recent.get(key)?.[0];
    const latestRecord = newest ? records.get(newest.id) : undefined;
    const latest = newest ? { captureId: newest.id, run: newest.run, at: newest.at.toISOString(), width: latestRecord?.width ?? null, height: latestRecord?.height ?? null } : null;
    const tally = new Map(s.rules.map((r) => [r.id, { comparisons: 0, matched: 0, coveredPixels: 0 }]));
    let measured = 0;
    for (const c of byKey.get(key) ?? []) {
      const identical = c.comparisonStatus === 'identical';
      if (!identical && c.raw?.status !== 'done') continue;
      measured++;
      const regions = identical ? [] : regionsOf(c, 'raw');
      for (const rule of c.applied) {
        const t = tally.get(rule.id);
        if (!t) continue;
        t.comparisons++;
        const covered = regions.filter((r) => r.ignoredBy.includes(rule.id));
        if (covered.length) {
          t.matched++;
          t.coveredPixels += covered.reduce((n, r) => n + r.rawChangedPixels, 0);
        }
      }
    }
    const rules = s.rules.map((rule): RuleCheck => {
      const t = tally.get(rule.id)!;
      const validityNow = latest ? ruleValidity(rule, { width: latest.width, height: latest.height }) : null;
      const assessment: RuleAssessment = !rule.active
        ? 'inactive'
        : !latest
          ? 'not_captured'
          : validityNow === 'geometry_changed' || validityNow === 'out_of_bounds'
            ? 'suspended'
            : t.matched > 0
              ? 'in_use'
              : t.comparisons >= 2
                ? 'unused'
                : 'unmeasured';
      return { ruleId: rule.id, assessment, validityNow, ...t };
    });
    out.set(key, { latest, comparisons: measured, rules });
  }
  return out;
}
