import { buttonVariants } from '@miguelfranken/ui/components/button';
import { cn } from '@miguelfranken/ui/lib/cn';
import { ArrowRight, BookOpen, Braces, Play, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './brand';
import { DEMO } from '@/lib/layout.shared';

/**
 * The docs' front page head: the product's promise in the display roles, on a
 * faint grid under the same accent glow as the app's sign-in page.
 */
export function HomeHero() {
  return (
    <section className="not-prose relative isolate overflow-hidden rounded-2xl border border-border bg-surface-sunken px-6 pt-12 pb-10 md:px-10 md:pt-16">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(80%_70%_at_50%_0%,black,transparent_75%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-subtle),transparent_70%)] opacity-90"
      />
      <div className="flex max-w-2xl flex-col gap-5">
        <BrandMark className="size-10 rounded-xl shadow-e2" />
        <p className="text-eyebrow text-accent-text">Documentation</p>
        <h1 className="text-display-m text-balance text-foreground md:text-display-l">Every Playwright run, live, in one place.</h1>
        <p className="text-lead text-pretty text-muted-foreground">
          A reporter streams your runs from CI or a laptop to a self-hosted app that shows them while they run, keeps their
          history and artifacts, and tells you which tests are flaky, slow or broken.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href="/docs/getting-started/quick-start" className={cn(buttonVariants({ size: 'lg' }), 'group')}>
            Quick start
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
          <a href={DEMO} target="_blank" rel="noreferrer noopener" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            <Play className="size-4" />
            Live demo
          </a>
        </div>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
        <HeroLink href="/docs/getting-started/quick-start" icon={<BookOpen />} title="Guides" text="Install, deploy, administer." />
        <HeroLink href="/docs/api" icon={<Braces />} title="REST API" text="Runs, results and verdicts over HTTP." />
        <HeroLink href="/docs/ai-assistants" icon={<Sparkles />} title="AI assistants" text="Your test history, over MCP." />
      </div>
    </section>
  );
}

function HeroLink({ href, icon, title, text }: { href: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link href={href} className="group flex items-start gap-3 bg-surface p-4 transition-colors duration-150 hover:bg-muted/60">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent-text [&_svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1 text-headline-s text-foreground">
          {title}
          <ArrowRight className="size-3.5 opacity-0 transition-[opacity,translate] duration-150 group-hover:translate-x-0.5 group-hover:opacity-60" />
        </span>
        <span className="text-body-xs text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}
