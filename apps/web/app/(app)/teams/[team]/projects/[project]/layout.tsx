import { Suspense } from 'react';
import { requireProject } from '@/lib/auth/access';

type Params = Promise<{ team: string; project: string }>;

/**
 * The shell (sidebar, header) lives in the team layout. This layout exists only
 * to reject a project the caller may not see before any page below renders —
 * inside a Suspense boundary, because resolving access reads the session.
 */
export default function ProjectLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  return (
    <>
      <Suspense fallback={null}>
        <ProjectGuard params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function ProjectGuard({ params }: { params: Params }) {
  const { team, project } = await params;
  await requireProject(team, project);
  return null;
}
