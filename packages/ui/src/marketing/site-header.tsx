'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '../components/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/sheet';
import { ThemeToggle } from '../patterns/theme-toggle';
import { Link } from '../provider';
import { cn } from '../lib/cn';
import { ActionLink } from './action-link';
import { GithubIcon } from './social-icons';
import type { MarketingLink } from '../lib/marketing';

export interface SiteHeaderProps {
  siteName: string;
  /** The logo mark. Falls back to the site name set in the CMS. */
  logo?: ReactNode;
  homeHref?: string;
  nav?: { href: string; label: string }[];
  ctas?: MarketingLink[];
  githubHref?: string | null;
  themeToggle?: boolean;
  /** Marks the current page in the nav. */
  activeHref?: string;
}

/**
 * Sticky, translucent, and flat until you scroll past it. The nav is short
 * enough to stay one level deep, so there is no dropdown here — on mobile it
 * becomes a sheet rather than an accordion of sub-menus.
 */
export function SiteHeader({
  siteName,
  logo,
  homeHref = '/',
  nav = [],
  ctas = [],
  githubHref,
  themeToggle = true,
  activeHref,
}: SiteHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center gap-4 px-5 md:px-8">
        <Link href={homeHref} className="flex shrink-0 items-center gap-2 text-headline-m">
          {logo ?? siteName}
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={activeHref === item.href ? 'page' : undefined}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-label-m text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground',
                activeHref === item.href && 'text-foreground',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {githubHref ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View on GitHub"
              nativeButton={false}
              render={<Link href={githubHref} target="_blank" rel="noreferrer noopener" />}
            >
              <GithubIcon className="size-4" />
            </Button>
          ) : null}
          {themeToggle ? <ThemeToggle /> : null}
          <div className="hidden items-center gap-2 md:flex">
            {ctas.map((cta) => (
              <ActionLink key={`${cta.href}-${cta.label}`} link={cta} size="sm" />
            ))}
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Open menu" className="md:hidden" />}
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-4/5">
              <SheetHeader>
                <SheetTitle>{siteName}</SheetTitle>
              </SheetHeader>
              <nav aria-label="Site" className="flex flex-col gap-1 px-4">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={activeHref === item.href ? 'page' : undefined}
                    className="rounded-md px-2 py-2.5 text-label-m hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-2 flex flex-col gap-2 px-4">
                {ctas.map((cta) => (
                  <ActionLink key={`${cta.href}-${cta.label}`} link={cta} className="w-full" />
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
