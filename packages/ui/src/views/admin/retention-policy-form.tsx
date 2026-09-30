'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { SegmentedControl } from '../../components/segmented-control';
import { ARTIFACT_KIND_LABELS, type ArtifactKind } from '../../lib/artifact-kind';
import { formatDateTime, formatRelative } from '../../lib/format';
import { useFormFields, type FormFields } from '../../hooks/use-form-fields';

export { ARTIFACT_KIND_LABELS, type ArtifactKind } from '../../lib/artifact-kind';

export interface RetentionPolicyValue {
  enabled: boolean;
  /** Lifetime in days for every kind without an override. */
  days: number;
  overrides: Partial<Record<ArtifactKind, number>>;
  /** Keeps the screens the library shows and flows with open comment threads, however old. */
  keepVisuals: boolean;
}

export interface RetentionPolicyFormProps {
  policy: RetentionPolicyValue;
  kinds: readonly ArtifactKind[];
  /**
   * The form action — the app passes its `useActionState` dispatcher. Fields:
   * `enabled` (`on` | `off`), `days`, `days.<kind>` per override, and
   * `visuals` (`keep` | `expire`).
   */
  action: (formData: FormData) => void;
  pending?: boolean;
  /**
   * The form's fields, under the names it posts, each time the user changes
   * one — for a preview of what saving would expire. Not called on mount.
   */
  onFieldsChange?: (fields: FormFields) => void;
  /** Shown above the Save button: the host's `PolicyPreview` of the changes. */
  preview?: React.ReactNode;
}

/**
 * Admin → Storage: whether expired artifacts are deleted, and after how long, per kind.
 *
 * The fields are uncontrolled and start from `policy`, so a new saved policy
 * (the page re-rendered after a save) remounts the form rather than changing
 * the default values of inputs that are already on screen.
 */
export function RetentionPolicyForm(props: RetentionPolicyFormProps) {
  return <PolicyFields key={JSON.stringify(props.policy)} {...props} />;
}

function PolicyFields({ policy, kinds, action, pending = false, onFieldsChange, preview }: RetentionPolicyFormProps) {
  const [enabled, setEnabled] = useState(policy.enabled ? 'on' : 'off');
  const [days, setDays] = useState(String(policy.days));
  const [visuals, setVisuals] = useState(policy.keepVisuals ? 'keep' : 'expire');
  const fields = useFormFields(onFieldsChange, [enabled, visuals]);

  return (
    <form action={action} ref={fields.ref} onChange={fields.onChange} className="flex flex-col gap-5">
      <input type="hidden" name="enabled" value={enabled} />
      <input type="hidden" name="visuals" value={visuals} />
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
                {ARTIFACT_KIND_LABELS[kind]}
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

      <div className="flex flex-col gap-1.5">
        <Label id="retention-visuals-label">Library screens and commented flows</Label>
        <SegmentedControl
          aria-labelledby="retention-visuals-label"
          aria-describedby="retention-visuals-hint"
          value={visuals}
          onValueChange={setVisuals}
          items={[
            { value: 'keep', label: 'Keep' },
            { value: 'expire', label: 'Expire with their lifetime' },
          ]}
          className="self-start"
        />
        <p id="retention-visuals-hint" className="text-xs text-muted-foreground">
          {visuals === 'keep'
            ? 'The screens the library shows, and every screen of a flow with an unresolved comment, are kept however old they are.'
            : 'The library and flows with unresolved comments lose their screens like any other artifact. Approved baselines are kept either way.'}
        </p>
      </div>

      {preview}

      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? 'Saving…' : 'Save policy'}
      </Button>
    </form>
  );
}

export interface RetentionPolicySourceProps {
  /** Where the policy in force comes from. */
  source: 'saved' | 'environment' | 'default';
  updatedAt: Date | string | null;
  /** For stories and tests; defaults to the current time. */
  now?: Date;
}

/** One line above the form: whether the policy was saved here, and when. */
export function RetentionPolicySource({ source, updatedAt, now }: RetentionPolicySourceProps) {
  if (source !== 'saved') {
    return (
      <p className="text-body-s text-muted-foreground">
        {source === 'environment'
          ? 'Not saved yet: this is the default from ARTIFACT_RETENTION_DAYS. Saving here takes precedence.'
          : 'Not saved yet: every artifact is kept until retention is turned on.'}
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
