'use client';

import { ExternalLink } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Skeleton } from '../../components/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/sheet';

/**
 * The drawer opens on the click, not on the data: the caller passes whatever it
 * already knows about the test — which, coming from a list row, is normally the
 * whole header — and the body fills in underneath. The fields are optional only
 * for the deep-link case, where the drawer opens before any row is on screen.
 */
export function TestDrawer({
  open,
  onOpenChange,
  testPageHref,
  title,
  file,
  platform,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where "Open full page" goes. Resolved by the host. */
  testPageHref: string;
  title?: string;
  file?: string;
  platform?: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex items-start gap-2">
            {title ? (
              <SheetTitle className="min-w-0 flex-1 truncate leading-tight" title={title}>
                {title}
              </SheetTitle>
            ) : (
              <>
                {/* The dialog still needs an accessible name before the title lands. */}
                <SheetTitle className="sr-only">Test details</SheetTitle>
                <Skeleton className="h-5 flex-1" />
              </>
            )}
            {platform ? (
              <Badge variant="outline" className="shrink-0 font-normal">
                {platform}
              </Badge>
            ) : null}
          </div>
          {file ? (
            <SheetDescription className="truncate text-code-s" title={file}>
              {file}
            </SheetDescription>
          ) : (
            <Skeleton className="h-4 w-2/3" />
          )}
          <div className="mt-2">
            <Button variant="outline" size="xs" nativeButton={false} render={<Link href={testPageHref} />}>
              <ExternalLink data-icon="inline-start" />
              Open full page
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
