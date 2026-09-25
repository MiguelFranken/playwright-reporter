'use client';

import { Play } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { purgeRunHistory, runDataSweep, updateDataRetentionPolicy, type DataRetentionFormState } from '@/app/(app)/admin/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { formatBytes } from '@miguelfranken/ui/lib/format';
import { DataRetentionPolicyForm as DataRetentionPolicyFormView } from '@miguelfranken/ui/views/admin/data-retention-policy-form';
import { PurgeRunHistory } from '@miguelfranken/ui/views/admin/purge-run-history';
import type { DataRetentionPolicy, DataSweepCounts } from '@/lib/data-retention';

export function DataRetentionPolicyForm({ policy, artifactDays }: { policy: DataRetentionPolicy; artifactDays: number | null }) {
  const [state, action, pending] = useActionState<DataRetentionFormState, FormData>(updateDataRetentionPolicy, null);

  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return <DataRetentionPolicyFormView policy={policy} action={action} pending={pending} artifactDays={artifactDays} />;
}

/** "Deleted 12 runs (2,904 results) and freed 1.2 GB of artifacts." */
function summary(deleted: DataSweepCounts, artifactBytes: number, hasMore: boolean) {
  const runs = `${deleted.runs.toLocaleString('en-US')} run${deleted.runs === 1 ? '' : 's'}`;
  const results = deleted.results ? ` (${deleted.results.toLocaleString('en-US')} results)` : '';
  const other = deleted.events + deleted.tests + deleted.audit + deleted.auth + deleted.sweepLogs;
  const rest = other ? `, ${other.toLocaleString('en-US')} other rows` : '';
  const freed = artifactBytes ? ` and freed ${formatBytes(artifactBytes)} of artifacts` : '';
  return `Deleted ${runs}${results}${rest}${freed}.${hasMore ? ' More is due: run it again.' : ''}`;
}

export function RunDataSweepButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await runDataSweep();
          if (!res.ok) toast.error(res.message);
          else toast.success(summary(res.deleted, res.artifactBytes, res.hasMore));
        })
      }
    >
      <Play data-icon="inline-start" />
      {pending ? 'Sweeping…' : 'Run now'}
    </Button>
  );
}

export function PurgeRunHistoryButton({ expected }: { expected: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <PurgeRunHistory
      open={open}
      onOpenChange={setOpen}
      expected={expected}
      pending={pending}
      onConfirm={(confirmation) =>
        startTransition(async () => {
          const res = await purgeRunHistory(confirmation);
          if (!res.ok) {
            toast.error(res.message);
          } else {
            setOpen(false);
            toast.success(summary(res.deleted, res.artifactBytes, res.hasMore));
          }
        })
      }
    />
  );
}
