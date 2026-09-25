'use client';

import { Play } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { purgeRunHistory, runDataSweep, updateDataRetentionPolicy, type DataRetentionFormState } from '@/app/(app)/admin/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { formatBytes } from '@miguelfranken/ui/lib/format';
import type { FormFields } from '@miguelfranken/ui/hooks/use-form-fields';
import { DataRetentionDue } from '@miguelfranken/ui/views/admin/database';
import { DataRetentionPolicyForm as DataRetentionPolicyFormView } from '@miguelfranken/ui/views/admin/data-retention-policy-form';
import { PolicyPreview } from '@miguelfranken/ui/views/admin/policy-preview';
import { PurgeRunHistory } from '@miguelfranken/ui/views/admin/purge-run-history';
import type { DataRetentionPolicy, DataSweepCounts } from '@/lib/data-retention';
import { dataRetentionDueQuery } from '@/lib/rpc/queries';
import { PREVIEW_DEBOUNCE_MS, previewStatus, useDebounced } from './policy-preview';

/**
 * The policy form, with a preview of what saving it would delete: the fields
 * are previewed once typing pauses, and the preview goes away once they are
 * saved — the "Due" card beside the form then shows the same numbers.
 */
export function DataRetentionPolicyForm({ policy, artifactDays }: { policy: DataRetentionPolicy; artifactDays: number | null }) {
  const [state, action, pending] = useActionState<DataRetentionFormState, FormData>(updateDataRetentionPolicy, null);
  const [fields, setFields] = useState<FormFields | null>(null);
  const asked = useDebounced(fields, PREVIEW_DEBOUNCE_MS);
  const query = useQuery({ ...dataRetentionDueQuery(asked ?? {}), enabled: asked !== null });

  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) {
      toast.success(state.message);
      setFields(null);
    } else toast.error(state.message);
  }, [state]);

  const { status, message } = previewStatus(query, fields === asked);
  const data = query.data?.ok ? query.data : null;
  return (
    <DataRetentionPolicyFormView
      policy={policy}
      action={action}
      pending={pending}
      artifactDays={artifactDays}
      onFieldsChange={setFields}
      preview={
        fields ? (
          <PolicyPreview status={status} message={message}>
            {data ? (
              <DataRetentionDue
                due={data.due}
                enabled={data.enabled}
                caption={data.enabled ? null : 'Data retention would still be off: nothing is deleted until it is turned on.'}
              />
            ) : null}
          </PolicyPreview>
        ) : null
      }
    />
  );
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
