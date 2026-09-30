'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@miguelfranken/ui/components/button';
import { libraryRefLabel, libraryRefParam, sameLibraryRef, type LibraryReferencePatch, type LibraryReferenceView, type LibraryRefKey, type LibraryRunView } from '@miguelfranken/ui/lib/library';
import { LibraryCard } from '@miguelfranken/ui/views/library/library-card';
import { LibraryReferenceBar } from '@miguelfranken/ui/views/library/reference-bar';
import { AddLibraryReferenceDialog, LibraryReferenceDialog } from '@miguelfranken/ui/views/library/reference-dialogs';
import { RunLibraryActions } from '@miguelfranken/ui/views/library/run-library-actions';
import { updateLibraryReference } from '@/app/(app)/teams/[team]/projects/[project]/library/actions';

type ProjectRef = { team: string; project: string };

const libraryUrl = (base: string, key: LibraryRefKey, compare?: LibraryRefKey | null) =>
  `${base}/library?ref=${encodeURIComponent(libraryRefParam(key))}${compare ? `&compare=${encodeURIComponent(libraryRefParam(compare))}` : ''}`;

/** One library change at a time: pending, the error to show in a dialog, and a toast on success. */
function useLibraryUpdate(ref: ProjectRef) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const update = (key: LibraryRefKey, patch: LibraryReferencePatch, done?: string, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const res = await updateLibraryReference(ref, libraryRefParam(key), patch);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message);
        return;
      }
      if (done) toast.success(done);
      after?.();
    });
  return { pending, error, setError, update };
}

/** The settings dialog of one reference, wired to the action. */
function ReferenceSettings({
  projectRef,
  reference,
  runs,
  open,
  onOpenChange,
  onRemoved,
}: {
  projectRef: ProjectRef;
  reference: LibraryReferenceView;
  runs: LibraryRunView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const { pending, error, setError, update } = useLibraryUpdate(projectRef);
  const label = libraryRefLabel(reference);
  return (
    <LibraryReferenceDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      reference={reference}
      runs={runs}
      pending={pending}
      error={error}
      onSave={(patch) => update(reference.key, patch, 'Library updated.', () => onOpenChange(false))}
      onRemove={
        reference.kept
          ? () => {
              if (!window.confirm(`Remove ${label} from the library? Its runs and reviews stay.`)) return;
              update(reference.key, { keep: false }, `${label} is no longer in the library.`, () => {
                onOpenChange(false);
                onRemoved?.();
              });
            }
          : undefined
      }
    />
  );
}

/**
 * The library's reference bar: switching reference navigates (a new
 * reference is a new page of screens), and the settings and keep actions
 * call the server action.
 */
export function ConnectedReferenceBar({
  team,
  project,
  base,
  references,
  current,
  compareWith = null,
  runs,
  canManage,
  now,
}: {
  team: string;
  project: string;
  base: string;
  references: LibraryReferenceView[];
  current: LibraryReferenceView;
  /** The reference the screens are compared with (`?compare=`). */
  compareWith?: LibraryReferenceView | null;
  runs: LibraryRunView[];
  canManage: boolean;
  /** The instant the page was rendered at (`renderedAt()`): relative times read the same on the server and in the browser. */
  now: string;
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pending, update } = useLibraryUpdate({ team, project });
  return (
    <>
      <LibraryReferenceBar
        references={references}
        current={current}
        onReferenceChange={(key) => router.push(libraryUrl(base, key, compareWith && !sameLibraryRef(compareWith.key, key) ? compareWith.key : null))}
        compareWith={compareWith}
        onCompareChange={(key) => router.push(libraryUrl(base, current.key, key))}
        runHref={(n) => `${base}/runs/${n}`}
        reviewHref={current.latestRun ? `${base}/runs/${current.latestRun.number}/review` : null}
        onSettings={canManage ? () => setSettingsOpen(true) : undefined}
        onKeep={canManage ? () => update(current.key, { keep: true }, `${libraryRefLabel(current)} is in the library.`) : undefined}
        pending={pending}
        now={new Date(now)}
      />
      {canManage ? (
        <ReferenceSettings projectRef={{ team, project }} reference={current} runs={runs} open={settingsOpen} onOpenChange={setSettingsOpen} onRemoved={() => router.push(`${base}/library`)} />
      ) : null}
    </>
  );
}

/** "Add to library" in the library's header. */
export function AddToLibraryButton({
  team,
  project,
  base,
  branches,
  pullRequests,
  kept,
}: {
  team: string;
  project: string;
  base: string;
  branches: string[];
  pullRequests: { number: number; title: string | null }[];
  kept: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, error, setError, update } = useLibraryUpdate({ team, project });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add to library
      </Button>
      <AddLibraryReferenceDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setError(null);
          setOpen(next);
        }}
        branches={branches}
        pullRequests={pullRequests}
        kept={kept}
        pending={pending}
        error={error}
        onAdd={(key, patch) =>
          update(key, patch, 'Added to the library.', () => {
            setOpen(false);
            router.push(libraryUrl(base, key));
          })
        }
      />
    </>
  );
}

/** The library card on a pull request's or branch's page. */
export function ConnectedLibraryCard({
  team,
  project,
  base,
  reference,
  runs,
  canManage,
}: {
  team: string;
  project: string;
  base: string;
  reference: LibraryReferenceView;
  runs: LibraryRunView[];
  canManage: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { pending, update } = useLibraryUpdate({ team, project });
  return (
    <>
      <LibraryCard
        reference={reference}
        reviewHref={reference.latestRun ? `${base}/runs/${reference.latestRun.number}/review` : null}
        libraryHref={libraryUrl(base, reference.key)}
        onKeep={canManage ? () => update(reference.key, { keep: true }, `${libraryRefLabel(reference)} is in the library.`) : undefined}
        onSettings={canManage ? () => setSettingsOpen(true) : undefined}
        pending={pending}
      />
      {canManage ? <ReferenceSettings projectRef={{ team, project }} reference={reference} runs={runs} open={settingsOpen} onOpenChange={setSettingsOpen} /> : null}
    </>
  );
}

/** Pin this run as its pull request's (or branch's) library version, from the run's review. */
export function ConnectedRunLibraryActions({
  team,
  project,
  base,
  reference,
  runNumber,
  canManage,
}: {
  team: string;
  project: string;
  base: string;
  reference: LibraryReferenceView;
  runNumber: number;
  canManage: boolean;
}) {
  const { pending, update } = useLibraryUpdate({ team, project });
  return (
    <RunLibraryActions
      reference={reference}
      runNumber={runNumber}
      libraryHref={libraryUrl(base, reference.key)}
      pending={pending}
      onPin={canManage ? () => update(reference.key, { keep: true, pin: runNumber }, `Run #${runNumber} is now the library version of ${libraryRefLabel(reference)}.`) : undefined}
    />
  );
}
