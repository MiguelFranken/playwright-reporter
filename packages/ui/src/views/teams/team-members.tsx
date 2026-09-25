'use client';

import { Link2, MailPlus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_ITEMS, TEAM_ROLE_LABELS, type TeamRole } from '../../lib/team-roles';
import { OneTimeSecret } from '../../patterns/one-time-secret';
import { ProfileAvatar } from '../../patterns/profile-avatar';

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  /** Already vetted by the host; `null` shows initials. */
  image: string | null;
  role: TeamRole;
  instanceRole: string;
  banned: boolean;
  joinedAt: string;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: string;
  invitedBy: string | null;
};

export interface InvitationLink {
  email: string;
  url: string;
}

export interface InviteValues {
  email: string;
  role: TeamRole;
  /** `link`: a new account joins through a link; `add`: an existing account joins now. */
  mode: 'link' | 'add';
}

export interface TeamMembersProps {
  members: MemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  canManage: boolean;
  /** The invitation link just created, shown once until dismissed. */
  link: InvitationLink | null;
  onLinkDismiss: () => void;
  inviteOpen: boolean;
  onInviteOpenChange: (open: boolean) => void;
  inviting?: boolean;
  onInvite: (values: InviteValues) => void;
  onRoleChange: (member: MemberRow, role: TeamRole) => void;
  onRemove: (member: MemberRow) => void;
  onNewLink: (invitation: InvitationRow) => void;
  onRevokeInvitation: (invitation: InvitationRow) => void;
  /** The member whose role change or removal is in flight. */
  pendingMemberId?: string | null;
  /** The invitation whose new link or revocation is in flight. */
  pendingInvitationId?: string | null;
}

/** Team settings → Members: who is in the team, who is invited, and the invite dialog. */
export function TeamMembers({
  members,
  invitations,
  currentUserId,
  canManage,
  link,
  onLinkDismiss,
  inviteOpen,
  onInviteOpenChange,
  inviting = false,
  onInvite,
  onRoleChange,
  onRemove,
  onNewLink,
  onRevokeInvitation,
  pendingMemberId,
  pendingInvitationId,
}: TeamMembersProps) {
  return (
    <div className="flex flex-col gap-6">
      {link ? (
        <OneTimeSecret
          title={<>Invitation link for {link.email}</>}
          description="This link is shown once. Send it to the person yourself — the app does not send email."
          value={link.url}
          successMessage="Invitation link copied"
          onDismiss={onLinkDismiss}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
          {canManage ? (
            <Button size="sm" onClick={() => onInviteOpenChange(true)}>
              <UserPlus data-icon="inline-start" />
              Invite
            </Button>
          ) : null}
        </div>

        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {canManage ? (
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <MemberRowView
                  key={m.userId}
                  member={m}
                  canManage={canManage}
                  isSelf={m.userId === currentUserId}
                  pending={pendingMemberId === m.userId}
                  onRoleChange={onRoleChange}
                  onRemove={onRemove}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {invitations.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Pending invitations</p>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>Expires</TableHead>
                  {canManage ? (
                    <TableHead className="w-40">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => {
                  const pending = pendingInvitationId === inv.id;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{TEAM_ROLE_LABELS[inv.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{inv.invitedBy ?? '–'}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{inv.expiresAt}</TableCell>
                      {canManage ? (
                        <TableCell className="flex gap-1">
                          <Button variant="outline" size="xs" disabled={pending} onClick={() => onNewLink(inv)}>
                            <Link2 data-icon="inline-start" />
                            New link
                          </Button>
                          <Button variant="ghost" size="xs" disabled={pending} onClick={() => onRevokeInvitation(inv)}>
                            Revoke
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <InviteDialog open={inviteOpen} onOpenChange={onInviteOpenChange} pending={inviting} onSubmit={onInvite} />
    </div>
  );
}

function MemberRowView({
  member,
  canManage,
  isSelf,
  pending,
  onRoleChange,
  onRemove,
}: {
  member: MemberRow;
  canManage: boolean;
  isSelf: boolean;
  pending: boolean;
  onRoleChange: (member: MemberRow, role: TeamRole) => void;
  onRemove: (member: MemberRow) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <ProfileAvatar name={member.name || member.email} image={member.image} size="sm" className="me-2 inline-flex align-middle" />
        {member.name}
        {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
        {member.instanceRole === 'superadmin' ? (
          <Badge variant="outline" className="ml-1.5 text-label-xs">
            superadmin
          </Badge>
        ) : null}
        {member.banned ? (
          <Badge variant="destructive" className="ml-1.5 text-label-xs">
            banned
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{member.email}</TableCell>
      <TableCell>
        {canManage ? (
          <Select items={TEAM_ROLE_ITEMS} value={member.role} disabled={pending} onValueChange={(value) => onRoleChange(member, value as TeamRole)}>
            <SelectTrigger size="sm" className="min-w-28" aria-label={`Role of ${member.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEAM_ROLE_ITEMS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{TEAM_ROLE_LABELS[member.role]}</Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{member.joinedAt}</TableCell>
      {canManage ? (
        <TableCell>
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.name}`} disabled={pending} onClick={() => onRemove(member)}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** Email and role of the person to invite. The email clears whenever the dialog closes. */
export function InviteDialog({
  open,
  onOpenChange,
  pending = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onSubmit: (values: InviteValues) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setEmail('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to this team</DialogTitle>
          <DialogDescription>
            The app does not send email. You get a link to hand over yourself. If the person already has an account, you can add them
            directly instead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email-input">Email</Label>
            <Input id="invite-email-input" type="email" placeholder="person@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select items={TEAM_ROLE_ITEMS} value={role} onValueChange={(v) => setRole(v as TeamRole)}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEAM_ROLE_ITEMS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{TEAM_ROLE_DESCRIPTIONS[role]}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={pending || !email} onClick={() => onSubmit({ email, role, mode: 'add' })}>
            Add existing user
          </Button>
          <Button size="sm" disabled={pending || !email} onClick={() => onSubmit({ email, role, mode: 'link' })}>
            <MailPlus data-icon="inline-start" />
            {pending ? 'Working…' : 'Create link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
