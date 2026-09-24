import { Suspense } from 'react';
import { AvatarUpload } from '@/components/avatar-upload';
import { TeamGeneralForm } from '@/components/teams/team-general-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { requireTeam } from '@/lib/auth/access';
import { formatDateTime } from '@miguelfranken/ui/lib/format';
import { removeTeamAvatar, updateTeamAvatar } from '@/app/(app)/teams/[team]/settings/actions';

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
      <CardContent className="flex flex-col gap-6">
        <AvatarUpload
          name={access.team.name}
          image={access.team.image}
          shape="square"
          label="Team image"
          upload={updateTeamAvatar.bind(null, team)}
          remove={removeTeamAvatar.bind(null, team)}
        />
        <TeamGeneralForm teamSlug={team} name={access.team.name} />
      </CardContent>
    </Card>
  );
}
