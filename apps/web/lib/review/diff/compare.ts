/**
 * Two lines of work side by side in the library: every screen of the shown
 * branch or pull request next to the same screen (checkpoint and variant of
 * the same test) as another one shows it, with the measured difference.
 * Comparisons nobody measured yet are planned and measured after the page is
 * sent; the screens say so meanwhile.
 */
import { after } from 'next/server';
import type { ReviewFlowView } from '@miguelfranken/ui/lib/review';
import type { CaptureRecord, ComparedCapture, ReviewFlowRecord } from '../queries';
import { toDiffView, pendingDiff, toReviewImage } from '../view-model';
import { diffsEnabled, dispatchPairs } from './dispatch';
import { diffSettingsFor, diffsFor, identityKey, pairKey, pairOf, type DiffRecord } from './lookup';
import { planPairs, type PlannedPair } from './store';

const capturesOf = (records: readonly ReviewFlowRecord[]) => records.flatMap((r) => r.checkpoints.flatMap((c) => c.captures));

export async function compareFlowViews(views: ReviewFlowView[], shown: readonly ReviewFlowRecord[], other: readonly ReviewFlowRecord[], label: string): Promise<ReviewFlowView[]> {
  const theirs = new Map<string, ComparedCapture>();
  for (const c of capturesOf(other)) theirs.set(identityKey(c), c);
  return compareEachWith(views, shown, (mine) => {
    const capture = theirs.get(identityKey(mine));
    return capture ? { capture, label } : null;
  });
}

/** The capture a screen is compared with, and the caption it carries (`Run #38`). */
export interface PickedReference {
  capture: CaptureRecord;
  label: string;
  runNumber?: number;
}

/** A capture measured against the reference picked for it: the diff when it is known, `pending` while it is being measured. */
export interface MeasuredReference extends PickedReference {
  /** Same pixels: nothing to measure. */
  same: boolean;
  diff: DiffRecord | null;
  /** A comparison that is planned or wanted and not measured yet. */
  pending: boolean;
}

/**
 * Every capture measured against the reference `pick` chooses for it (none:
 * left out), with the diff where it is known. Comparisons nobody measured yet
 * are planned and measured after the response.
 */
export async function measureEach(ours: readonly ComparedCapture[], pick: (mine: ComparedCapture) => PickedReference | null): Promise<Map<string, MeasuredReference>> {
  const settings = await diffSettingsFor(ours.map((c) => c.projectId));
  const matched = new Map<string, { mine: ComparedCapture; theirs: PickedReference; pair: PlannedPair['pair'] | null }>();
  for (const mine of ours) {
    const other = pick(mine);
    if (!other) continue;
    const s = settings.get(mine.projectId);
    matched.set(mine.id, { mine, theirs: other, pair: s ? pairOf(mine, other.capture, s, mine.ignoreRegions) : null });
  }
  const out = new Map<string, MeasuredReference>();
  if (matched.size === 0) return out;
  const diffs = await diffsFor([...matched.values()].flatMap((m) => (m.pair ? [m.pair] : [])));
  const toPlan: PlannedPair[] = [];
  for (const [id, m] of matched) {
    const diff = m.pair ? (diffs.get(pairKey(m.pair.projectId, m.pair.baseSha256, m.pair.headSha256, m.pair.optionsKey)) ?? null) : null;
    if (m.pair && (!diff || diff.status === 'pending')) toPlan.push({ pair: m.pair, head: m.mine.attachment, base: m.theirs.capture.attachment });
    out.set(id, {
      ...m.theirs,
      same: Boolean(m.mine.sha256 && m.mine.sha256 === m.theirs.capture.sha256),
      diff,
      pending: Boolean(m.pair && diffsEnabled() && (!diff || diff.status === 'pending')),
    });
  }
  if (toPlan.length && diffsEnabled()) {
    const runId = ours[0]?.runId;
    after(async () => {
      try {
        const plan = await planPairs(toPlan);
        if (runId) await dispatchPairs(plan.ids, runId);
      } catch (err) {
        console.error('[image-diff] planning a comparison failed', err);
      }
    });
  }
  return out;
}

/**
 * Every capture shown compared with the reference `pick` chooses for it (none:
 * left as it is), with the measured difference where it is known. Comparisons
 * nobody measured yet are planned and measured after the response; the
 * screens show them as pending meanwhile.
 */
export async function compareEachWith(views: ReviewFlowView[], shown: readonly ReviewFlowRecord[], pick: (mine: ComparedCapture) => PickedReference | null): Promise<ReviewFlowView[]> {
  const measured = await measureEach(capturesOf(shown), pick);
  if (measured.size === 0) return views;
  return views.map((f) => ({
    ...f,
    checkpoints: f.checkpoints.map((cp) => ({
      ...cp,
      captures: cp.captures.map((view) => {
        const m = measured.get(view.id);
        if (!m) return view;
        const { capture: theirs, label, runNumber } = m;
        return {
          ...view,
          compare: { captureId: theirs.id, image: toReviewImage(theirs), label, same: m.same, ...(runNumber ? { runNumber } : {}) },
          diff: m.diff ? toDiffView(m.diff, 'compare') : m.pending ? pendingDiff('compare') : null,
        };
      }),
    })),
  }));
}

/**
 * One library comparison for the viewer while it waits: `head` measured
 * against `base` (both captures of the project), planned and queued on the
 * first call.
 */
export async function requestComparison(head: ComparedCapture, base: ComparedCapture) {
  const settings = (await diffSettingsFor([head.projectId])).get(head.projectId);
  const pair = settings ? pairOf(head, base, settings, head.ignoreRegions) : null;
  if (!pair) return null;
  const [diff] = [...(await diffsFor([pair])).values()];
  if (diff && diff.status !== 'pending') return toDiffView(diff, 'compare');
  if (!diffsEnabled()) return null;
  const plan = await planPairs([{ pair, head: head.attachment, base: base.attachment }]);
  await dispatchPairs(plan.ids, head.runId);
  return diff ? toDiffView(diff, 'compare') : pendingDiff('compare');
}
