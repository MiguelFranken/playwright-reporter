'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '../../components/button';
import { TypeToConfirmDialog } from '../../patterns/type-to-confirm-dialog';

export interface PurgeRunHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the superadmin must type to arm the dialog. */
  expected: string;
  pending?: boolean;
  /** Called with the typed text, which equals `expected`. */
  onConfirm: (confirmation: string) => void;
}

/**
 * "Purge history": deletes every finished run, whatever the policy says. The
 * button opens a type-to-confirm dialog; nothing happens until it is armed.
 */
export function PurgeRunHistory({ open, onOpenChange, expected, pending = false, onConfirm }: PurgeRunHistoryProps) {
  return (
    <>
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => onOpenChange(true)}>
        <Trash2 data-icon="inline-start" />
        {pending ? 'Purging…' : 'Purge history'}
      </Button>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Delete all run history"
        description="This deletes every finished run of every project — results, attempts, steps, logs and their artifacts — ignoring the retention policy. Teams, projects, members and tokens stay, and runs in progress are left alone. It cannot be undone."
        expected={expected}
        inputLabel="Confirmation"
        confirmLabel="Delete all run history"
        pendingLabel="Purging…"
        pending={pending}
        onConfirm={onConfirm}
      />
    </>
  );
}
