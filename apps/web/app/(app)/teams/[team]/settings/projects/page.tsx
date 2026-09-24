import { Suspense } from 'react';
import { ProjectsCard, type ProjectRow } from '@/components/teams/projects-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Skeleton } from '@repo/ui/components/skeleton';
import { requireTeam } from '@/lib/auth/access';
import { listTeamProjects } from '@/lib/db/queries/teams';
import { formatRelative } from '@repo/ui/lib/format';

type Params = Promise<{ team: string }>;

export default function TeamProjectsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <TeamProjectsContent params={params} />
    </Suspense>
  );
}

async function TeamProjectsContent({ params }: { params: Params }) {
  const { team } = await params;
  const access = await requireTeam(team, { project: ['read'] });
  const projects = await listTeamProjects(access.team.id);

  const rows: ProjectRow[] = projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    runCounter: p.runCounter,
    createdAt: formatRelative(p.createdAt),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardDescription>Every member of the team can see every project.</CardDescription>
      </CardHeader>
      <CardContent>
        <ProjectsCard
          teamSlug={team}
          projects={rows}
          canCreate={access.can({ project: ['create'] })}
          canDelete={access.can({ project: ['delete'] })}
        />
      </CardContent>
    </Card>
  );
}
