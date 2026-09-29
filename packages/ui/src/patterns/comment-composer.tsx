'use client';

import { ArrowUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Kbd } from '../components/kbd';
import { cn } from '../lib/cn';

/**
 * Where a comment is written: a growing text box that posts on Enter (Shift
 * + Enter for a new line) and gives up on Escape. It clears itself after
 * posting; the host adds the comment (optimistically) and reports `pending`.
 */
export function CommentComposer({
  onSubmit,
  onCancel,
  label = 'Comment',
  placeholder = 'Add a comment…',
  submitLabel = 'Comment',
  initialValue = '',
  pending = false,
  autoFocus = false,
  maxLength = 4000,
  compact = false,
  className,
}: {
  onSubmit: (body: string) => void;
  /** Shows a Cancel button; Escape calls it too. */
  onCancel?: () => void;
  /** Accessible name of the text box. */
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  initialValue?: string;
  pending?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** One line with the send button beside it, for replies. */
  compact?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const empty = value.trim().length === 0;

  const submit = () => {
    if (empty || pending) return;
    onSubmit(value.trim());
    setValue('');
  };

  return (
    <form
      className={cn('flex gap-2', compact ? 'items-end' : 'flex-col', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape' && onCancel) {
            // The draft goes, not the dialog around it.
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        disabled={pending}
        className={cn(
          'field-sizing-content max-h-48 min-h-9 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30',
          compact && 'flex-1',
        )}
      />
      {compact ? (
        <Button type="submit" size="icon-sm" aria-label={submitLabel} disabled={empty || pending}>
          <ArrowUp />
        </Button>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="hidden items-center gap-1 text-label-xs whitespace-nowrap text-muted-foreground sm:inline-flex" title="Shift + Enter for a new line">
            <Kbd>↵</Kbd> to post
          </span>
          <div className="ml-auto flex gap-2">
            {onCancel ? (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={empty || pending}>
              {pending ? 'Posting…' : submitLabel}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
