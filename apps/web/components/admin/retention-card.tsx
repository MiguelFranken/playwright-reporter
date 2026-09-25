'use client';

import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { runRetentionSweep, updateRetentionPolicy, type RetentionFormState } from '@/app/(app)/admin/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { formatBytes } from '@miguelfranken/ui/lib/format';
import { RetentionPolicyForm as RetentionPolicyFormView } from '@miguelfranken/ui/views/admin/retention-policy-form';
import type { AttachmentKind, RetentionPolicy } from '@/lib/storage/retention/policy';

export function RetentionPolicyForm({ policy, kinds }: { policy: RetentionPolicy; kinds: AttachmentKind[] }) {
  const [state, action, pending] = useActionState<RetentionFormState, FormData>(updateRetentionPolicy, null);

  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return <RetentionPolicyFormView policy={policy} kinds={kinds} action={action} pending={pending} />;
}

export function RunSweepButton() {
  const router = useRouter();
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
          router.refresh();
        })
      }
    >
      <Play data-icon="inline-start" />
      {pending ? 'Sweeping…' : 'Run now'}
    </Button>
  );
}
