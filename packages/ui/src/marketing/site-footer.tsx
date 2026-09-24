import type { ComponentType } from 'react';
import { Link } from '../provider';
import { BlueskyIcon, GithubIcon, LinkedInIcon, XIcon } from './social-icons';
import type { MarketingLink } from '../lib/marketing';

export interface FooterColumn {
  title: string;
  links: MarketingLink[];
}

export interface SocialLink {
  platform: 'github' | 'x' | 'linkedin' | 'bluesky';
  url: string;
}

const SOCIAL_ICON: Record<SocialLink['platform'], ComponentType<{ className?: string }>> = {
  github: GithubIcon,
  x: XIcon,
  linkedin: LinkedInIcon,
  bluesky: BlueskyIcon,
};

const SOCIAL_LABEL: Record<SocialLink['platform'], string> = {
  github: 'GitHub',
  x: 'X',
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
};

export function SiteFooter({
  siteName,
  columns = [],
  legal = [],
  copyright,
  social = [],
}: {
  siteName: string;
  columns?: FooterColumn[];
  legal?: MarketingLink[];
  /** `{year}` is substituted; the string itself is CMS content. */
  copyright?: string | null;
  social?: SocialLink[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface-sunken">
      <div className="mx-auto w-full max-w-[72rem] px-5 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-3">
            <p className="text-headline-m">{siteName}</p>
            {social.length > 0 ? (
              <ul className="flex gap-3">
                {social.map((item) => {
                  const Icon = SOCIAL_ICON[item.platform];
                  return (
                    <li key={item.platform}>
                      <Link
                        href={item.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      >
                        <Icon className="size-4" />
                        <span className="sr-only">{SOCIAL_LABEL[item.platform]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
                <p className="text-eyebrow text-muted-foreground">{column.title}</p>
                <ul className="flex flex-col gap-2">
                  {column.links.map((item) => (
                    <li key={`${item.href}-${item.label}`}>
                      <Link
                        href={item.href}
                        target={item.external ? '_blank' : undefined}
                        rel={item.external ? 'noreferrer noopener' : undefined}
                        className="text-body-s text-muted-foreground hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-separator pt-6 text-body-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{(copyright ?? `© {year} ${siteName}`).replace('{year}', String(year))}</p>
          {legal.length > 0 ? (
            <ul className="flex flex-wrap gap-4">
              {legal.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <Link href={item.href} className="hover:text-foreground">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
