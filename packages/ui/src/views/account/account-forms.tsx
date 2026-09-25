'use client';

import { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';

/** Account → Profile: the display name. Save arms once the trimmed name differs. */
export function ChangeNameForm({ name, pending = false, onSubmit }: { name: string; pending?: boolean; onSubmit: (name: string) => void }) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <Label htmlFor="display-name">Display name</Label>
      <div className="flex gap-2">
        <Input id="display-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} required className="h-8 max-w-sm" />
        <Button type="submit" size="sm" disabled={pending || !value.trim() || value.trim() === name}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

export interface ChangePasswordFormProps {
  pending?: boolean;
  onSubmit: (values: { current: string; next: string }) => void;
}

/**
 * Account → Password. Checks length and repetition before it submits. To clear
 * the fields after a successful change, the host remounts it with a new `key`.
 */
export function ChangePasswordForm({ pending = false, onSubmit }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 10;

  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (mismatch || tooShort) return;
        onSubmit({ current, next });
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

export type SessionRow = { id: string; createdAt: string; userAgent: string | null; ipAddress: string | null };

/** Account → Active sessions: where this account is signed in, and a way out of all the others. */
export function SessionsList({ sessions, pending = false, onRevokeOthers }: { sessions: SessionRow[] | null; pending?: boolean; onRevokeOthers: () => void }) {
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
      <Button variant="outline" size="sm" className="self-start" disabled={pending} onClick={onRevokeOthers}>
        {pending ? 'Signing out…' : 'Sign out everywhere else'}
      </Button>
    </div>
  );
}
