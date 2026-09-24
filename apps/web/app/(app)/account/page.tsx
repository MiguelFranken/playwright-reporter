import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ChangeNameForm, ChangePasswordForm, SessionsCard } from '@/components/auth/account-forms';
import { PageHeader } from '@repo/ui/patterns/page-header';
import { Badge } from '@repo/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { requireUser } from '@/lib/auth/access';
import { listMyTeams } from '@/lib/db/queries/teams';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Account" description="Your profile, password and active sessions." />
      <Suspense fallback={<AccountSkeleton />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[200, 140, 180].map((h, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ height: h }} />
      ))}
    </div>
  );
}

async function AccountContent() {
  const user = await requireUser();
  const teams = await listMyTeams(user.id);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear to the rest of your teams.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChangeNameForm name={user.name} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">Instance role</dt>
            <dd>
              <Badge variant={user.isSuperadmin ? 'default' : 'secondary'}>{user.isSuperadmin ? 'Superadmin' : 'User'}</Badge>
            </dd>
            <dt className="text-muted-foreground">Teams</dt>
            <dd className="flex flex-wrap gap-1.5">
              {teams.length === 0 ? (
                <span className="text-muted-foreground">None</span>
              ) : (
                teams.map((t) => (
                  <Link key={t.id} href={`/teams/${t.slug}`}>
                    <Badge variant="outline">
                      {t.name} · {t.role}
                    </Badge>
                  </Link>
                ))
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs out every other session.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Devices currently signed in with this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsCard />
        </CardContent>
      </Card>
    </>
  );
}
