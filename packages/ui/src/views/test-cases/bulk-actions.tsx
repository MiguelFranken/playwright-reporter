'use client';

import { Archive, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { formatNumber } from '../../lib/format';
import type { SuiteOption } from '../../lib/test-case-models';
import {
  CASE_AUTOMATION_LABELS,
  CASE_AUTOMATIONS,
  CASE_PRIORITIES,
  CASE_PRIORITY_LABELS,
  CASE_SEVERITIES,
  CASE_SEVERITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_STATUSES,
  CASE_TYPE_LABELS,
  CASE_TYPES,
  labelItems,
  MAX_BULK_CASES,
  type CaseAutomation,
  type CasePriority,
  type CaseSeverity,
  type CaseStatus,
  type CaseType,
} from '../../lib/test-cases';
import { FieldSelect } from './field-select';

/** A bulk edit. A field left out stays as each case has it. */
export interface BulkEdit {
  suiteId?: string | null;
  status?: CaseStatus;
  priority?: CasePriority;
  severity?: CaseSeverity;
  type?: CaseType;
  automation?: CaseAutomation;
  muted?: boolean;
  addTags?: string[];
  removeTags?: string[];
}

/** The bar that appears while cases are selected. */
export function BulkBar({
  count,
  onClear,
  onEdit,
  onDeprecate,
  onDelete,
  pending = false,
}: {
  count: number;
  onClear: () => void;
  onEdit: () => void;
  onDeprecate: () => void;
  onDelete: () => void;
  pending?: boolean;
}) {
  const tooMany = count > MAX_BULK_CASES;
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-border bg-accent-subtle px-3 py-2">
      <span className="text-label-m text-accent-text">
        {formatNumber(count)} selected
        {tooMany ? <span className="ms-2 font-normal text-danger-text">(at most {MAX_BULK_CASES} at once)</span> : null}
      </span>
      <div className="ms-auto flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={pending || tooMany} onClick={onEdit}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled={pending || tooMany} onClick={onDeprecate}>
          <Archive className="size-3.5" />
          Deprecate
        </Button>
        <Button size="sm" variant="outline" disabled={pending || tooMany} onClick={onDelete} className="text-danger-text">
          <Trash2 className="size-3.5" />
          Delete
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Clear selection" disabled={pending} onClick={onClear}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

const KEEP = '__keep__';
const UNASSIGNED = '__unassigned__';

function keep<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return [{ value: KEEP, label: 'No change' }, ...labelItems(values, labels)];
}

function tags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim().replace(/^@+/, '')).filter(Boolean))];
}

/** Edits every selected case at once. Only the fields changed here are applied. */
export function BulkEditDialog({
  open,
  onOpenChange,
  count,
  suites,
  onSubmit,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  suites: SuiteOption[];
  onSubmit: (edit: BulkEdit) => void;
  pending?: boolean;
}) {
  const [suite, setSuite] = useState(KEEP);
  const [status, setStatus] = useState(KEEP);
  const [priority, setPriority] = useState(KEEP);
  const [severity, setSeverity] = useState(KEEP);
  const [type, setType] = useState(KEEP);
  const [automation, setAutomation] = useState(KEEP);
  const [muted, setMuted] = useState(KEEP);
  const [add, setAdd] = useState('');
  const [remove, setRemove] = useState('');

  const edit: BulkEdit = {};
  if (suite !== KEEP) edit.suiteId = suite === UNASSIGNED ? null : suite;
  if (status !== KEEP) edit.status = status as CaseStatus;
  if (priority !== KEEP) edit.priority = priority as CasePriority;
  if (severity !== KEEP) edit.severity = severity as CaseSeverity;
  if (type !== KEEP) edit.type = type as CaseType;
  if (automation !== KEEP) edit.automation = automation as CaseAutomation;
  if (muted !== KEEP) edit.muted = muted === 'yes';
  if (tags(add).length) edit.addTags = tags(add);
  if (tags(remove).length) edit.removeTags = tags(remove);
  const empty = Object.keys(edit).length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {formatNumber(count)} test {count === 1 ? 'case' : 'cases'}</DialogTitle>
          <DialogDescription>Fields left at “No change” stay as each case has them. Every changed case gets a new version.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldSelect
            id="bulk-suite"
            label="Move to suite"
            value={suite}
            onValueChange={setSuite}
            className="sm:col-span-2"
            items={[{ value: KEEP, label: 'No change' }, { value: UNASSIGNED, label: 'Unassigned' }, ...suites]}
          />
          <FieldSelect id="bulk-status" label="Status" value={status} onValueChange={setStatus} items={keep(CASE_STATUSES, CASE_STATUS_LABELS)} />
          <FieldSelect id="bulk-priority" label="Priority" value={priority} onValueChange={setPriority} items={keep(CASE_PRIORITIES, CASE_PRIORITY_LABELS)} />
          <FieldSelect id="bulk-severity" label="Severity" value={severity} onValueChange={setSeverity} items={keep(CASE_SEVERITIES, CASE_SEVERITY_LABELS)} />
          <FieldSelect id="bulk-type" label="Type" value={type} onValueChange={setType} items={keep(CASE_TYPES, CASE_TYPE_LABELS)} />
          <FieldSelect id="bulk-automation" label="Automation" value={automation} onValueChange={setAutomation} items={keep(CASE_AUTOMATIONS, CASE_AUTOMATION_LABELS)} />
          <FieldSelect
            id="bulk-muted"
            label="Muted"
            value={muted}
            onValueChange={setMuted}
            items={[
              { value: KEEP, label: 'No change' },
              { value: 'yes', label: 'Muted' },
              { value: 'no', label: 'Not muted' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-add-tags">Add tags</Label>
            <Input id="bulk-add-tags" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="smoke, release-42" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-remove-tags">Remove tags</Label>
            <Input id="bulk-remove-tags" value={remove} onChange={(e) => setRemove(e.target.value)} placeholder="legacy" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={empty || pending} onClick={() => onSubmit(edit)}>
            {pending ? 'Applying…' : 'Apply changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
