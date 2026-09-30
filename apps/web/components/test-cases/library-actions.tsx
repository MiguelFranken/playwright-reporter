'use client';

import { Download, FileJson, FileSpreadsheet, Plus, Upload, Wand2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@miguelfranken/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@miguelfranken/ui/components/dropdown-menu';
import { ImportDialog } from '@miguelfranken/ui/views/test-cases/import-dialog';
import type { SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import { PrefetchLink } from '@/components/prefetch-link';
import { adoptTests, importCasesAction } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';
import { caseListQueryKey } from '@/lib/rpc/queries';
import { ConnectedTestPicker } from './test-picker';

/**
 * The library's header actions: a new case, and adopting Playwright tests
 * as cases. `adopt` opens the picker straight away (the coverage summary
 * links there). A new case goes into the suite on screen, and the export
 * covers it; the suite is read from the URL, since the list switches suites
 * in place.
 */
export function LibraryActions({
  base,
  projectRef,
  suites,
  newCaseHref,
  canCreate,
  startAdopting = false,
  exportHref,
  aiPrompt,
  extra,
}: {
  /** The export route; the suite on screen is added to it. */
  exportHref: string;
  base: string;
  projectRef: ProjectRef;
  suites: SuiteOption[];
  newCaseHref: string;
  canCreate: boolean;
  startAdopting?: boolean;
  /** Offered in the adopt dialog, to let an assistant sort the tests into suites. */
  aiPrompt?: string;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const search = useSearchParams();
  const suite = search.get('suite');
  const exportUrl = suite ? `${exportHref}?suite=${encodeURIComponent(suite)}` : exportHref;
  const newCaseUrl = suite && suite !== 'unassigned' ? `${newCaseHref}?suite=${encodeURIComponent(suite)}` : newCaseHref;
  const [adopting, setAdopting] = useState(startAdopting && canCreate);
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState(false);
  const [imported, importAction, importPending] = useActionState(importCasesAction, null);
  useEffect(() => {
    if (!imported?.ok) return;
    toast.success(imported.message);
    void queryClient.invalidateQueries({ queryKey: caseListQueryKey() });
  }, [imported, queryClient]);
  const exportMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-3.5" />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem render={<a href={exportUrl} download />}>
          <FileJson />
          JSON (re-imports fully)
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={`${exportUrl}${exportUrl.includes('?') ? '&' : '?'}format=csv`} download />}>
          <FileSpreadsheet />
          CSV (spreadsheet)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (!canCreate) return <>{extra}{exportMenu}</>;
  return (
    <>
      {extra}
      {exportMenu}
      <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
        <Upload className="size-3.5" />
        Import
      </Button>
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        action={importAction}
        pending={importPending}
        error={imported && !imported.ok ? imported.message : null}
        summary={imported?.ok ? imported.summary : null}
        hidden={projectRef}
      />
      <Button variant="outline" size="sm" onClick={() => setAdopting(true)}>
        <Wand2 className="size-3.5" />
        Adopt tests
      </Button>
      <PrefetchLink href={newCaseUrl} className={buttonVariants({ size: 'sm' })}>
        <Plus className="size-3.5" />
        New test case
      </PrefetchLink>
      <ConnectedTestPicker
        projectRef={projectRef}
        open={adopting}
        onOpenChange={(open) => {
          setAdopting(open);
          if (!open && startAdopting) {
            // Closing drops `adopt` alone; the filters on screen stay.
            const rest = new URLSearchParams(search.toString());
            rest.delete('adopt');
            const qs = rest.toString();
            router.replace(qs ? `${base}/cases?${qs}` : `${base}/cases`, { scroll: false });
          }
        }}
        mode="adopt"
        title="Adopt Playwright tests"
        description="Each test becomes a test case that is already linked to it: its title, its test.step()s as steps, and suites named after its file and describe blocks. The same test in several browsers becomes one case."
        suites={suites}
        pending={pending}
        aiPrompt={aiPrompt}
        onConfirm={({ testIds, placement }) =>
          startTransition(async () => {
            const res = await adoptTests(projectRef, testIds, placement);
            if (!res.ok) {
              toast.error(res.message);
              return;
            }
            toast.success(res.message);
            void queryClient.invalidateQueries({ queryKey: caseListQueryKey() });
            setAdopting(false);
          })
        }
      />
    </>
  );
}
