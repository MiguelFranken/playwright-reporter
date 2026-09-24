import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import { stripAnsi } from '../lib/ansi';
import { errorCategory } from '../lib/error-category';
import { toneBadge } from '../lib/tone';

/**
 * A raw failure message, rendered the way a terminal would but clamped so a
 * stack trace cannot push the rest of a list off the screen. ANSI colour codes
 * are stripped — they arrive in the message, and a literal `ESC[31m` reads as
 * noise.
 */
export function ErrorBlock({
  message,
  lines = 4,
  className,
}: {
  message: string | null | undefined;
  /** How many lines before clamping. `0` shows the whole thing. */
  lines?: number;
  className?: string;
}) {
  const text = stripAnsi(message).trim();
  return (
    <pre
      className={cn(
        'overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-sunken p-3 text-code-s text-danger-text',
        lines > 0 && CLAMP[lines],
        className,
      )}
    >
      {text || '(no message)'}
    </pre>
  );
}

// Tailwind only emits the clamp utilities it can see, so they are listed.
const CLAMP: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  6: 'line-clamp-6',
};

/** The derived category of a failure, as a small pill. */
export function ErrorCategoryBadge({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  const category = errorCategory(message);
  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-label-xs font-medium', toneBadge[category.tone], className)}>
      {category.label}
    </Badge>
  );
}
