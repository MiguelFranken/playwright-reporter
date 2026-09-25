import type { ReactNode } from 'react';

/**
 * A page's head, in the design system's roles: the section as an eyebrow, the
 * title, the description as a lead, then the page's actions.
 */
export function PageHeader({ section, title, description, actions }: { section?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="not-prose flex flex-col gap-3 border-b border-separator pb-8">
      {section ? <p className="text-eyebrow text-accent-text">{section}</p> : null}
      <h1 className="text-title-l text-balance text-foreground md:text-display-m">{title}</h1>
      {description ? <p className="max-w-2xl text-lead text-pretty text-muted-foreground">{description}</p> : null}
      {actions ? <div className="page-actions mt-2 flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
