import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Link cards in the design system's feature-grid style: a surface card with an
 * accent icon tile, lifting on hover. Replaces Fumadocs' `Cards`/`Card` in MDX.
 */
export function Cards({ children }: { children: ReactNode }) {
  return <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function Card({ title, description, href, icon, children }: { title: ReactNode; description?: ReactNode; href?: string; icon?: ReactNode; children?: ReactNode }) {
  const body = (
    <>
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 [mask-image:linear-gradient(to_bottom_left,black,transparent_60%)] group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        {icon ? <span className="flex size-9 items-center justify-center rounded-lg bg-accent-subtle text-accent-text [&_svg]:size-4.5">{icon}</span> : null}
        {href ? <ArrowUpRight className="ms-auto size-4 text-muted-foreground opacity-60 transition-[opacity,translate] duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" /> : null}
      </div>
      <div className="relative flex flex-col gap-1">
        <p className="text-headline-m text-foreground">{title}</p>
        {description ? <p className="text-body-s text-muted-foreground">{description}</p> : null}
        {children ? <div className="text-body-s text-muted-foreground">{children}</div> : null}
      </div>
    </>
  );
  const className =
    'group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-e1 transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-e2';
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
