'use client';

import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { Input } from '../../components/input';
import { Label } from '../../components/label';

export interface VisualDiffValues {
  threshold: number;
  autoApprove: boolean;
  maxChangedPixels: number;
  maxChangedPercent: number;
}

export interface VisualDiffFormProps {
  value: VisualDiffValues;
  /**
   * The form action — the app passes its `useActionState` dispatcher. Fields:
   * `threshold`, `autoApprove` (`on` when checked), `maxChangedPixels`, `maxChangedPercent`.
   */
  action: (formData: FormData) => void;
  pending?: boolean;
  error?: string | null;
  /** Read-only for members who may not change the project. */
  disabled?: boolean;
  /** Why nothing is measured on this deployment, when that is so. */
  inactiveReason?: string | null;
  /** Hidden inputs the action needs to know which project this is. */
  children?: React.ReactNode;
}

/**
 * Project settings → Visual comparison: how sensitive the pixel comparison of
 * review images is, and when a measured change is small enough to approve
 * for the reviewer. The default approves only changes nobody can see
 * (anti-aliasing, a different PNG encoding of the same pixels).
 */
export function VisualDiffForm({ value, action, pending = false, error, disabled = false, inactiveReason, children }: VisualDiffFormProps) {
  const off = disabled || pending;
  return (
    <form action={action} className="flex flex-col gap-4">
      {children}
      {inactiveReason ? <p className="rounded-md border border-warning-border bg-warning-subtle px-3 py-2 text-xs text-warning-text">{inactiveReason}</p> : null}
      <div className="flex items-start gap-2.5">
        <Checkbox id="visual-diff-auto" name="autoApprove" defaultChecked={value.autoApprove} disabled={off} aria-describedby="visual-diff-auto-help" className="mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="visual-diff-auto">Approve changes within the tolerance</Label>
          <p id="visual-diff-auto-help" className="text-xs text-muted-foreground">
            A changed image measured within the tolerance against its approved baseline is approved automatically, with the numbers as the reason. The baseline stays the image a
            person approved.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visual-diff-pixels">Changed pixels allowed</Label>
          <Input id="visual-diff-pixels" name="maxChangedPixels" type="number" inputMode="numeric" min={0} max={1000000} step={1} defaultValue={value.maxChangedPixels} disabled={off} className="h-8" aria-describedby="visual-diff-pixels-help" />
          <p id="visual-diff-pixels-help" className="text-xs text-muted-foreground">
            0 approves only what has no visible change.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visual-diff-percent">Or share of the image, %</Label>
          <Input id="visual-diff-percent" name="maxChangedPercent" type="number" inputMode="decimal" min={0} max={5} step={0.01} defaultValue={value.maxChangedPercent} disabled={off} className="h-8" aria-describedby="visual-diff-percent-help" />
          <p id="visual-diff-percent-help" className="text-xs text-muted-foreground">
            0 turns the share off. A page that changed size is never within it.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="visual-diff-threshold">Colour threshold</Label>
          <Input id="visual-diff-threshold" name="threshold" type="number" inputMode="decimal" min={0.01} max={0.5} step={0.01} defaultValue={value.threshold} disabled={off} className="h-8" aria-describedby="visual-diff-threshold-help" />
          <p id="visual-diff-threshold-help" className="text-xs text-muted-foreground">
            How far a pixel&apos;s colour may move before it counts as changed. Lower is stricter; 0.1 is the default.
          </p>
        </div>
      </div>
      {disabled ? null : (
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
