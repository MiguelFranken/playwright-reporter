'use client';

import { Eye, EyeOff, History, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { EmptyState } from '../../patterns/empty-state';
import { cn } from '../../lib/cn';
import { formatDateTime, formatRelative } from '../../lib/format';
import type { CaseSnapshotView, CaseVersionRow } from '../../lib/test-case-models';
import {
  CASE_AUTOMATION_LABELS,
  CASE_BEHAVIOR_LABELS,
  CASE_PRIORITY_LABELS,
  CASE_SEVERITY_LABELS,
  CASE_STATUS_LABELS,
  CASE_TYPE_LABELS,
  GHERKIN_KEYWORD_LABELS,
  STEP_FORMAT_LABELS,
  type CaseFieldDef,
} from '../../lib/test-cases';
import { FieldSelect } from './field-select';

type Field = keyof CaseSnapshotView;

/** Every field a version keeps, in the order the comparison lists them. `suiteId` in a change list is the suite. */
const FIELDS: { key: Field; changedAs: string; label: string }[] = [
  { key: 'title', changedAs: 'title', label: 'Title' },
  { key: 'suite', changedAs: 'suiteId', label: 'Suite' },
  { key: 'status', changedAs: 'status', label: 'Status' },
  { key: 'priority', changedAs: 'priority', label: 'Priority' },
  { key: 'severity', changedAs: 'severity', label: 'Severity' },
  { key: 'type', changedAs: 'type', label: 'Type' },
  { key: 'behavior', changedAs: 'behavior', label: 'Behavior' },
  { key: 'automation', changedAs: 'automation', label: 'Automation' },
  { key: 'muted', changedAs: 'muted', label: 'Muted' },
  { key: 'tags', changedAs: 'tags', label: 'Tags' },
  { key: 'description', changedAs: 'description', label: 'Description' },
  { key: 'preconditions', changedAs: 'preconditions', label: 'Preconditions' },
  { key: 'postconditions', changedAs: 'postconditions', label: 'Postconditions' },
  { key: 'stepsFormat', changedAs: 'stepsFormat', label: 'Step format' },
  { key: 'steps', changedAs: 'steps', label: 'Steps' },
  { key: 'customFields', changedAs: 'customFields', label: 'Custom fields' },
];

export const CHANGE_LABELS: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.changedAs, f.label]));

function show(field: Field, s: CaseSnapshotView, defs: readonly CaseFieldDef[]): string {
  switch (field) {
    case 'suite':
      return s.suite ?? 'Unassigned';
    case 'status':
      return CASE_STATUS_LABELS[s.status];
    case 'priority':
      return CASE_PRIORITY_LABELS[s.priority];
    case 'severity':
      return CASE_SEVERITY_LABELS[s.severity];
    case 'type':
      return CASE_TYPE_LABELS[s.type];
    case 'behavior':
      return CASE_BEHAVIOR_LABELS[s.behavior];
    case 'automation':
      return CASE_AUTOMATION_LABELS[s.automation];
    case 'muted':
      return s.muted ? 'Yes' : 'No';
    case 'tags':
      return s.tags.join(', ');
    case 'stepsFormat':
      return STEP_FORMAT_LABELS[s.stepsFormat];
    case 'steps':
      return s.steps
        .map((st, i) =>
          s.stepsFormat === 'gherkin'
            ? `${GHERKIN_KEYWORD_LABELS[st.keyword]} ${st.action}`
            : [`${i + 1}. ${st.action}`, st.data && `   Data: ${st.data}`, st.expected && `   Expected: ${st.expected}`].filter(Boolean).join('\n'),
        )
        .join('\n');
    case 'customFields': {
      const labels = new Map(defs.map((d) => [d.key, d.label]));
      return Object.entries(s.customFields)
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => `${labels.get(k) ?? k}: ${v === true ? 'Yes' : v === false ? 'No' : v}`)
        .join('\n');
    }
    default:
      return String(s[field] ?? '');
  }
}

export interface CaseHistoryProps {
  /** Newest first. */
  versions: CaseVersionRow[];
  fieldDefs: CaseFieldDef[];
  now?: Date;
  canEdit?: boolean;
  onRestore?: (version: number) => void;
  pendingVersion?: number | null;
}

/**
 * Every saved version of a case, and any two of them side by side. Restoring
 * an old version saves its fields as a new one, so nothing is ever lost.
 */
