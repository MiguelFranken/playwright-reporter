import { FlaskConical } from 'lucide-react';

/** The product's mark, as the app's sidebar shows it: the flask in an ink square. */
export function BrandMark({ className = 'size-7 rounded-lg' }: { className?: string }) {
  return (
    <span className={`flex aspect-square shrink-0 items-center justify-center bg-primary text-primary-foreground ${className}`}>
      <FlaskConical className="size-4" aria-hidden />
    </span>
  );
}

/** The nav title: mark, name and a "Docs" tag. Fumadocs wraps it in the home link. */
export function BrandTitle() {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark />
      <span className="text-headline-m whitespace-nowrap tracking-tight text-foreground">Playwright Reporter</span>
      <span className="rounded-md border border-border bg-surface-sunken px-1.5 py-0.5 font-mono max-sm:hidden text-[0.625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Docs
      </span>
    </span>
  );
}
