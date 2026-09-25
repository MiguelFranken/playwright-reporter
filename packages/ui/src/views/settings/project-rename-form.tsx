import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';

export interface ProjectRenameFormProps {
  name: string;
  /** The form action — the app passes its `useActionState` dispatcher. The field is `name`. */
  action: (formData: FormData) => void;
  pending?: boolean;
  /** The last save's error, shown under the field. */
  error?: string | null;
  /** Hidden inputs the action needs to know which project this is. */
  children?: React.ReactNode;
}

/** Project settings → Project name. */
export function ProjectRenameForm({ name, action, pending = false, error, children }: ProjectRenameFormProps) {
  return (
    <form action={action} className="flex flex-col gap-2">
      {children}
      <Label htmlFor="project-name">Project name</Label>
      <div className="flex gap-2">
        <Input id="project-name" name="name" defaultValue={name} maxLength={80} required className="h-8 max-w-sm" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
