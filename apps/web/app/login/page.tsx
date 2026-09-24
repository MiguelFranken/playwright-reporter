import { FlaskConical } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { getCurrentUser } from '@/lib/auth/access';
import { demoUserEmail } from '@/lib/auth/demo';
import { safeNext } from '@/lib/auth/next-param';

export const metadata: Metadata = { title: 'Sign in' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden p-6">
      {/* A single wide glow keeps the page from reading as a flat grey sheet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--accent-subtle),transparent_70%)] opacity-90"
      />
      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-e2">
            <FlaskConical className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Playwright Reporter</span>
        </div>
        <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Reading the session is a request-time read, so it lives inside the boundary.
  const user = await getCurrentUser();
  if (user) redirect(next);
  return (
    <>
      <LoginForm next={next} />
      {demoUserEmail() && (
        // A plain link: `/demo` starts a session, so it must never be prefetched.
        <p className="text-center text-sm text-muted-foreground">
          Just looking?{' '}
          <a href="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">
            Explore the live demo
          </a>
        </p>
      )}
    </>
  );
}
