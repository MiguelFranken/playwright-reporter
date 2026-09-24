import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PlainSignOutButton } from '@/components/app-sidebar';
import { EmptyState } from '@repo/ui/patterns/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { requireUser } from '@/lib/auth/access';
import { listMyTeams, listTeamProjects } from '@/lib/db/queries/teams';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Suspense fallback={<Skeleton className="h-32 w-full" />}>
        <Landing />
      </Suspense>
    </main>
  );
}

/** See PROJECT_USER_MANAGEMENT_TECHNICAL_DECISIONS.md §7.3 for the routing table. */
async function Landing() {
  const user = await requireUser();
  if (user.isSuperadmin) redirect('/admin');

  const teams = await listMyTeams(user.id);
  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <EmptyState
          icon={Building2}
          title="You are not a member of any team yet"
          description="Ask an administrator for an invitation link."
        />
        <PlainSignOutButton />
      </div>
    );
  }

  if (teams.length === 1) {
    const projects = await listTeamProjects(teams[0].id);
    if (projects.length === 1) redirect(`/teams/${teams[0].slug}/projects/${projects[0].slug}/dashboard`);
    redirect(`/teams/${teams[0].slug}`);
  }

  return (
    <>
      <h1 className="mb-6 text-title-l">Your teams</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {teams.map((t) => (
          <Link key={t.id} href={`/teams/${t.slug}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
                <CardDescription className="text-code-s">{t.slug}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground capitalize">{t.role}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
