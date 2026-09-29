/**
 * Two lines of work side by side in the library: every screen of the shown
 * branch or pull request next to the same screen (checkpoint and variant of
 * the same test) as another one shows it, with the measured difference.
 * Comparisons nobody measured yet are planned and measured after the page is
 * sent; the screens say so meanwhile.
 */
import { after } from 'next/server';
import type { ReviewFlowView } from '@miguelfranken/ui/lib/review';
import type { ComparedCapture, ReviewFlowRecord } from '../queries';
import { toDiffView, pendingDiff, toReviewImage } from '../view-model';
import { diffsEnabled, dispatchPairs } from './dispatch';
import { diffSettingsFor, diffsFor, identityKey, pairKey, pairOf } from './lookup';
import { planPairs, type PlannedPair } from './store';

const capturesOf = (records: readonly ReviewFlowRecord[]) => records.flatMap((r) => r.checkpoints.flatMap((c) => c.captures));

export async function compareFlowViews(views: ReviewFlowView[], shown: readonly ReviewFlowRecord[], other: readonly ReviewFlowRecord[], label: string): Promise<ReviewFlowView[]> {
  const theirs = new Map<string, ComparedCapture>();
  for (const c of capturesOf(other)) theirs.set(identityKey(c), c);
  const ours = capturesOf(shown);
  const settings = await diffSettingsFor(ours.map((c) => c.projectId));
  const matched = new Map<string, { mine: ComparedCapture; theirs: ComparedCapture; pair: PlannedPair['pair'] | null }>();
  for (const mine of ours) {
    const other = theirs.get(identityKey(mine));
    if (!other) continue;
    const s = settings.get(mine.projectId);
    matched.set(mine.id, { mine, theirs: other, pair: s ? pairOf(mine, other, s, mine.ignoreRegions) : null });
  }
  const diffs = await diffsFor([...matched.values()].flatMap((m) => (m.pair ? [m.pair] : [])));

  const toPlan: PlannedPair[] = [];
  const out = views.map((f) => ({
    ...f,
    checkpoints: f.checkpoints.map((cp) => ({
      ...cp,
      captures: cp.captures.map((view) => {
        const m = matched.get(view.id);
        if (!m) return view;
        const same = Boolean(m.mine.sha256 && m.mine.sha256 === m.theirs.sha256);
        const diff = m.pair ? (diffs.get(pairKey(m.pair.projectId, m.pair.baseSha256, m.pair.headSha256, m.pair.optionsKey)) ?? null) : null;
        if (m.pair && (!diff || diff.status === 'pending')) toPlan.push({ pair: m.pair, head: m.mine.attachment, base: m.theirs.attachment });
        return {
          ...view,
          compare: { captureId: m.theirs.id, image: toReviewImage(m.theirs), label, same },
          diff: diff ? toDiffView(diff, 'compare') : m.pair && diffsEnabled() ? pendingDiff('compare') : null,
        };
      }),
    })),
  }));

  if (toPlan.length && diffsEnabled()) {
    const runId = ours[0]?.runId;
    after(async () => {
      try {
        const plan = await planPairs(toPlan);
        if (runId) await dispatchPairs(plan.ids, runId);
      } catch (err) {
        console.error('[image-diff] planning a library comparison failed', err);
      }
    });
  }
  return out;
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
