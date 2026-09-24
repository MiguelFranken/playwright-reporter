import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AccessTokensCard } from '@/components/account/access-tokens-card';
import { ConnectedAppsCard } from '@/components/account/connected-apps-card';
import { ChangeNameForm, ChangePasswordForm, SessionsCard } from '@/components/auth/account-forms';
import { AvatarUpload } from '@/components/avatar-upload';
import { PushSettings } from '@/components/notifications/push-settings';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { requireUser } from '@/lib/auth/access';
import { patDefaultTtlDays, patMaxTtlDays } from '@/lib/auth/config';
import { isDemoUser } from '@/lib/auth/demo';
import { listAccessibleProjects } from '@/lib/auth/principal';
import { listPersonalTokens } from '@/lib/db/queries/personal-tokens';
import { listAllTeams, listMyTeams } from '@/lib/db/queries/teams';
import { describeAccess, toPersonalTokenRow } from '@/lib/view-models/personal-tokens';
import { listGrants } from '@/lib/oauth/tokens';
import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';
import { pushConfig } from '@/lib/push/config';
import { removeMyAvatar, updateMyAvatar } from '@/app/(app)/account/actions';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Account" description="Your profile, password, notifications, access tokens and active sessions." />
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
  const [teams, tokens, projects, allTeams, grants] = await Promise.all([
    listMyTeams(user.id),
    listPersonalTokens(user.id),
    listAccessibleProjects({ user, grant: null }),
    user.isSuperadmin ? listAllTeams() : Promise.resolve([]),
    listGrants(user.id),
  ]);
  const projectRefs = new Map(projects.map((p) => [p.project.id, { slug: p.project.slug, teamSlug: p.team.slug }]));
  const push = pushConfig();
  // The demo account is shared by every visitor: nothing about it can change.
  const demo = isDemoUser(user);
  const teamNames = new Map([...allTeams, ...teams].map((t) => [t.id, t.name]));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            {demo ? 'This is the shared demo account. It can look at everything and change nothing.' : 'How you appear to the rest of your teams.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!demo && (
            <>
              <AvatarUpload name={user.name || user.email} image={user.image} label="Profile image" upload={updateMyAvatar} remove={removeMyAvatar} />
              <ChangeNameForm name={user.name} />
            </>
          )}
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

      {!demo && (
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs out every other session.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      )}

      {push && (
        <Card>
          <CardHeader>
            <CardTitle>Browser notifications</CardTitle>
            <CardDescription>Set per browser: turning them on here does not turn them on elsewhere.</CardDescription>
          </CardHeader>
          <CardContent>
            <PushSettings publicKey={push.publicKey} />
          </CardContent>
        </Card>
      )}

      {!demo && (
      <Card>
        <CardHeader>
          <CardTitle>Access tokens</CardTitle>
          <CardDescription>Personal tokens for AI assistants that connect over MCP. Read-only, and never more than you can see.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccessTokensCard
            tokens={tokens.map((t) => toPersonalTokenRow(t, teamNames))}
            teams={teams.map((t) => ({ value: t.id, label: t.name }))}
            projects={projects.map((p) => ({ value: p.project.id, label: `${p.team.slug}/${p.project.slug}` }))}
            isSuperadmin={user.isSuperadmin}
            defaultDays={patDefaultTtlDays()}
            maxDays={patMaxTtlDays()}
          />
        </CardContent>
      </Card>
      )}

      {!demo && (
      <Card>
        <CardHeader>
          <CardTitle>Connected apps</CardTitle>
          <CardDescription>Assistants you connected over OAuth, such as claude.ai or ChatGPT.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAppsCard
            apps={grants.map((g) => ({
              id: g.id,
              clientName: g.clientName,
              clientHost: hostOf(g.clientUri ?? (g.kind === 'cimd' ? g.clientId : null)),
              access: describeAccess(
                {
                  projectId: g.projectId,
                  projectSlug: g.projectId ? (projectRefs.get(g.projectId)?.slug ?? null) : null,
                  projectTeamSlug: g.projectId ? (projectRefs.get(g.projectId)?.teamSlug ?? null) : null,
                  teamIds: g.teamIds,
                  allTeams: g.allTeams,
                },
                teamNames,
              ),
              connectedAt: formatRelative(g.createdAt),
              connectedAtTitle: formatDateTime(g.createdAt),
              lastUsedAt: g.lastUsedAt ? formatRelative(g.lastUsedAt) : null,
            }))}
          />
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
      )}
    </>
  );
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
