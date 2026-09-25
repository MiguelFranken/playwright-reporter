'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '../../components/alert';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Label } from '../../components/label';

export const MIN_PASSWORD_LENGTH = 10;

export interface CreateAccountFormProps {
  /** The invited address; shown, never editable. */
  email: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (values: { name: string; password: string; confirm: string }) => void;
}

/** Accepting an invitation as someone new: name and password, then the account joins the team. */
export function CreateAccountForm({ email, pending = false, error, onSubmit }: CreateAccountFormProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && password !== confirm;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, password, confirm });
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
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-confirm">Repeat password</Label>
        <Input id="invite-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {mismatch ? <p className="text-xs text-destructive">The passwords do not match.</p> : null}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !name || password.length < MIN_PASSWORD_LENGTH || mismatch}>
        {pending ? 'Creating account…' : 'Create account and join'}
      </Button>
    </form>
  );
}

/** Accepting an invitation with the account already signed in. */
export function JoinTeamButton({ teamName, pending = false, error, onJoin }: { teamName: string; pending?: boolean; error?: string | null; onJoin: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={pending} onClick={onJoin}>
        {pending ? 'Joining…' : `Join ${teamName}`}
      </Button>
    </div>
  );
}

/** The invitation names another account than the one signed in. `children` is the sign-out control. */
export function WrongAccountNotice({ invitedEmail, currentEmail, children }: { invitedEmail: string; currentEmail: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertDescription>
          This invitation is for <strong>{invitedEmail}</strong>, but you are signed in as <strong>{currentEmail}</strong>. Sign out to accept it
          with the invited account.
        </AlertDescription>
      </Alert>
      {children}
    </div>
  );
}

/** A plain sign-out button for pages without a sidebar (invitation, empty states). */
export function SignOutButton({ pending = false, onSignOut }: { pending?: boolean; onSignOut: () => void }) {
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={onSignOut}>
      <LogOut data-icon="inline-start" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
