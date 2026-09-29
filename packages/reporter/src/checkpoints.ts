import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { TestResult, TestStep } from '@playwright/test/reporter';
import {
  CHECKPOINT_CONTENT_TYPE,
  checkpointRecordSchema,
  legacyCheckpoints,
  parseReviewAttachmentName,
  type AttachmentRef,
  type Checkpoint,
} from '@miguelfranken/protocol';

/** The step prefix `review.ts` wraps captures in; kept out of a checkpoint's step path. */
const REVIEW_STEP_PREFIX = 'Review checkpoint: ';
/** Hashing a legacy image reads it; past this size the checkpoint goes without a hash. */
const MAX_HASH_BYTES = 64 * 1024 * 1024;

type Attachment = TestResult['attachments'][number];

export function isCheckpointRecord(a: Pick<Attachment, 'contentType'>) {
  return a.contentType === CHECKPOINT_CONTENT_TYPE;
}

/**
 * Where each attachment was attached: the titles of the `test.step`s around
 * it, outermost first, and when. Playwright records an attachment on the step
 * that was running (`TestStep.attachments`, 1.50+).
 */
function attachmentSteps(steps: readonly TestStep[]) {
  const out = new Map<string, { path: string[]; at: Date }>();
  const walk = (list: readonly TestStep[], path: string[]) => {
    for (const s of list) {
      const own = s.category === 'test.step' && !s.title.startsWith(REVIEW_STEP_PREFIX) ? [...path, s.title] : path;
      for (const a of s.attachments ?? []) if (!out.has(a.name)) out.set(a.name, { path: own, at: s.startTime });
      if (s.steps.length) walk(s.steps, own);
    }
  };
  walk(steps, []);
  return out;
}

function sha256Of(a: Attachment): { sha256?: string; width?: number; height?: number } {
  try {
    let buf = a.body;
    if (!buf && a.path) {
      if (statSync(a.path).size > MAX_HASH_BYTES) return {};
      buf = readFileSync(a.path);
    }
    if (!buf) return {};
    const png = buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : {};
    return { sha256: createHash('sha256').update(buf).digest('hex'), ...png };
  } catch {
    return {};
  }
}

/**
 * The attempt's review checkpoints, ready for `attempt.end`.
 *
 * Records from the capture helper name their images by attachment name; they
 * become the ids the reporter sends. A suite that only attaches
 * `review:<name>:<variant>` images gets checkpoints too, hashed here so an
 * unchanged image keeps its approval. Either way the step path and the time
 * come from the steps the images were attached in.
 */
export function buildCheckpoints(result: Pick<TestResult, 'attachments' | 'steps'>, refs: ReadonlyMap<Attachment, AttachmentRef>): Checkpoint[] {
  const idByName = new Map<string, string>();
  for (const [a, ref] of refs) if (!idByName.has(a.name)) idByName.set(a.name, ref.id);
  const steps = attachmentSteps(result.steps);

  const records = result.attachments
    .filter((a) => isCheckpointRecord(a) && a.body)
    .map((a) => {
      try {
        const parsed = checkpointRecordSchema.safeParse(JSON.parse(a.body!.toString('utf8')));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    })
    .filter((r) => r !== null);

  let checkpoints: Checkpoint[];
  if (records.length) {
    checkpoints = records.flatMap((r): Checkpoint[] => {
      const { v: _v, variants, ...rest } = r;
      const resolved = variants.flatMap((v) => {
        const { attachment, thumbnail, ...fields } = v;
        const id = idByName.get(attachment);
        if (!id) return [];
        const thumbId = thumbnail ? idByName.get(thumbnail) : undefined;
        return [{ ...fields, attachmentId: id, ...(thumbId ? { thumbnailAttachmentId: thumbId } : {}) }];
      });
      if (!resolved.length) return [];
      const where = steps.get(variants[0].attachment);
      return [{ ...rest, stepPath: rest.stepPath ?? where?.path ?? [], variants: resolved }];
    });
  } else {
    const byId = new Map([...refs].map(([a, ref]) => [ref.id, a]));
    checkpoints = legacyCheckpoints([...refs.values()]).map((cp) => {
      const first = byId.get(cp.variants[0].attachmentId);
      const where = first ? steps.get(first.name) : undefined;
      return {
        ...cp,
        stepPath: where?.path ?? [],
        capturedAt: where?.at.toISOString(),
        variants: cp.variants.map((v) => {
          const a = byId.get(v.attachmentId);
          return a ? { ...v, ...sha256Of(a) } : v;
        }),
      };
    });
  }
  return checkpoints
    .sort((a, b) => a.sequence - b.sequence)
    .map((cp, i) => ({ ...cp, sequence: i, stepPath: (cp.stepPath ?? []).slice(-20).map((t) => t.slice(0, 500)) }))
    .slice(0, 500);
}

/** True for an image that belongs to a review checkpoint, by the naming convention. */
export function isReviewImage(name: string) {
  return parseReviewAttachmentName(name) !== null;
}
