import Link from 'next/link';
import { Button } from '@miguelfranken/ui/components/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-title-l">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">The run, test or project you are looking for does not exist or was removed.</p>
      <Button nativeButton={false} render={<Link href="/" />}>Back to projects</Button>
    </main>
  );
}
