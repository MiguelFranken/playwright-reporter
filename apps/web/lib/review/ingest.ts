import { randomUUID } from 'node:crypto';
import { legacyCheckpoints, type AttemptEndEvent, type Checkpoint } from '@miguelfranken/protocol';
import type { reviewCaptures, reviewCheckpoints } from '@/lib/db/schema';

export interface CheckpointContext {
  projectId: string;
  runId: string;
  testResultId: string;
  attemptId: string;
  testId: string;
}

/**
 * The review rows an attempt carries: its checkpoints, as the capture helper
 * recorded them, or — from a reporter or suite that predates them — read from
 * `review:<name>:<variant>` attachment names.
 *
 * A variant may only point at an image of the same attempt: anything else is
 * dropped, so a reporter cannot attach another run's picture to this one. A
 * name used twice keeps its first checkpoint.
 */
export function checkpointRows(ctx: CheckpointContext, ev: Pick<AttemptEndEvent, 'attachments' | 'checkpoints' | 'startedAt'>) {
  const images = new Map(ev.attachments.filter((a) => a.contentType.startsWith('image/')).map((a) => [a.id, a]));
  const source = ev.checkpoints?.length ? 'record' : 'legacy';
  const checkpoints: Checkpoint[] = ev.checkpoints?.length ? ev.checkpoints : legacyCheckpoints(ev.attachments);
  const started = Date.parse(ev.startedAt);

  const checkpointInserts: (typeof reviewCheckpoints.$inferInsert)[] = [];
  const captureInserts: (typeof reviewCaptures.$inferInsert)[] = [];
  const seen = new Set<string>();
  const usedImages = new Set<string>();

  for (const cp of [...checkpoints].sort((a, b) => a.sequence - b.sequence)) {
    if (seen.has(cp.name)) continue;
    const variants = cp.variants.filter((v, i, all) => images.has(v.attachmentId) && !usedImages.has(v.attachmentId) && all.findIndex((o) => o.variant === v.variant) === i);
    if (variants.length === 0) continue;
    seen.add(cp.name);
    const checkpointId = randomUUID();
    const capturedAt = cp.capturedAt ? new Date(cp.capturedAt) : null;
    const validCapturedAt = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null;
    const offsetMs = validCapturedAt && Number.isFinite(started) ? Math.max(0, Math.min(2_147_483_647, validCapturedAt.getTime() - started)) : null;
    checkpointInserts.push({
      id: checkpointId,
      ...ctx,
      name: cp.name,
      title: cp.title ?? null,
      description: cp.description ?? null,
      sequence: checkpointInserts.length,
      kind: cp.kind ?? null,
      flow: cp.flow ?? null,
      stepPath: cp.stepPath ?? [],
      url: cp.url ?? null,
      pageTitle: cp.pageTitle ?? null,
      tags: cp.tags ?? [],
      capturedAt: validCapturedAt,
      offsetMs,
      source,
    });
    for (const v of variants) {
      usedImages.add(v.attachmentId);
      const thumbnail = v.thumbnailAttachmentId && images.has(v.thumbnailAttachmentId) ? v.thumbnailAttachmentId : null;
      captureInserts.push({
        id: randomUUID(),
        checkpointId,
        projectId: ctx.projectId,
        runId: ctx.runId,
        testId: ctx.testId,
        checkpointName: cp.name,
        variant: v.variant,
        attachmentId: v.attachmentId,
        thumbnailAttachmentId: thumbnail,
        viewportWidth: v.viewport?.width ?? null,
        viewportHeight: v.viewport?.height ?? null,
        deviceScaleFactor: v.deviceScaleFactor ?? null,
        isMobile: v.isMobile ?? null,
        fullPage: v.fullPage ?? null,
        width: v.width ?? null,
        height: v.height ?? null,
        sha256: v.sha256 ?? null,
      });
    }
  }
  return { checkpoints: checkpointInserts, captures: captureInserts };
}
