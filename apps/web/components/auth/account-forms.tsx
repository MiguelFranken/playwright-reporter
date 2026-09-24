'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { authClient } from '@/lib/auth/client';

export function ChangeNameForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const { error } = await authClient.updateUser({ name: value.trim() });
          if (error) {
            toast.error(error.message ?? 'Could not save your name.');
            return;
          }
          toast.success('Display name updated.');
          // The sidebar renders the name from the session on the server, so the
          // whole tree has to re-render for the new one to show up there.
          router.refresh();
        });
      }}
    >
      <Label htmlFor="display-name">Display name</Label>
      <div className="flex gap-2">
        <Input
          id="display-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={80}
          required
          className="h-8 max-w-sm"
        />
        <Button type="submit" size="sm" disabled={pending || !value.trim() || value.trim() === name}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 10;

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch || tooShort) return;
        startTransition(async () => {
          const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
          if (error) {
            toast.error(error.message ?? 'Could not change the password.');
            return;
          }
          toast.success('Password changed. Other sessions were signed out.');
          setCurrent('');
          setNext('');
          setConfirm('');
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Repeat new password</Label>
        <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch ? <p className="text-xs text-destructive">The passwords do not match.</p> : null}
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending || !current || !next || mismatch || tooShort}>
        {pending ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  );
}

type SessionRow = { id: string; createdAt: string; userAgent: string | null; ipAddress: string | null };

export function SessionsCard() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => {
    void authClient.listSessions().then(({ data }) => {
      setSessions(
        (data ?? []).map((s) => ({
          id: s.id,
          createdAt: new Date(s.createdAt).toLocaleString(),
          userAgent: s.userAgent ?? null,
          ipAddress: s.ipAddress ?? null,
        })),
      );
    });
  };

  useEffect(load, []);

  return (
    <div className="flex flex-col gap-3">
      {sessions === null ? (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Started</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums">{s.createdAt}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? '–'}
                  </TableCell>
                  <TableCell className="text-code-s">{s.ipAddress || '–'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await authClient.revokeOtherSessions();
            if (error) toast.error(error.message ?? 'Could not revoke the other sessions.');
            else {
              toast.success('Signed out everywhere else.');
              load();
            }
          })
        }
      >
        {pending ? 'Signing out…' : 'Sign out everywhere else'}
      </Button>
    </div>
  );
}
