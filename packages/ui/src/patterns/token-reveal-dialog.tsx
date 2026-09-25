'use client';

import { Button } from '../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/dialog';
import { CopyButton } from './copy-button';

export interface RevealedToken {
  /** The secret, shown exactly once. */
  token: string;
  name: string;
}

export interface TokenRevealDialogProps {
  /** Open while set. */
  created: RevealedToken | null;
  onDismiss: () => void;
  /** What to do next with the token, under the secret. */
  children?: React.ReactNode;
}

/** Shows a new token's secret, the one time it can be seen. */
export function TokenRevealDialog({ created, onDismiss, children }: TokenRevealDialogProps) {
  return (
    <Dialog open={created !== null} onOpenChange={(open) => (!open ? onDismiss() : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Token created</DialogTitle>
          <DialogDescription>
            Copy the token for <span className="font-medium text-foreground">{created?.name}</span> now. It will not be shown again.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
              <code className="min-w-0 flex-1 break-all text-code-s">{created.token}</code>
              <CopyButton value={created.token} label="Copy token" successMessage="Token copied" />
            </div>
            {children}
          </>
        ) : null}
        <DialogFooter>
          <Button onClick={onDismiss}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
