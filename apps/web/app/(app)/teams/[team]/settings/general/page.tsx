import { Suspense } from 'react';
import { TeamGeneralForm } from '@/components/teams/team-general-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { requireTeam } from '@/lib/auth/access';
import { formatDateTime } from '@repo/ui/lib/format';

type Params = Promise<{ team: string }>;

export default function TeamGeneralPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <TeamGeneralContent params={params} />
    </Suspense>
  );
}

async function TeamGeneralContent({ params }: { params: Params }) {
  const { team } = await params;
  const access = await requireTeam(team, { team: ['update'] });

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>
          Created {formatDateTime(access.team.createdAt)}. Deleting a team is a superadmin action — it removes every project and its
          history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TeamGeneralForm teamSlug={team} name={access.team.name} />
      </CardContent>
    </Card>
  );
}
