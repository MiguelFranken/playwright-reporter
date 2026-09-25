'use client';

import { Play } from 'lucide-react';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { forceEvictStorage, runRetentionSweep, updateRetentionPolicy, type RetentionFormState } from '@/app/(app)/admin/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { formatBytes } from '@miguelfranken/ui/lib/format';
import { ForceDeleteStorage } from '@miguelfranken/ui/views/admin/force-delete-storage';
import type { FormFields } from '@miguelfranken/ui/hooks/use-form-fields';
import { PolicyPreview } from '@miguelfranken/ui/views/admin/policy-preview';
import { RetentionPolicyForm as RetentionPolicyFormView } from '@miguelfranken/ui/views/admin/retention-policy-form';
import { StorageDue } from '@miguelfranken/ui/views/admin/storage';
import type { AttachmentKind, RetentionPolicy } from '@/lib/storage/retention/policy';
import { artifactRetentionDueQuery } from '@/lib/rpc/queries';
import { PREVIEW_DEBOUNCE_MS, previewStatus, useDebounced } from './policy-preview';

/**
 * The policy form, with a preview of what saving it would expire: the fields
 * are previewed once typing pauses, and the preview goes away once they are
 * saved — the "Due" column of the usage table then shows the same numbers.
 */
export function RetentionPolicyForm({ policy, kinds }: { policy: RetentionPolicy; kinds: AttachmentKind[] }) {
  const [state, action, pending] = useActionState<RetentionFormState, FormData>(updateRetentionPolicy, null);
  const [fields, setFields] = useState<FormFields | null>(null);
  const asked = useDebounced(fields, PREVIEW_DEBOUNCE_MS);
  const query = useQuery({ ...artifactRetentionDueQuery(asked ?? {}), enabled: asked !== null });

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
    <RetentionPolicyFormView
      policy={policy}
      kinds={kinds}
      action={action}
      pending={pending}
      onFieldsChange={setFields}
      preview={
        fields ? (
          <PolicyPreview status={status} message={message}>
            {data ? <StorageDue rows={data.rows} enabled={data.enabled} /> : null}
          </PolicyPreview>
        ) : null
      }
    />
  );
}

export function RunSweepButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await runRetentionSweep();
          if (!res.ok) {
            toast.error(res.message);
          } else {
            const freed = res.expiredCount ? ` and freed ${formatBytes(res.expiredBytes)}` : '';
            toast.success(
              `Expired ${res.expiredCount} artifact${res.expiredCount === 1 ? '' : 's'}${freed}.${res.hasMore ? ' More are due: run it again.' : ''}`,
            );
          }
        })
      }
    >
      <Play data-icon="inline-start" />
      {pending ? 'Sweeping…' : 'Run now'}
    </Button>
  );
}

export function ForceDeleteButton({ expected }: { expected: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <ForceDeleteStorage
      open={open}
      onOpenChange={setOpen}
      expected={expected}
      pending={pending}
      onConfirm={(confirmation) =>
        startTransition(async () => {
          const res = await forceEvictStorage(confirmation);
          if (!res.ok) {
            toast.error(res.message);
          } else {
            setOpen(false);
            toast.success(
              `Deleted ${res.expiredCount} artifact${res.expiredCount === 1 ? '' : 's'} (${formatBytes(res.expiredBytes)}).${res.hasMore ? ' Some are left: run it again.' : ''}`,
            );
          }
        })
      }
    />
  );
}
