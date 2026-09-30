'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { CaseRow, SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import type { CaseSort } from '@miguelfranken/ui/lib/test-cases';
import { BulkBar, BulkEditDialog, type BulkEdit } from '@miguelfranken/ui/views/test-cases/bulk-actions';
import { CaseTable } from '@miguelfranken/ui/views/test-cases/case-table';
import { bulkEditCases, deleteCases, reorderCase } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import { useUrlParams } from '@/components/filters/url-filters';
import type { ProjectRef } from '@/lib/rpc/client';
import { caseListQueryKey } from '@/lib/rpc/queries';

/**
 * The case list with its selection, bulk actions, sorting (in the URL) and,
 * inside one suite in its own order, moving cases up and down.
 */
export function CaseList({
  base,
  projectRef,
  rows,
  suites,
  canEdit,
  canDelete,
  showSuite,
  reorderable,
  sort,
  dir,
  now,
  caseQuery,
}: {
  /** The list's filters, carried onto each case link so the case page can step through this list. */
  caseQuery: string;
  base: string;
  projectRef: ProjectRef;
  rows: CaseRow[];
  suites: SuiteOption[];
  canEdit: boolean;
  canDelete: boolean;
  showSuite: boolean;
  reorderable: boolean;
  sort: CaseSort;
  dir: 'asc' | 'desc';
  now: Date;
}) {
  const { set, isPending } = useUrlParams();
  const queryClient = useQueryClient();
  // Every cached list may hold a case that just changed, not only this one.
  const changed = () => void queryClient.invalidateQueries({ queryKey: caseListQueryKey() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Rows that left the list (filtered away, deleted) leave the selection too.
  const visible = new Set(rows.map((r) => r.id));
  const chosen = [...selected].filter((id) => visible.has(id));

  const apply = (edit: BulkEdit, done?: () => void) =>
    startTransition(async () => {
      const res = await bulkEditCases(projectRef, chosen, edit);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      changed();
      setSelected(new Set());
      done?.();
    });

  return (
    <div className="flex flex-col gap-3">
      {canEdit && chosen.length ? (
        <BulkBar
          count={chosen.length}
          pending={pending}
          onClear={() => setSelected(new Set())}
          onEdit={() => setEditing(true)}
          onDeprecate={() => apply({ status: 'deprecated' })}
          onDelete={() => {
            if (!canDelete) {
              toast.error('You do not have permission to delete test cases.');
              return;
            }
            if (!window.confirm(`Delete ${chosen.length} test ${chosen.length === 1 ? 'case' : 'cases'} and their history? This cannot be undone.`)) return;
            startTransition(async () => {
              const res = await deleteCases(projectRef, chosen);
              if (res.ok) {
                toast.success(res.message);
                changed();
                setSelected(new Set());
              } else toast.error(res.message);
            });
          }}
        />
      ) : null}
      <CaseTable
        rows={rows}
        hrefs={{ case: (n) => `${base}/cases/${n}${caseQuery}` }}
        now={now}
        showSuite={showSuite}
        selectable={canEdit}
        selected={selected}
        onSelectedChange={setSelected}
        sort={sort}
        dir={dir}
        isPending={isPending}
        onSortChange={(nextSort, nextDir) => set({ sort: nextSort === 'position' ? null : nextSort, dir: nextDir === 'asc' ? null : nextDir })}
        pendingId={pendingId}
        onReorder={
          canEdit && reorderable
            ? (row, direction) => {
                setPendingId(row.id);
                startTransition(async () => {
                  const res = await reorderCase(projectRef, row.id, direction);
                  if (!res.ok) toast.error(res.message);
                  else changed();
                  setPendingId(null);
                });
              }
            : undefined
        }
      />
      <BulkEditDialog
        key={editing ? 'open' : 'closed'}
        open={editing}
        onOpenChange={setEditing}
        count={chosen.length}
        suites={suites}
        pending={pending}
        onSubmit={(edit) => apply(edit, () => setEditing(false))}
      />
    </div>
  );
}
