import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';

export interface DefaultBranchFormProps {
  /** The configured branch, or `''` when none is set. */
  value: string;
  /** What comparisons use when `value` is empty; shown as the placeholder. */
  fallback: string;
  /** The form action — the app passes its `useActionState` dispatcher. The field is `defaultBranch`. */
  action: (formData: FormData) => void;
  pending?: boolean;
  /** The last save's error, shown under the field. */
  error?: string | null;
  /** Hidden inputs the action needs to know which project this is. */
  children?: React.ReactNode;
}

/**
 * Project settings → Base branch. The placeholder is the branch the server
 * would fall back to right now, so an empty field still says what it means;
 * clearing the field returns to that fallback.
 */
export function DefaultBranchForm({ value, fallback, action, pending = false, error, children }: DefaultBranchFormProps) {
  return (
    <form action={action} className="flex flex-col gap-2">
      {children}
      <Label htmlFor="project-default-branch">Base branch</Label>
      <div className="flex gap-2">
        <Input
          id="project-default-branch"
          name="defaultBranch"
          defaultValue={value}
          placeholder={fallback}
          maxLength={200}
          aria-describedby="project-default-branch-help"
          className="h-8 max-w-sm"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p id="project-default-branch-help" className="text-xs text-muted-foreground">
        Used by AI assistants to tell new failures from ones already failing on the base branch.
        {value ? null : ` Leave empty to use ${fallback}.`}
      </p>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
