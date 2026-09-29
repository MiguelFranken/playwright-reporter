'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Textarea } from '../../components/textarea';
import type { SuiteOption } from '../../lib/test-case-models';
import { MAX_SUITE_DEPTH } from '../../lib/test-cases';
import { FieldSelect } from './field-select';

export interface SuiteDialogValues {
  name: string;
  description: string;
  parentId: string | null;
}

const ROOT = '__root__';

/**
 * Creates or edits a suite. The parent picker leaves out the suite itself,
 * everything below it, and parents that would push it past the depth limit —
 * the host passes `parents` already filtered.
 */
export function SuiteDialog({
  open,
  onOpenChange,
  mode,
  initial,
  parents,
  onSubmit,
  pending = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: SuiteDialogValues;
  parents: SuiteOption[];
  onSubmit: (values: SuiteDialogValues) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [values, setValues] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setValues(initial);
  }
  const eligible = parents.filter((p) => p.depth + 1 < MAX_SUITE_DEPTH);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (values.name.trim()) onSubmit({ ...values, name: values.name.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New suite' : 'Edit suite'}</DialogTitle>
            <DialogDescription>Suites group cases the way your product is built. They nest up to {MAX_SUITE_DEPTH} levels deep.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suite-name">Name</Label>
            <Input id="suite-name" value={values.name} maxLength={200} autoFocus disabled={pending} onChange={(e) => setValues({ ...values, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suite-description">Description</Label>
            <Textarea id="suite-description" rows={2} maxLength={2000} value={values.description} disabled={pending} onChange={(e) => setValues({ ...values, description: e.target.value })} />
          </div>
          <FieldSelect
            id="suite-parent"
            label="Parent suite"
            value={values.parentId ?? ROOT}
            disabled={pending}
            items={[{ value: ROOT, label: 'None (top level)' }, ...eligible]}
            onValueChange={(v) => setValues({ ...values, parentId: v === ROOT ? null : v })}
          />
          {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !values.name.trim()}>
              {pending ? 'Saving…' : mode === 'create' ? 'Create suite' : 'Save suite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
