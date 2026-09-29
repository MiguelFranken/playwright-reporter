'use client';

import { Plus, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@miguelfranken/ui/components/button';
import type { SuiteOption } from '@miguelfranken/ui/lib/test-case-models';
import { PrefetchLink } from '@/components/prefetch-link';
import { adoptTests } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';
import { ConnectedTestPicker } from './test-picker';

/**
 * The library's header actions: a new case, and adopting Playwright tests
 * as cases. `adopt` opens the picker straight away (the coverage summary
 * links there).
 */
export function LibraryActions({
  base,
  projectRef,
  suites,
  newCaseHref,
  canCreate,
  startAdopting = false,
  extra,
}: {
  base: string;
  projectRef: ProjectRef;
  suites: SuiteOption[];
  newCaseHref: string;
  canCreate: boolean;
  startAdopting?: boolean;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [adopting, setAdopting] = useState(startAdopting && canCreate);
  const [pending, startTransition] = useTransition();
  if (!canCreate) return <>{extra}</>;
  return (
    <>
      {extra}
      <Button variant="outline" size="sm" onClick={() => setAdopting(true)}>
        <Wand2 className="size-3.5" />
        Adopt tests
      </Button>
      <PrefetchLink href={newCaseHref} className={buttonVariants({ size: 'sm' })}>
        <Plus className="size-3.5" />
        New test case
      </PrefetchLink>
      <ConnectedTestPicker
        projectRef={projectRef}
        open={adopting}
        onOpenChange={(open) => {
          setAdopting(open);
          if (!open && startAdopting) router.replace(`${base}/cases`, { scroll: false });
        }}
        mode="adopt"
        title="Adopt Playwright tests"
        description="Each test becomes a test case that is already linked to it: its title, its test.step()s as steps, and suites named after its file and describe blocks. The same test in several browsers becomes one case."
        suites={suites}
        pending={pending}
        onConfirm={({ testIds, placement }) =>
          startTransition(async () => {
            const res = await adoptTests(projectRef, testIds, placement);
            if (!res.ok) {
              toast.error(res.message);
              return;
            }
            toast.success(res.message);
            setAdopting(false);
          })
        }
      />
    </>
  );
}
