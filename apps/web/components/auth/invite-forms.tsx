'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  CreateAccountForm as CreateAccountFormView,
  JoinTeamButton as JoinTeamButtonView,
  WrongAccountNotice as WrongAccountNoticeView,
} from '@miguelfranken/ui/views/auth/invitation';
import { acceptInvitationExisting, acceptInvitationNewUser } from '@/app/invite/[token]/actions';
import { PlainSignOutButton } from '@/components/app-sidebar';

/** Accepts an invitation as a new account, then opens the team. */
export function CreateAccountForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <CreateAccountFormView
      email={email}
      pending={pending}
      error={error}
      onSubmit={({ name, password, confirm }) => {
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
    />
  );
}

/** Accepts an invitation with the signed-in account, then opens the team. */
export function JoinTeamButton({ token, teamName }: { token: string; teamName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <JoinTeamButtonView
      teamName={teamName}
      pending={pending}
      error={error}
      onJoin={() =>
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
    />
  );
}

export function WrongAccountNotice({ invitedEmail, currentEmail }: { invitedEmail: string; currentEmail: string }) {
  return (
    <WrongAccountNoticeView invitedEmail={invitedEmail} currentEmail={currentEmail}>
      <PlainSignOutButton />
    </WrongAccountNoticeView>
  );
}
