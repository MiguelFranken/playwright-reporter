'use client';

import { Link2, MailPlus, Trash2, UserPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  addExistingUser,
  inviteMember,
  regenerateInvitation,
  removeMember,
  revokeInvitation,
  updateMemberRole,
} from '@/app/(app)/teams/[team]/settings/actions';
import { CopyButton } from '@repo/ui/patterns/copy-button';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { TEAM_ROLE_DESCRIPTIONS, TEAM_ROLE_LABELS, type TeamRoleName } from '@/lib/auth/permissions';

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: TeamRoleName;
  instanceRole: string;
  banned: boolean;
  joinedAt: string;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: TeamRoleName;
  expiresAt: string;
  invitedBy: string | null;
};

const ROLE_ITEMS = (Object.keys(TEAM_ROLE_LABELS) as TeamRoleName[]).map((value) => ({ value, label: TEAM_ROLE_LABELS[value] }));

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
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {link ? (
        <Alert>
          <AlertTitle>Invitation link for {link.email}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>This link is shown once. Send it to the person yourself — the app does not send email.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-code-s">{link.url}</code>
              <CopyButton value={link.url} variant="outline" size="sm" successMessage="Invitation link copied">
                Copy
              </CopyButton>
            </div>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setLink(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </p>
          {canManage ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
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
                {canManage ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <MemberRowView key={m.userId} teamSlug={teamSlug} member={m} canManage={canManage} isSelf={m.userId === currentUserId} />
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
                  {canManage ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <InvitationRowView key={inv.id} teamSlug={teamSlug} invitation={inv} canManage={canManage} onLink={setLink} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <InviteDialog
        teamSlug={teamSlug}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onLink={(value) => {
          setLink(value);
          setInviteOpen(false);
        }}
      />
    </div>
  );
}

function MemberRowView({
  teamSlug,
  member,
  canManage,
  isSelf,
}: {
  teamSlug: string;
  member: MemberRow;
  canManage: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <TableRow>
      <TableCell className="font-medium">
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
          <Select
            items={ROLE_ITEMS}
            value={member.role}
            disabled={pending}
            onValueChange={(value) =>
              startTransition(async () => {
                const res = await updateMemberRole(teamSlug, member.userId, String(value));
                if (!res.ok) toast.error(res.message);
                else toast.success(`${member.name} is now ${TEAM_ROLE_LABELS[String(value) as TeamRoleName].toLowerCase()}.`);
              })
            }
          >
            <SelectTrigger size="sm" className="min-w-28" aria-label={`Role of ${member.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_ITEMS.map((r) => (
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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${member.name}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await removeMember(teamSlug, member.userId);
                if (!res.ok) toast.error(res.message);
                else toast.success(`${member.name} was removed from the team.`);
              })
            }
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function InvitationRowView({
  teamSlug,
  invitation,
  canManage,
  onLink,
}: {
  teamSlug: string;
  invitation: InvitationRow;
  canManage: boolean;
  onLink: (v: { email: string; url: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <TableRow>
      <TableCell className="font-medium">{invitation.email}</TableCell>
      <TableCell>
        <Badge variant="secondary">{TEAM_ROLE_LABELS[invitation.role]}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{invitation.invitedBy ?? '–'}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{invitation.expiresAt}</TableCell>
      {canManage ? (
        <TableCell className="flex gap-1">
          <Button
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await regenerateInvitation(teamSlug, invitation.id);
                if (!res.ok) toast.error(res.message);
                else onLink({ email: invitation.email, url: res.link });
              })
            }
          >
            <Link2 data-icon="inline-start" />
            New link
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await revokeInvitation(teamSlug, invitation.id);
                if (!res.ok) toast.error(res.message);
                else toast.success('Invitation revoked.');
              })
            }
          >
            Revoke
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function InviteDialog({
  teamSlug,
  open,
  onOpenChange,
  onLink,
}: {
  teamSlug: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLink: (v: { email: string; url: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRoleName>('member');
  const [pending, startTransition] = useTransition();

  const submit = (mode: 'link' | 'add') =>
    startTransition(async () => {
      if (mode === 'link') {
        const res = await inviteMember(teamSlug, email, role);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        setEmail('');
        onLink({ email: email.trim().toLowerCase(), url: res.link });
        return;
      }
      const res = await addExistingUser(teamSlug, email, role);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setEmail('');
      toast.success('Added to the team.');
      onOpenChange(false);
    });

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
            <Input
              id="invite-email-input"
              type="email"
              placeholder="person@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select items={ROLE_ITEMS} value={role} onValueChange={(v) => setRole(String(v) as TeamRoleName)}>
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_ITEMS.map((r) => (
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
          <Button variant="outline" size="sm" disabled={pending || !email} onClick={() => submit('add')}>
            Add existing user
          </Button>
          <Button size="sm" disabled={pending || !email} onClick={() => submit('link')}>
            <MailPlus data-icon="inline-start" />
            {pending ? 'Working…' : 'Create link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
