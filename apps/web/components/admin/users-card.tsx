'use client';

import { KeyRound, Search, ShieldBan, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { createUserAccount, deleteUserAccount, setBanned, setInstanceRole, setTemporaryPassword } from '@/app/(app)/admin/actions';
import { CopyButton } from '@miguelfranken/ui/patterns/copy-button';
import { Alert, AlertDescription, AlertTitle } from '@miguelfranken/ui/components/alert';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Button } from '@miguelfranken/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@miguelfranken/ui/components/dialog';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@miguelfranken/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  teamCount: number;
  createdAt: string;
};

const ROLE_ITEMS = [
  { value: 'user', label: 'User' },
  { value: 'superadmin', label: 'Superadmin' },
];

export function AdminUsersCard({ users, currentUserId, query }: { users: AdminUserRow[]; currentUserId: string; query: string }) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<{ title: string; email: string; value: string } | null>(null);

  return (
    // The card runs its content edge to edge for the table's sake, so the parts
    // above it re-state the card's own inset via `--card-spacing`.
    <div className="flex flex-col">
      {secret ? (
        <Alert className="mx-(--card-spacing) mt-(--card-spacing)">
          <AlertTitle>
            {secret.title} for {secret.email}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>Shown once. Hand it over yourself — the app does not send email.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-code-s">{secret.value}</code>
              <CopyButton value={secret.value} variant="outline" size="sm" successMessage="Copied">
                Copy
              </CopyButton>
            </div>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setSecret(null)}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-(--card-spacing) py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : '/admin/users');
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="h-8 w-64" />
          <Button type="submit" variant="outline" size="sm">
            <Search data-icon="inline-start" />
            Search
          </Button>
        </form>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus data-icon="inline-start" />
          New user
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Instance role</TableHead>
              <TableHead className="text-right">Teams</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <UserRowView key={u.id} user={u} isSelf={u.id === currentUserId} onSecret={setSecret} />
            ))}
          </TableBody>
        </Table>
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onSecret={setSecret} />
    </div>
  );
}

function UserRowView({
  user,
  isSelf,
  onSecret,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  onSecret: (v: { title: string; email: string; value: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.name}
        {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
        {user.banned ? (
          <Badge variant="destructive" className="ml-1.5 text-label-xs" title={user.banReason ?? undefined}>
            banned
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          items={ROLE_ITEMS}
          value={user.role === 'superadmin' ? 'superadmin' : 'user'}
          disabled={pending || isSelf}
          onValueChange={(value) =>
            startTransition(async () => {
              const res = await setInstanceRole(user.id, String(value));
              if (!res.ok) toast.error(res.message);
              else toast.success('Instance role updated.');
            })
          }
        >
          <SelectTrigger size="sm" className="min-w-32" aria-label={`Instance role of ${user.name}`}>
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
      </TableCell>
      <TableCell className="text-right tabular-nums">{user.teamCount}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{user.createdAt}</TableCell>
      <TableCell className="whitespace-nowrap text-right">
        <span className="inline-flex items-center gap-1 align-middle">
        <Button
          variant="outline"
          size="xs"
          disabled={pending}
          title="Set a temporary password"
          onClick={() =>
            startTransition(async () => {
              const res = await setTemporaryPassword(user.id);
              if (!res.ok) toast.error(res.message);
              else onSecret({ title: 'Temporary password', email: user.email, value: res.password });
            })
          }
        >
          <KeyRound data-icon="inline-start" />
          Password
        </Button>
        {!isSelf ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await setBanned(user.id, !user.banned);
                  if (!res.ok) toast.error(res.message);
                  else toast.success(user.banned ? 'User unbanned.' : 'User banned and signed out.');
                })
              }
            >
              {user.banned ? <ShieldCheck data-icon="inline-start" /> : <ShieldBan data-icon="inline-start" />}
              {user.banned ? 'Unban' : 'Ban'}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${user.name}`}
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </>
        ) : null}
        </span>

        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {user.name}?</DialogTitle>
              <DialogDescription>
                {user.email} loses access immediately and is removed from {user.teamCount} team(s). Audit entries are kept. This cannot
                be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteUserAccount(user.id);
                    if (!res.ok) toast.error(res.message);
                    else {
                      toast.success('User deleted.');
                      setConfirmDelete(false);
                    }
                  })
                }
              >
                Delete user
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onSecret,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSecret: (v: { title: string; email: string; value: string }) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>
            Creates the account directly with a generated password, shown once. For normal onboarding, invite people to a team instead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-email">Email</Label>
            <Input id="new-user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-name">Name</Label>
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-user-role">Instance role</Label>
            <Select items={ROLE_ITEMS} value={role} onValueChange={(v) => setRole(String(v))}>
              <SelectTrigger id="new-user-role" className="w-full">
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
          </div>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={pending || !email || !name.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await createUserAccount(email, name, role);
                if (!res.ok) {
                  toast.error(res.message);
                  return;
                }
                onSecret({ title: 'Password', email: email.trim().toLowerCase(), value: res.password });
                onOpenChange(false);
                setEmail('');
                setName('');
              })
            }
          >
            {pending ? 'Creating…' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
