'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { SegmentedControl } from '../../components/segmented-control';
import { Switch } from '../../components/switch';
import { Textarea } from '../../components/textarea';
import { formatRelative } from '../../lib/format';
import {
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_TITLE_MAX,
  libraryRefParam,
  libraryRefShort,
  type LibraryReferencePatch,
  type LibraryReferenceView,
  type LibraryRefKey,
  type LibraryRunView,
} from '../../lib/library';
import { FieldSelect } from '../test-cases/field-select';

const LATEST = 'latest';

function runLabel(run: LibraryRunView, now?: Date) {
  const message = run.commitMessage ? ` · ${run.commitMessage.length > 48 ? `${run.commitMessage.slice(0, 47)}…` : run.commitMessage}` : '';
  return `Run #${run.number} · ${formatRelative(run.startedAt, now ? { now } : undefined)}${message}`;
}

/**
 * A reference's settings: what readers call it, a sentence on what it
 * shows, which run is the reference version (the newest, or a pinned one),
 * whether the library opens on it — and taking it out of the library.
 */
export function LibraryReferenceDialog({
  open,
  onOpenChange,
  reference,
  runs,
  onSave,
  onRemove,
  pending = false,
  error,
  now,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reference: LibraryReferenceView;
  /** The reference's runs with review checkpoints, newest first: what can be pinned. */
  runs: readonly LibraryRunView[];
  onSave: (patch: LibraryReferencePatch) => void;
  /** Absent when there is nothing to remove (the default branch nobody kept). */
  onRemove?: () => void;
  pending?: boolean;
  error?: string | null;
  now?: Date;
}) {
  const initial = {
    title: reference.title ?? '',
    description: reference.description ?? '',
    pin: reference.pinnedRun ? String(reference.pinnedRun.number) : LATEST,
    isDefault: reference.isDefault,
  };
  const [values, setValues] = useState(initial);
  const [seen, setSeen] = useState(reference);
  if (seen !== reference) {
    setSeen(reference);
    setValues(initial);
  }
  const pinnedMissing = reference.pinnedRun && !runs.some((r) => r.number === reference.pinnedRun!.number);
  const items = [
    { value: LATEST, label: runs[0] ? `Newest run (now #${runs[0].number}) — follows ${libraryRefShort(reference.key)}` : `Newest run — follows ${libraryRefShort(reference.key)}` },
    ...(pinnedMissing ? [{ value: String(reference.pinnedRun!.number), label: runLabel(reference.pinnedRun!, now) }] : []),
    ...runs.map((r) => ({ value: String(r.number), label: runLabel(r, now) })),
  ];
  const id = libraryRefParam(reference.key).replace(/[^a-z0-9]/gi, '-');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              keep: true,
              title: values.title.trim() || null,
              description: values.description.trim() || null,
              pin: values.pin === LATEST ? 'latest' : Number(values.pin),
              ...(values.isDefault !== reference.isDefault || (values.isDefault && !reference.kept) ? { isDefault: values.isDefault } : {}),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Library settings</DialogTitle>
            <DialogDescription>
              How <span className="text-code-s">{libraryRefShort(reference.key)}</span> appears in the library, and which of its runs people see.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-title`}>Name</Label>
            <Input
              id={`${id}-title`}
              value={values.title}
              maxLength={LIBRARY_TITLE_MAX}
              placeholder={reference.key.kind === 'branch' ? reference.key.branch : (reference.prTitle ?? `Pull request #${reference.key.prNumber}`)}
              disabled={pending}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
            />
            <p className="text-body-s text-muted-foreground">For readers who do not know the branch: &ldquo;Checkout redesign&rdquo;.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-description`}>What it shows</Label>
            <Textarea
              id={`${id}-description`}
              rows={2}
              maxLength={LIBRARY_DESCRIPTION_MAX}
              value={values.description}
              disabled={pending}
              onChange={(e) => setValues({ ...values, description: e.target.value })}
            />
          </div>
          <FieldSelect id={`${id}-pin`} label="Version shown" value={values.pin} disabled={pending} items={items} onValueChange={(v) => setValues({ ...values, pin: v })} />
          <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`${id}-default`}>Default reference</Label>
              <p className="text-body-s text-muted-foreground">The library opens on it, and test case pages show its screens.</p>
            </div>
            <Switch id={`${id}-default`} aria-label="Default reference" checked={values.isDefault} disabled={pending || (reference.isDefault && reference.kept)} onCheckedChange={(v) => setValues({ ...values, isDefault: v })} />
          </div>
          {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
          <DialogFooter className="sm:justify-between">
            {onRemove ? (
              <Button type="button" variant="ghost" className="text-danger-text" disabled={pending} onClick={onRemove}>
                Remove from library
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Adds a branch or pull request to the library, from those whose runs
 * captured review checkpoints. A long-lived pull request can be kept while
 * it is open, so its screens stay one click away for everyone.
 */
export function AddLibraryReferenceDialog({
  open,
  onOpenChange,
  branches,
  pullRequests,
  kept,
  onAdd,
  pending = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: readonly string[];
  pullRequests: readonly { number: number; title: string | null }[];
  /** References already in the library, as `libraryRefParam` writes them. */
  kept: readonly string[];
  onAdd: (key: LibraryRefKey, patch: LibraryReferencePatch) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const keptSet = new Set(kept);
  const branchItems = branches.filter((b) => !keptSet.has(libraryRefParam({ kind: 'branch', branch: b }))).map((b) => ({ value: b, label: b }));
  const prItems = pullRequests
    .filter((p) => !keptSet.has(libraryRefParam({ kind: 'pull_request', prNumber: p.number })))
    .map((p) => ({ value: String(p.number), label: p.title ? `#${p.number} ${p.title}` : `#${p.number}` }));
  const [kind, setKind] = useState<LibraryRefKey['kind']>(prItems.length && !branchItems.length ? 'pull_request' : 'branch');
  const [choice, setChoice] = useState('');
  const [title, setTitle] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const items = kind === 'branch' ? branchItems : prItems;
  const value = items.some((i) => i.value === choice) ? choice : (items[0]?.value ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value) return;
            const key: LibraryRefKey = kind === 'branch' ? { kind: 'branch', branch: value } : { kind: 'pull_request', prNumber: Number(value) };
            onAdd(key, { keep: true, title: title.trim() || null, ...(isDefault ? { isDefault: true } : {}) });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add to the library</DialogTitle>
            <DialogDescription>Keep a branch or pull request, so anyone can browse its screens and flows without running the product.</DialogDescription>
          </DialogHeader>
          <SegmentedControl
            aria-label="Kind"
            value={kind}
            onValueChange={(v) => setKind(v as LibraryRefKey['kind'])}
            items={[
              { value: 'branch', label: 'Branch' },
              { value: 'pull_request', label: 'Pull request' },
            ]}
          />
          {items.length ? (
            <FieldSelect id="library-add-target" label={kind === 'branch' ? 'Branch' : 'Pull request'} value={value} disabled={pending} items={items} onValueChange={setChoice} />
          ) : (
            <p className="rounded-lg bg-surface-sunken p-3 text-body-s text-muted-foreground">
              {kind === 'branch' ? 'Every branch with review checkpoints is in the library already.' : 'No pull request with review checkpoints that is not in the library already.'}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="library-add-title">Name (optional)</Label>
            <Input id="library-add-title" value={title} maxLength={LIBRARY_TITLE_MAX} disabled={pending} placeholder="Checkout redesign" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="library-add-default">Make it the default reference</Label>
            <Switch id="library-add-default" aria-label="Make it the default reference" checked={isDefault} disabled={pending} onCheckedChange={setIsDefault} />
          </div>
          {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !value}>
              {pending ? 'Adding…' : 'Add to library'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
