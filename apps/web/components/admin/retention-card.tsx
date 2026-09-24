'use client';

import { Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { runRetentionSweep, updateRetentionPolicy, type RetentionFormState } from '@/app/(app)/admin/actions';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { SegmentedControl } from '@miguelfranken/ui/components/segmented-control';
import { formatBytes } from '@miguelfranken/ui/lib/format';
import type { AttachmentKind, RetentionPolicy } from '@/lib/storage/retention/policy';

const KIND_LABELS: Record<AttachmentKind, string> = {
  screenshot: 'Screenshots',
  video: 'Videos',
  trace: 'Traces',
  image: 'Images',
  text: 'Text',
  other: 'Other',
};

export function RetentionPolicyForm({ policy, kinds }: { policy: RetentionPolicy; kinds: AttachmentKind[] }) {
  const [state, action, pending] = useActionState<RetentionFormState, FormData>(updateRetentionPolicy, null);
  const [enabled, setEnabled] = useState(policy.enabled ? 'on' : 'off');
  const [days, setDays] = useState(String(policy.days));

  useEffect(() => {
    if (!state?.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="enabled" value={enabled} />
      <div className="flex flex-col gap-1.5">
        <Label id="retention-enabled-label">Delete expired artifacts</Label>
        <SegmentedControl
          aria-labelledby="retention-enabled-label"
          value={enabled}
          onValueChange={setEnabled}
          items={[
            { value: 'off', label: 'Keep forever' },
            { value: 'on', label: 'After their lifetime' },
          ]}
          className="self-start"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="retention-days">Lifetime in days</Label>
        <Input
          id="retention-days"
          name="days"
          type="number"
          inputMode="numeric"
          min={1}
          max={3650}
          required
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-8 w-28 tabular-nums"
        />
        <p className="text-xs text-muted-foreground">Counted from the upload. Applies to every kind below left blank.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Per kind</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {kinds.map((kind) => (
            <div key={kind} className="flex flex-col gap-1">
              <Label htmlFor={`retention-${kind}`} className="text-xs text-muted-foreground">
                {KIND_LABELS[kind]}
              </Label>
              <Input
                id={`retention-${kind}`}
                name={`days.${kind}`}
                type="number"
                inputMode="numeric"
                min={1}
                max={3650}
                placeholder={days || '–'}
                defaultValue={policy.overrides[kind] ?? ''}
                className="h-8 tabular-nums"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Videos and traces are the large ones: a shorter lifetime for them frees the most space.</p>
      </fieldset>

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? 'Saving…' : 'Save policy'}
      </Button>
    </form>
  );
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
