import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { ConsentForm } from '@/components/oauth/consent-form';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { ConnectBrand, ConnectNotice } from '@miguelfranken/ui/views/connect/consent-card';
import { getCurrentUser } from '@/lib/auth/access';
import { isDemoUser } from '@/lib/auth/demo';
import { listAccessibleProjects } from '@/lib/auth/principal';
import { listMyTeams } from '@/lib/db/queries/teams';
import { validateAuthorizationRequest } from '@/lib/oauth/authorize';

export const metadata: Metadata = { title: 'Connect an assistant' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The authorization endpoint. An MCP client (claude.ai, ChatGPT, an IDE)
 * sends the browser here; the signed-in user decides what the assistant may
 * read, and is sent back to the client with a code.
 */
export default function ConnectMcpPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-md rounded-xl" />}>
        <ConnectContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ConnectContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string]))),
  ).toString();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/connect/mcp?${query}`)}`);

  const validation = await validateAuthorizationRequest(params);
  if (!validation.ok && validation.kind === 'redirect') redirect(validation.redirectTo);
  if (validation.ok && isDemoUser(user)) {
    return (
      <ConnectNotice
        icon={false}
        title="The demo account cannot connect assistants"
        description={`It is shared by every visitor. Sign in with your own account to connect ${validation.request.client.clientName}.`}
      />
    );
  }
  if (!validation.ok) {
    return <ConnectNotice title="This connection request is not valid" description={`${validation.message} Start the connection again from your assistant.`} />;
  }

  const { request } = validation;
  const [teams, projects] = await Promise.all([listMyTeams(user.id), listAccessibleProjects({ user, grant: null })]);
  const redirectHost = (() => {
    try {
      const u = new URL(request.redirectUri);
      return u.host || `${u.protocol}//`;
    } catch {
      return request.redirectUri;
    }
  })();

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <ConnectBrand />
      <ConsentForm
        request={query}
        clientName={request.client.clientName}
        verified={request.client.kind === 'cimd'}
        redirectHost={redirectHost}
        userLabel={`${user.name} <${user.email}>`}
        teams={teams.map((t) => ({ value: t.id, label: t.name }))}
        projects={projects.map((p) => ({ value: p.project.id, label: `${p.team.slug}/${p.project.slug}` }))}
        isSuperadmin={user.isSuperadmin}
      />
    </div>
  );
}
