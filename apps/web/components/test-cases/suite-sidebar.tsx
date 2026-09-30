'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { flattenSuites, suiteSubtree, type SuiteNode } from '@miguelfranken/ui/lib/test-case-models';
import { TypeToConfirmDialog } from '@miguelfranken/ui/patterns/type-to-confirm-dialog';
import { SuiteDialog, type SuiteDialogValues } from '@miguelfranken/ui/views/test-cases/suite-dialog';
import { SuiteTree } from '@miguelfranken/ui/views/test-cases/suite-tree';
import { createSuite, deleteSuite, reorderSuite, updateSuite } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import { useUrlParams } from '@/components/filters/url-filters';
import type { ProjectRef } from '@/lib/rpc/client';
import { caseListQuery, caseListQueryKey } from '@/lib/rpc/queries';
import { caseListKey } from '@/lib/test-cases/list-params';

type Editing = { mode: 'create'; initial: SuiteDialogValues } | { mode: 'edit'; suite: SuiteNode; initial: SuiteDialogValues };

/**
 * The suite tree with its create, edit, move and delete flows.
 *
 * Choosing a suite keeps the filters and changes the list in place (the list
 * reads a cached query per suite and filters), and resting on a suite loads
 * its list ahead of the click. Each row is still a link carrying the filters,
 * for a new tab.
 */
export function SuiteSidebar({
  base,
  projectRef,
  roots,
  total,
  unassigned,
  canEdit,
  canDelete,
}: {
  base: string;
  projectRef: ProjectRef;
  roots: SuiteNode[];
  total: number;
  unassigned: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const { params, set } = useUrlParams();
  // A suite's name, place or deletion shows in every cached list.
  const changed = () => void queryClient.invalidateQueries({ queryKey: caseListQueryKey() });
  // `null` is every case, `'unassigned'` the bucket, anything else a suite id.
  const selected = params.get('suite');
  /** The current query with another suite: `null` is every case. */
  const withSuite = (suite: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete('page');
    if (suite) next.set('suite', suite);
    else next.delete('suite');
    return next;
  };
  const hrefOf = (suite: string | null) => {
    const qs = withSuite(suite).toString();
    return qs ? `${base}/cases?${qs}` : `${base}/cases`;
  };
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<SuiteNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const all = flattenSuites(roots);
  const parents = editing?.mode === 'edit' ? all.filter((s) => !suiteSubtree(roots, editing.suite.id).has(s.value)) : all;

  return (
    <>
      <SuiteTree
        roots={roots}
        total={total}
        unassigned={unassigned}
        selected={selected}
        hrefs={{ all: hrefOf(null), unassigned: hrefOf('unassigned'), suite: (id) => hrefOf(id) }}
        onSelect={(suite) => set({ suite })}
        onIntent={(suite) => void queryClient.prefetchQuery(caseListQuery(projectRef, caseListKey(withSuite(suite))))}
        canEdit={canEdit}
        onNewSuite={(parentId) => {
          setError(null);
          setEditing({ mode: 'create', initial: { name: '', description: '', parentId } });
        }}
        onEditSuite={(suite) => {
          setError(null);
          setEditing({ mode: 'edit', suite, initial: { name: suite.name, description: suite.description, parentId: suite.parentId } });
        }}
        onMoveSuite={(suite, direction) =>
          startTransition(async () => {
            const res = await reorderSuite(projectRef, suite.id, direction);
            if (!res.ok) toast.error(res.message);
            else changed();
          })
        }
        onDeleteSuite={canDelete ? (suite) => setDeleting(suite) : undefined}
      />
      {editing ? (
        <SuiteDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          mode={editing.mode}
          initial={editing.initial}
          parents={parents}
          pending={pending}
          error={error}
          onSubmit={(values) =>
            startTransition(async () => {
              const res = editing.mode === 'create' ? await createSuite(projectRef, values) : await updateSuite(projectRef, editing.suite.id, values);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              toast.success(res.message);
              changed();
              setEditing(null);
              if ('suiteId' in res && typeof res.suiteId === 'string') set({ suite: res.suiteId });
            })
          }
        />
      ) : null}
      <TypeToConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description={
          deleting
            ? `This deletes the suite${deleting.children.length ? ', its sub-suites' : ''} and ${deleting.totalCount === 1 ? 'the test case' : `all ${deleting.totalCount} test cases`} in it, with their history.`
            : ''
        }
        expected={deleting?.name ?? ''}
        inputLabel="Suite name"
        confirmLabel="Delete suite"
        pendingLabel="Deleting…"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            if (!deleting) return;
            const res = await deleteSuite(projectRef, deleting.id);
            if (!res.ok) {
              toast.error(res.message);
              return;
            }
            toast.success(res.message);
            changed();
            const wasSelected = selected !== null && suiteSubtree(roots, deleting.id).has(selected);
            setDeleting(null);
            if (wasSelected) set({ suite: null });
          })
        }
      />
    </>
  );
}
