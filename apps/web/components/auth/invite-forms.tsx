'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { acceptInvitationExisting, acceptInvitationNewUser } from '@/app/invite/[token]/actions';
import { PlainSignOutButton } from '@/components/app-sidebar';
import { Alert, AlertDescription } from '@miguelfranken/ui/components/alert';
import { Button } from '@miguelfranken/ui/components/button';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';

export function CreateAccountForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await acceptInvitationNewUser(token, name, password, confirm);
          if (!res.ok) {
            setError(res.message);
            return;
          }
          router.push(`/teams/${res.teamSlug}`);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-name">Your name</Label>
        <Input id="invite-name" autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-confirm">Repeat password</Label>
        <Input
          id="invite-confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch ? <p className="text-xs text-destructive">The passwords do not match.</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !name || password.length < 10 || mismatch}>
        {pending ? 'Creating account…' : 'Create account and join'}
      </Button>
    </form>
  );
}

export function JoinTeamButton({ token, teamName }: { token: string; teamName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await acceptInvitationExisting(token);
            if (!res.ok) {
              setError(res.message);
              return;
            }
            router.push(`/teams/${res.teamSlug}`);
            router.refresh();
          })
        }
      >
        {pending ? 'Joining…' : `Join ${teamName}`}
      </Button>
    </div>
  );
}

export function WrongAccountNotice({ invitedEmail, currentEmail }: { invitedEmail: string; currentEmail: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertDescription>
          This invitation is for <strong>{invitedEmail}</strong>, but you are signed in as <strong>{currentEmail}</strong>. Sign out to
          accept it with the invited account.
        </AlertDescription>
      </Alert>
      <PlainSignOutButton />
    </div>
  );
}
