'use client';

import { KeyRound, Search, ShieldBan, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { OneTimeSecret } from '../../patterns/one-time-secret';

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

export type InstanceRole = 'user' | 'superadmin';

/** A password the app generated, shown once. */
export interface AdminSecret {
  title: string;
  email: string;
  value: string;
}

const ROLE_ITEMS: { value: InstanceRole; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'superadmin', label: 'Superadmin' },
];

export interface AdminUsersProps {
  users: AdminUserRow[];
  currentUserId: string;
  /** The search the list was loaded with. */
  query: string;
  onSearch: (query: string) => void;
  secret: AdminSecret | null;
  onSecretDismiss: () => void;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  creating?: boolean;
  onCreate: (values: { email: string; name: string; role: InstanceRole }) => void;
  onRoleChange: (user: AdminUserRow, role: InstanceRole) => void;
  onTemporaryPassword: (user: AdminUserRow) => void;
  onBanToggle: (user: AdminUserRow) => void;
  /** The user whose deletion is being confirmed. */
  toDelete: AdminUserRow | null;
  onDeleteRequest: (user: AdminUserRow | null) => void;
  onDelete: (user: AdminUserRow) => void;
  /** The row with an action in flight. */
  pendingId?: string | null;
}

/**
 * Admin → Users. Runs its content edge to edge for the table's sake, so the
 * parts above it re-state the card's own inset via `--card-spacing`.
 */
export function AdminUsers({
  users,
  currentUserId,
  query,
  onSearch,
  secret,
  onSecretDismiss,
  createOpen,
  onCreateOpenChange,
  creating = false,
  onCreate,
  onRoleChange,
  onTemporaryPassword,
  onBanToggle,
  toDelete,
  onDeleteRequest,
  onDelete,
  pendingId,
}: AdminUsersProps) {
  const [q, setQ] = useState(query);

  return (
    <div className="flex flex-col">
      {secret ? (
        <OneTimeSecret
          className="mx-(--card-spacing) mt-(--card-spacing)"
          title={
            <>
              {secret.title} for {secret.email}
            </>
          }
          description="Shown once. Hand it over yourself — the app does not send email."
          value={secret.value}
          onDismiss={onSecretDismiss}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-(--card-spacing) py-3">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch(q);
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search name or email"
            className="h-8 w-64"
          />
          <Button type="submit" variant="outline" size="sm">
            <Search data-icon="inline-start" />
            Search
          </Button>
        </form>
        <Button size="sm" onClick={() => onCreateOpenChange(true)}>
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
              <TableHead className="w-px">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const pending = pendingId === u.id;
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    {u.name}
                    {isSelf ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                    {u.banned ? (
                      <Badge variant="destructive" className="ml-1.5 text-label-xs" title={u.banReason ?? undefined}>
                        banned
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Select
                      items={ROLE_ITEMS}
                      value={u.role === 'superadmin' ? 'superadmin' : 'user'}
                      disabled={pending || isSelf}
                      onValueChange={(value) => onRoleChange(u, value as InstanceRole)}
                    >
                      <SelectTrigger size="sm" className="min-w-32" aria-label={`Instance role of ${u.name}`}>
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
                  <TableCell className="text-right tabular-nums">{u.teamCount}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{u.createdAt}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-1 align-middle">
                      <Button variant="outline" size="xs" disabled={pending} title="Set a temporary password" onClick={() => onTemporaryPassword(u)}>
                        <KeyRound data-icon="inline-start" />
                        Password
                      </Button>
                      {!isSelf ? (
                        <>
                          <Button variant="ghost" size="xs" disabled={pending} onClick={() => onBanToggle(u)}>
                            {u.banned ? <ShieldCheck data-icon="inline-start" /> : <ShieldBan data-icon="inline-start" />}
                            {u.banned ? 'Unban' : 'Ban'}
                          </Button>
                          <Button variant="ghost" size="icon-xs" aria-label={`Delete ${u.name}`} disabled={pending} onClick={() => onDeleteRequest(u)}>
                            <Trash2 className="text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={toDelete !== null} onOpenChange={(open) => (!open ? onDeleteRequest(null) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              {toDelete?.email} loses access immediately and is removed from {toDelete?.teamCount ?? 0} team(s). Audit entries are kept. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onDeleteRequest(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={toDelete !== null && pendingId === toDelete.id} onClick={() => toDelete && onDelete(toDelete)}>
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateUserDialog open={createOpen} onOpenChange={onCreateOpenChange} pending={creating} onSubmit={onCreate} />
    </div>
  );
}

/** Email, name and instance role of an account created directly. The fields clear whenever the dialog closes. */
export function CreateUserDialog({
  open,
  onOpenChange,
  pending = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onSubmit: (values: { email: string; name: string; role: InstanceRole }) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<InstanceRole>('user');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setEmail('');
      setName('');
    }
  }

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
            <Select items={ROLE_ITEMS} value={role} onValueChange={(v) => setRole(v as InstanceRole)}>
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
          <Button size="sm" disabled={pending || !email || !name.trim()} onClick={() => onSubmit({ email, name, role })}>
            {pending ? 'Creating…' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
