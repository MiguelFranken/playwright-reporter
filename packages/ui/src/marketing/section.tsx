import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import type { SectionBackground, SectionSettings, SectionSpacing } from '../lib/marketing';

const BACKGROUND: Record<SectionBackground, string> = {
  default: 'bg-background',
  sunken: 'bg-surface-sunken',
  accent: 'bg-accent-subtle',
};

const SPACING: Record<SectionSpacing, string> = {
  normal: 'py-16 md:py-24',
  compact: 'py-10 md:py-14',
};

/**
 * One band of the page: a full-bleed background with a 72rem column inside it.
 *
 * Every marketing block is wrapped in one of these, which is what gives the
 * page its rhythm — alternating `background` and `surface-sunken` bands, the
 * same vertical spacing everywhere, and one place to change it.
 */
export function Section({
  settings,
  className,
  innerClassName,
  children,
}: {
  settings?: SectionSettings | null;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const background = settings?.background ?? 'default';
  const spacing = settings?.spacing ?? 'normal';
  return (
    <section
      id={settings?.anchor ?? undefined}
      // Anchored sections must not slide under the sticky header.
      className={cn(BACKGROUND[background], SPACING[spacing], settings?.anchor && 'scroll-mt-20', className)}
    >
      <div className={cn('mx-auto w-full max-w-[72rem] px-5 md:px-8', innerClassName)}>{children}</div>
    </section>
  );
}
