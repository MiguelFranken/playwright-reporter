'use client';

import { useId, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/alert';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { SegmentedControl } from '../../components/segmented-control';
import { Switch } from '../../components/switch';
import { useFormFields, type FormFields } from '../../hooks/use-form-fields';
import { formatDateTime, formatRelative } from '../../lib/format';

export interface DataRetentionPolicyValue {
  enabled: boolean;
  runDays: number;
  keepLatestRuns: number;
  eventDays: number;
  /** `null` keeps the audit log forever. */
  auditDays: number | null;
  housekeeping: boolean;
}

export interface DataRetentionPolicyFormProps {
  policy: DataRetentionPolicyValue;
  /**
   * The form action — the app passes its `useActionState` dispatcher. Fields:
   * `enabled` and `housekeeping` (`on` | `off`), `runDays`, `keepLatestRuns`,
   * `eventDays`, `auditDays` (blank keeps the audit log forever).
   */
  action: (formData: FormData) => void;
  pending?: boolean;
  /**
   * The artifact retention lifetime in force (the longest across kinds), or
   * `null` when artifacts are kept forever. A run lifetime under it is worth a
   * word: deleting a run deletes its artifacts too.
   */
  artifactDays?: number | null;
  /**
   * The form's fields, under the names it posts, each time the user changes
   * one — for a preview of what saving would delete. Not called on mount.
   */
  onFieldsChange?: (fields: FormFields) => void;
  /** Shown above the Save button: the host's `PolicyPreview` of the changes. */
  preview?: React.ReactNode;
}

/**
 * Admin → Database: whether old run history is deleted, and what else is cleaned up.
 *
 * The fields are uncontrolled and start from `policy`, so a new saved policy
 * (the page re-rendered after a save) remounts the form rather than changing
 * the default values of inputs that are already on screen.
 */
export function DataRetentionPolicyForm(props: DataRetentionPolicyFormProps) {
  return <PolicyFields key={JSON.stringify(props.policy)} {...props} />;
}

function PolicyFields({
  policy,
  action,
  pending = false,
  artifactDays = null,
  onFieldsChange,
  preview,
}: DataRetentionPolicyFormProps) {
  const id = useId();
  const [enabled, setEnabled] = useState(policy.enabled ? 'on' : 'off');
  const [housekeeping, setHousekeeping] = useState(policy.housekeeping);
  const [runDays, setRunDays] = useState(String(policy.runDays));

  const runs = Number(runDays);
  const cutsArtifacts = Number.isFinite(runs) && runs > 0 && (artifactDays === null || runs < artifactDays);
  const fields = useFormFields(onFieldsChange, [enabled, housekeeping]);

  return (
    <form action={action} ref={fields.ref} onChange={fields.onChange} className="flex flex-col gap-5">
      <input type="hidden" name="enabled" value={enabled} />
      <input type="hidden" name="housekeeping" value={housekeeping ? 'on' : 'off'} />

      <div className="flex flex-col gap-1.5">
        <Label id={`${id}-enabled`}>Delete old run history</Label>
        <SegmentedControl
          aria-labelledby={`${id}-enabled`}
          value={enabled}
          onValueChange={setEnabled}
          items={[
            { value: 'off', label: 'Keep forever' },
            { value: 'on', label: 'After their lifetime' },
          ]}
          className="self-start"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          id={`${id}-runs`}
          name="runDays"
          label="Keep runs for (days)"
          value={runDays}
          onChange={setRunDays}
          min={1}
          max={3650}
          hint="Counted from the run's start. Results, attempts, steps, logs and artifacts go with it."
        />
        <NumberField
          id={`${id}-keep`}
          name="keepLatestRuns"
          label="Always keep the latest (runs)"
          defaultValue={String(policy.keepLatestRuns)}
          min={0}
          max={10000}
          hint="Runs per project, whatever their age, so a quiet project keeps its history. 0 keeps none."
        />
        <NumberField
          id={`${id}-events`}
          name="eventDays"
          label="Keep live events for (days)"
          defaultValue={String(policy.eventDays)}
          min={1}
          max={3650}
          hint="The event log only feeds the live view while a run is in progress."
        />
        <NumberField
          id={`${id}-audit`}
          name="auditDays"
          label="Keep the audit log for (days)"
          defaultValue={policy.auditDays === null ? '' : String(policy.auditDays)}
          required={false}
          placeholder="Forever"
          min={1}
          max={3650}
          hint="Blank keeps every entry."
        />
      </div>

      <div className="flex items-start gap-3">
        <Switch id={`${id}-housekeeping`} checked={housekeeping} onCheckedChange={setHousekeeping} className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${id}-housekeeping`}>Clean up what has expired</Label>
          <p className="text-xs text-muted-foreground">
            Sessions, verifications, OAuth codes and tokens and invitations a week past their expiry, and sweep logs older than 180 days.
          </p>
        </div>
      </div>

      {enabled === 'on' && cutsArtifacts ? (
        <Alert>
          <AlertTitle>Runs go before their artifacts would</AlertTitle>
          <AlertDescription>
            {artifactDays === null
              ? 'Artifacts are kept forever by the storage policy, but deleting a run deletes its artifacts too.'
              : `The storage policy keeps artifacts up to ${artifactDays} days, but deleting a run deletes its artifacts too.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {preview}

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? 'Saving…' : 'Save policy'}
      </Button>
    </form>
  );
}

function NumberField({
  id,
  name,
  label,
  hint,
  value,
  defaultValue,
  onChange,
  min,
  max,
  placeholder,
  required = true,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min: number;
  max: number;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        required={required}
        placeholder={placeholder}
        {...(onChange ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue })}
        className="h-8 w-28 tabular-nums"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export interface DataRetentionPolicySourceProps {
  source: 'saved' | 'environment' | 'default';
  updatedAt: Date | string | null;
  now?: Date;
}

/** One line above the form: whether the policy was saved here, and when. */
export function DataRetentionPolicySource({ source, updatedAt, now }: DataRetentionPolicySourceProps) {
  if (source !== 'saved') {
    return (
      <p className="text-body-s text-muted-foreground">
        {source === 'environment'
          ? 'Not saved yet: this is the default from DATA_RETENTION_DAYS. Saving here takes precedence.'
          : 'Not saved yet: every run is kept until data retention is turned on.'}
      </p>
    );
  }
  if (!updatedAt) return null;
  return (
    // Read off the clock, which has moved on between the server render and
    // hydration: the gap is expected, so React is told not to warn about it.
    <p className="text-body-s text-muted-foreground" title={formatDateTime(updatedAt)} suppressHydrationWarning>
      Last changed {formatRelative(updatedAt, { now })}.
    </p>
  );
}