export function CaseHistory({ versions, fieldDefs, now, canEdit = false, onRestore, pendingVersion }: CaseHistoryProps) {
  const newest = versions[0]?.version ?? 1;
  const [left, setLeft] = useState(versions[1]?.version ?? newest);
  const [right, setRight] = useState(newest);
  const [allFields, setAllFields] = useState(false);

  if (versions.length === 0) {
    return <EmptyState icon={History} title="No history yet" description="Every saved change to this case will be listed here." />;
  }

  const byVersion = new Map(versions.map((v) => [v.version, v]));
  const a = byVersion.get(left) ?? versions.at(-1)!;
  const b = byVersion.get(right) ?? versions[0];
  const items = versions.map((v) => ({ value: String(v.version), label: v.version === newest ? `Version ${v.version} (current)` : `Version ${v.version}` }));
  const rows = FIELDS.map((f) => ({ ...f, before: show(f.key, a.snapshot, fieldDefs), after: show(f.key, b.snapshot, fieldDefs) }));
  const shown = allFields ? rows : rows.filter((r) => r.before !== r.after);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="compare-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="compare-heading" className="text-headline-s">
            Compare versions
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <FieldSelect id="compare-left" label="From" value={String(a.version)} items={items} onValueChange={(v) => setLeft(Number(v))} className="w-52" />
            <FieldSelect id="compare-right" label="To" value={String(b.version)} items={items} onValueChange={(v) => setRight(Number(v))} className="w-52" />
            <Button variant="outline" size="sm" className="h-9" aria-pressed={allFields} onClick={() => setAllFields((x) => !x)}>
              {allFields ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {allFields ? 'Changed fields only' : 'Show all fields'}
            </Button>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-5 text-center text-body-s text-muted-foreground">
            {a.version === b.version ? 'Pick two different versions to compare them.' : 'These versions have the same content.'}
          </p>
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-36">Field</TableHead>
                  <TableHead>Version {a.version}</TableHead>
                  <TableHead>Version {b.version}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => {
                  const differs = r.before !== r.after;
                  return (
                    <TableRow key={r.key} className="align-top hover:bg-transparent">
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <DiffCell text={r.before} tone={differs ? 'removed' : null} />
                      <DiffCell text={r.after} tone={differs ? 'added' : null} />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section aria-labelledby="versions-heading" className="flex flex-col gap-3">
        <h2 id="versions-heading" className="text-headline-s">
          All versions
        </h2>
        <ol className="panel divide-y divide-border">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  Version {v.version}
                  {v.version === newest ? <span className="ms-2 text-body-s font-normal text-muted-foreground">current</span> : null}
                </p>
                <p className="text-body-s text-muted-foreground">
                  {v.author ?? (v.version === 1 ? 'Created' : 'Changed by a test run')} ·{' '}
                  <time dateTime={v.createdAt.toISOString()} title={formatDateTime(v.createdAt)}>
                    {formatRelative(v.createdAt, { now })}
                  </time>
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {v.changed.length === 0 ? (
                  <Badge variant="secondary" className="font-normal">
                    Created
                  </Badge>
                ) : (
                  v.changed.map((c) => (
                    <Badge key={c} variant="secondary" className="font-normal">
                      {CHANGE_LABELS[c] ?? c}
                    </Badge>
                  ))
                )}
              </div>
              {canEdit && onRestore && v.version !== newest ? (
                <Button variant="outline" size="sm" disabled={pendingVersion !== null && pendingVersion !== undefined} onClick={() => onRestore(v.version)}>
                  <RotateCcw className="size-3.5" />
                  {pendingVersion === v.version ? 'Restoring…' : `Restore version ${v.version}`}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function DiffCell({ text, tone }: { text: string; tone: 'added' | 'removed' | null }) {
  return (
    <TableCell
      className={cn(
        'max-w-md text-body-m whitespace-pre-wrap',
        tone === 'removed' && 'bg-danger-subtle text-danger-text',
        tone === 'added' && 'bg-success-subtle text-success-text',
      )}
    >
      {text || <span className={cn(!tone && 'text-muted-foreground')}>Not set</span>}
      {tone ? <span className="sr-only">{tone === 'removed' ? ' (before)' : ' (after)'}</span> : null}
    </TableCell>
  );
}
