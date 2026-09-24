import { ArrowRight, ExternalLink } from 'lucide-react';
import { Button } from '../components/button';
import { Link } from '../provider';
import { cn } from '../lib/cn';
import { appearanceVariant, type MarketingLink } from '../lib/marketing';

/**
 * A CTA. Renders through the host's link component (`next/link` in the app, a
 * plain anchor in Storybook) inside a Button, so a marketing button is exactly
 * the product's button — same height, same focus ring, same active scale.
 */
export function ActionLink({
  link,
  size = 'lg',
  className,
}: {
  link: MarketingLink;
  size?: 'default' | 'lg' | 'sm';
  className?: string;
}) {
  const appearance = link.appearance ?? 'primary';
  return (
    <Button
      variant={appearanceVariant[appearance]}
      size={size}
      className={cn(className)}
      // Rendering an anchor, so Base UI must not expect a native <button>.
      nativeButton={false}
      render={
        <Link
          href={link.href}
          target={link.external ? '_blank' : undefined}
          rel={link.external ? 'noreferrer noopener' : undefined}
        />
      }
    >
      {link.label}
      {link.external ? (
        <ExternalLink data-icon="inline-end" className="size-4" />
      ) : appearance === 'primary' ? (
        <ArrowRight data-icon="inline-end" className="size-4" />
      ) : null}
    </Button>
  );
}

/** A quieter, inline version: "See all features →". */
export function InlineLink({ link, className }: { link: MarketingLink; className?: string }) {
  return (
    <Link
      href={link.href}
      target={link.external ? '_blank' : undefined}
      rel={link.external ? 'noreferrer noopener' : undefined}
      className={cn(
        'group inline-flex items-center gap-1.5 text-label-m text-accent-text underline-offset-4 hover:underline',
        className,
      )}
    >
      {link.label}
      <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}
