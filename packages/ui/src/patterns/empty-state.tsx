import { Inbox } from 'lucide-react';
import { cn } from '../lib/cn';

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface-sunken/40 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface text-muted-foreground shadow-e1">
        <Icon className="size-4.5" />
      </span>
      <p className="text-sm font-medium text-balance">{title}</p>
      {description ? <div className="mt-1 max-w-md text-sm text-pretty text-muted-foreground">{description}</div> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
