import { Alert, AlertDescription, AlertTitle } from '../components/alert';
import { Button } from '../components/button';
import { cn } from '../lib/cn';
import { CopyButton } from './copy-button';

export interface OneTimeSecretProps {
  title: React.ReactNode;
  /** Why it is shown once, and what to do with it. */
  description: React.ReactNode;
  value: string;
  successMessage?: string;
  onDismiss: () => void;
  className?: string;
}

/** A secret the app hands over exactly once — an invitation link, a temporary password — with Copy and Dismiss. */
export function OneTimeSecret({ title, description, value, successMessage = 'Copied', onDismiss, className }: OneTimeSecretProps) {
  return (
    <Alert className={cn(className)}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>{description}</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-code-s">{value}</code>
          <CopyButton value={value} variant="outline" size="sm" successMessage={successMessage}>
            Copy
          </CopyButton>
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
