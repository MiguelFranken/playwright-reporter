'use client';

import { MoreHorizontal, Pencil, Printer, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@miguelfranken/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@miguelfranken/ui/components/dropdown-menu';
import { TypeToConfirmDialog } from '@miguelfranken/ui/patterns/type-to-confirm-dialog';
import { caseKey } from '@miguelfranken/ui/lib/test-cases';
import { PrefetchLink } from '@/components/prefetch-link';
import { deleteCases } from '@/app/(app)/teams/[team]/projects/[project]/cases/actions';
import type { ProjectRef } from '@/lib/rpc/client';

/** The header actions of a case page: edit, print, delete. */
export function CaseActions({
  base,
  projectRef,
  caseId,
  number,
  canEdit,
  canDelete,
}: {
  base: string;
  projectRef: ProjectRef;
  caseId: string;
  number: number;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const key = caseKey(number);

  return (
    <>
      {canEdit ? (
        <PrefetchLink href={`${base}/cases/${number}/edit`} className={buttonVariants({ size: 'sm' })}>
          <Pencil className="size-3.5" />
          Edit
        </PrefetchLink>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={`More actions for ${key}`} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => window.print()}>
            <Printer />
            Print
          </DropdownMenuItem>
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <TypeToConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${key}?`}
        description="The case, its history and its links to Playwright tests are deleted. The tests and their runs stay."
        expected={key}
        inputLabel="Case key"
        confirmLabel="Delete test case"
        pendingLabel="Deleting…"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteCases(projectRef, [caseId]);
            if (!res.ok) {
              toast.error(res.message);
              return;
            }
            toast.success(`${key} deleted.`);
            router.push(`${base}/cases`);
          })
        }
      />
    </>
  );
}
