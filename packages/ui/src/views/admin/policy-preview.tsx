import { CircleAlert } from 'lucide-react';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../lib/cn';

export type PolicyPreviewStatus = 'loading' | 'ready' | 'updating' | 'invalid' | 'error';

export interface PolicyPreviewProps {
  /**
   * - `loading`: the first answer for these changes is on its way.
   * - `ready`: `children` show what the changed policy would delete.
   * - `updating`: `children` still show the previous answer while the next one loads.
   * - `invalid`: the changes cannot be saved as they are; `message` says why.
   * - `error`: the preview could not be worked out.
   */
  status: PolicyPreviewStatus;
  /** Why the changes are invalid, in the words the save would use. */
  message?: string;
  /** The due counts, rendered by the host with the page's own due view. */
  children?: React.ReactNode;
}

/**
 * What a retention policy form would delete if saved as it is being edited,
 * shown inside the form above its Save button.
 *
 * The frame is the same whichever policy it previews; the numbers are the
 * page's own "Due" view, passed in. While the next answer loads the previous
 * one stays on screen, dimmed, rather than flashing back to a placeholder on
 * every keystroke.
 */
export function PolicyPreview({ status, message, children }: PolicyPreviewProps) {
  return (
    <section
      aria-label="If you save these changes"
      aria-live="polite"
      aria-busy={status === 'loading' || status === 'updating'}
      className="flex flex-col gap-3 rounded-lg border border-dashed bg-surface-sunken/60 p-4"
    >
      <h3 className="text-eyebrow text-muted-foreground">If you save these changes</h3>
      {status === 'loading' ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Working out what this policy deletes">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : status === 'invalid' ? (
        <p className="flex items-start gap-2 text-body-s text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message ?? 'These values cannot be saved.'}
        </p>
      ) : status === 'error' ? (
        <p className="flex items-start gap-2 text-body-s text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Could not work out what this policy deletes. Saving still works.
        </p>
      ) : (
        <div className={cn('transition-opacity duration-150', status === 'updating' && 'opacity-60')}>{children}</div>
      )}
    </section>
  );
}
