import { FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { requireTeam } from '@/lib/auth/access';
import { listTeamProjects } from '@/lib/db/queries/teams';

type Params = Promise<{ team: string }>;

export default function TeamPage({ params }: { params: Params }) {
  return (
    <>
      <PageHeader title="Projects" description="Every project in this team. Pick one to see its test health.">
        <Suspense fallback={null}>
          <NewProjectButton params={params} />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<ProjectGridSkeleton />}>
        <ProjectGrid params={params} />
      </Suspense>
    </>
  );
}

async function NewProjectButton({ params }: { params: Params }) {
  const { team: teamSlug } = await params;
  const access = await requireTeam(teamSlug);
  if (!access.can({ project: ['create'] })) return null;
  return (
    <Button size="sm" nativeButton={false} render={<Link href={`/teams/${teamSlug}/settings/projects`} />}>
      <Plus data-icon="inline-start" />
      New project
    </Button>
  );
}

async function ProjectGrid({ params }: { params: Params }) {
  const { team: teamSlug } = await params;
  const access = await requireTeam(teamSlug);
  const projects = await listTeamProjects(access.team.id);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description={
          access.can({ project: ['create'] })
            ? 'Create a project to start receiving Playwright runs.'
            : 'A team admin has not created a project yet.'
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/teams/${teamSlug}/projects/${p.slug}/dashboard`}
          className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
        >
          <Card className="h-full gap-3 transition-colors duration-150 hover:border-border-strong">
            <CardHeader>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription className="text-code-s">{p.slug}</CardDescription>
            </CardHeader>
            <CardContent className="text-body-s text-muted-foreground tabular-nums">
              {p.runCounter} {p.runCounter === 1 ? 'run' : 'runs'}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="gap-3">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-3 w-16" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
