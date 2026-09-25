'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  TeamMembers,
  type InvitationLink,
  type InvitationRow,
  type InviteValues,
  type MemberRow as MemberRowView,
} from '@miguelfranken/ui/views/teams/team-members';
import {
  addExistingUser,
  inviteMember,
  regenerateInvitation,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '@/app/(app)/teams/[team]/settings/actions';
import { displayableAvatar } from '@/lib/avatars';
import { TEAM_ROLE_LABELS } from '@/lib/auth/permissions';

export type { InvitationRow } from '@miguelfranken/ui/views/teams/team-members';
export type MemberRow = MemberRowView;

/** Binds the members view to the team settings actions. */
export function MembersCard({
  teamSlug,
  members,
  invitations,
  currentUserId,
  canManage,
}: {
  teamSlug: string;
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState<InvitationLink | null>(null);
  const [inviting, startInvite] = useTransition();
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onMember = (member: MemberRow, run: () => Promise<void>) => {
    setPendingMemberId(member.userId);
    startTransition(async () => {
      await run();
      setPendingMemberId(null);
    });
  };
  const onInvitation = (invitation: InvitationRow, run: () => Promise<void>) => {
    setPendingInvitationId(invitation.id);
    startTransition(async () => {
      await run();
      setPendingInvitationId(null);
    });
  };

  const invite = ({ email, role, mode }: InviteValues) =>
    startInvite(async () => {
      if (mode === 'link') {
        const res = await inviteMember(teamSlug, email, role);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setLink({ email: email.trim().toLowerCase(), url: res.link });
        setInviteOpen(false);
        return;
      }
      const res = await addExistingUser(teamSlug, email, role);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success('Added to the team.');
      setInviteOpen(false);
    });

  return (
    <TeamMembers
      members={members.map((m) => ({ ...m, image: displayableAvatar(m.image) }))}
      invitations={invitations}
      currentUserId={currentUserId}
      canManage={canManage}
      link={link}
      onLinkDismiss={() => setLink(null)}
      inviteOpen={inviteOpen}
      onInviteOpenChange={setInviteOpen}
      inviting={inviting}
      onInvite={invite}
      onRoleChange={(member, role) =>
        onMember(member, async () => {
          const res = await updateMemberRole(teamSlug, member.userId, role);
          if (!res.ok) toast.error(res.message);
          else toast.success(`${member.name} is now ${TEAM_ROLE_LABELS[role].toLowerCase()}.`);
        })
      }
      onRemove={(member) =>
        onMember(member, async () => {
          const res = await removeMember(teamSlug, member.userId);
          if (!res.ok) toast.error(res.message);
          else toast.success(`${member.name} was removed from the team.`);
        })
      }
      onNewLink={(invitation) =>
        onInvitation(invitation, async () => {
          const res = await regenerateInvitation(teamSlug, invitation.id);
          if (!res.ok) toast.error(res.message);
          else setLink({ email: invitation.email, url: res.link });
        })
      }
      onRevokeInvitation={(invitation) =>
        onInvitation(invitation, async () => {
          const res = await revokeInvitation(teamSlug, invitation.id);
          if (!res.ok) toast.error(res.message);
          else toast.success('Invitation revoked.');
        })
      }
      pendingMemberId={pendingMemberId}
      pendingInvitationId={pendingInvitationId}
    />
  );
}
