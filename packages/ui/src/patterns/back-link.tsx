import { ArrowLeft } from 'lucide-react';
import { cn } from '../lib/cn';
import { Link } from '../provider';

/** The quiet "← Parent" link above a detail page's header. */
export function BackLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground', className)}>
      <ArrowLeft className="size-3.5" aria-hidden />
      {children}
    </Link>
  );
}
