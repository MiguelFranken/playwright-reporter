import { cn } from '../lib/cn';

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6', className)}>
      <div className="min-w-0">
        <h1 className="text-title-m text-balance md:text-title-l">{title}</h1>
        {description ? <div className="mt-1.5 max-w-prose text-sm text-pretty text-muted-foreground">{description}</div> : null}
      </div>
      {children ? <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
