/**
 * Reading measured comparisons: the diff of a capture against its reference,
 * the areas a checkpoint leaves out, and a project's diff settings. The
 * review queries attach these to every capture they return.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DiffRegion, DiffShift, DiffState } from '@miguelfranken/ui/lib/review';
import { db } from '@/lib/db/drizzle';
import { imageDiffs, projects, reviewIgnoreRegions } from '@/lib/db/schema';
import { optionsKey, visualDiffSettings, type VisualDiffSettings } from './settings';

export type Rect = Pick<DiffRegion, 'x' | 'y' | 'width' | 'height'>;

export interface DiffRecord {
  id: string;
  status: DiffState;
  baseSha256: string;
  headSha256: string;
  changedPixels: number | null;
  totalPixels: number | null;
  ratio: number | null;
  baseWidth: number | null;
  baseHeight: number | null;
  headWidth: number | null;
  headHeight: number | null;
  regions: DiffRegion[] | null;
  regionsTruncated: boolean;
  shift: DiffShift | null;
  overlayKey: string | null;
  error: string | null;
  claimedAt: Date | null;
  createdAt: Date;
}

export interface Identity {
  testId: string;
  checkpointName: string;
  variant: string;
}

export const identityKey = (c: Identity) => `${c.testId}\u0000${c.checkpointName}\u0000${c.variant}`;
export const pairKey = (projectId: string, base: string, head: string, options: string) => `${projectId}\u0000${base}\u0000${head}\u0000${options}`;

export const diffColumns = {
  id: imageDiffs.id,
  status: imageDiffs.status,
  baseSha256: imageDiffs.baseSha256,
  headSha256: imageDiffs.headSha256,
  changedPixels: imageDiffs.changedPixels,
  totalPixels: imageDiffs.totalPixels,
  ratio: imageDiffs.ratio,
  baseWidth: imageDiffs.baseWidth,
  baseHeight: imageDiffs.baseHeight,
  headWidth: imageDiffs.headWidth,
  headHeight: imageDiffs.headHeight,
  regions: imageDiffs.regions,
  regionsTruncated: imageDiffs.regionsTruncated,
  shift: imageDiffs.shift,
  overlayKey: imageDiffs.overlayKey,
  error: imageDiffs.error,
  claimedAt: imageDiffs.claimedAt,
  createdAt: imageDiffs.createdAt,
};

/** The ignored areas of each checkpoint and variant that has any. */
export async function ignoreRegionsFor(identities: readonly Identity[]): Promise<Map<string, Rect[]>> {
  const out = new Map<string, Rect[]>();
  const unique = new Map(identities.map((i) => [identityKey(i), i]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((i) => sql`(${i.testId}::uuid, ${i.checkpointName}, ${i.variant})`);
  const rows = await db
    .select({ testId: reviewIgnoreRegions.testId, checkpointName: reviewIgnoreRegions.checkpointName, variant: reviewIgnoreRegions.variant, regions: reviewIgnoreRegions.regions })
    .from(reviewIgnoreRegions)
    .where(sql`(${reviewIgnoreRegions.testId}, ${reviewIgnoreRegions.checkpointName}, ${reviewIgnoreRegions.variant}) in (${sql.join(tuples, sql`, `)})`);
  for (const r of rows) if (r.regions.length) out.set(identityKey(r), r.regions);
  return out;
}

export async function diffSettingsFor(projectIds: readonly string[]): Promise<Map<string, VisualDiffSettings>> {
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: projects.id, settings: projects.settings }).from(projects).where(inArray(projects.id, ids));
  return new Map(rows.map((r) => [r.id, visualDiffSettings(r.settings)]));
}

export interface DiffPair {
  projectId: string;
  baseSha256: string;
  headSha256: string;
  optionsKey: string;
}

/** The measured (or planned) comparisons of the pairs, by `pairKey`. */
export async function diffsFor(pairs: readonly DiffPair[]): Promise<Map<string, DiffRecord>> {
  const out = new Map<string, DiffRecord>();
  const unique = new Map(pairs.map((p) => [pairKey(p.projectId, p.baseSha256, p.headSha256, p.optionsKey), p]));
  if (unique.size === 0) return out;
  const tuples = [...unique.values()].map((p) => sql`(${p.projectId}::uuid, ${p.baseSha256}, ${p.headSha256}, ${p.optionsKey})`);
  const rows = await db
    .select({ ...diffColumns, projectId: imageDiffs.projectId, optionsKey: imageDiffs.optionsKey })
    .from(imageDiffs)
    .where(sql`(${imageDiffs.projectId}, ${imageDiffs.baseSha256}, ${imageDiffs.headSha256}, ${imageDiffs.optionsKey}) in (${sql.join(tuples, sql`, `)})`);
  for (const { projectId, optionsKey: key, ...r } of rows) out.set(pairKey(projectId, r.baseSha256, r.headSha256, key), r);
  return out;
}

/** The pair a capture is measured by against a reference, or null when there is nothing to measure. */
export function pairOf(
  capture: Identity & { projectId: string; sha256: string | null },
  reference: { sha256: string | null } | null | undefined,
  settings: VisualDiffSettings,
  ignore: readonly Rect[] = [],
): (DiffPair & { options: { threshold: number; ignore: Rect[] } }) | null {
  if (!capture.sha256 || !reference?.sha256 || reference.sha256 === capture.sha256) return null;
  return {
    projectId: capture.projectId,
    baseSha256: reference.sha256,
    headSha256: capture.sha256,
    optionsKey: optionsKey(settings.threshold, ignore),
    options: { threshold: settings.threshold, ignore: [...ignore] },
  };
}

/** One diff of a project, for the overlay route and the tools. */
export async function diffInProject(projectId: string, diffId: string) {
  const [row] = await db
    .select({ ...diffColumns, overlaySize: imageDiffs.overlaySize })
    .from(imageDiffs)
    .where(and(eq(imageDiffs.projectId, projectId), eq(imageDiffs.id, diffId)));
  return row ?? null;
}
