import { Suspense } from 'react';
import { MembersCard, type InvitationRow, type MemberRow } from '@/components/teams/members-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { requireTeam } from '@/lib/auth/access';
import type { TeamRoleName } from '@/lib/auth/permissions';
import { listPendingInvitations, listTeamMembers } from '@/lib/db/queries/teams';
import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';

type Params = Promise<{ team: string }>;

export default function MembersPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <MembersContent params={params} />
    </Suspense>
  );
}

async function MembersContent({ params }: { params: Params }) {
  const { team } = await params;
  const access = await requireTeam(team, { member: ['read'] });
  const canManage = access.can({ member: ['invite', 'update-role', 'remove'] });

  const [members, invitations] = await Promise.all([
    listTeamMembers(access.team.id),
    canManage ? listPendingInvitations(access.team.id) : Promise.resolve([]),
  ]);

  const memberRows: MemberRow[] = members.map((m) => ({
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: m.role as TeamRoleName,
    instanceRole: m.instanceRole,
    banned: m.banned,
    joinedAt: formatRelative(m.joinedAt),
  }));

  const invitationRows: InvitationRow[] = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role as TeamRoleName,
    expiresAt: formatDateTime(i.expiresAt),
    invitedBy: i.invitedByName ?? i.invitedByEmail ?? null,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>Who can see this team, and what they may do.</CardDescription>
      </CardHeader>
      <CardContent>
        <MembersCard
          teamSlug={team}
          members={memberRows}
          invitations={invitationRows}
          currentUserId={access.user.id}
          canManage={canManage}
        />
      </CardContent>
    </Card>
  );
}
