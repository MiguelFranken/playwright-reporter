'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  ChangeNameForm as ChangeNameFormView,
  ChangePasswordForm as ChangePasswordFormView,
  SessionsList,
  type SessionRow,
} from '@miguelfranken/ui/views/account/account-forms';
import { authClient } from '@/lib/auth/client';

export function ChangeNameForm({ name }: { name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ChangeNameFormView
      name={name}
      pending={pending}
      onSubmit={(value) =>
        startTransition(async () => {
          const { error } = await authClient.updateUser({ name: value });
          if (error) {
            toast.error(error.message ?? 'Could not save your name.');
            return;
          }
          toast.success('Display name updated.');
          // The sidebar renders the name from the session on the server, so the
          // whole tree has to re-render for the new one to show up there.
          router.refresh();
        })
      }
    />
  );
}

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  // A new key remounts the form, which clears it after a successful change.
  const [generation, setGeneration] = useState(0);
  return (
    <ChangePasswordFormView
      key={generation}
      pending={pending}
      onSubmit={({ current, next }) =>
        startTransition(async () => {
          const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
          if (error) {
            toast.error(error.message ?? 'Could not change the password.');
            return;
          }
          toast.success('Password changed. Other sessions were signed out.');
          setGeneration((g) => g + 1);
        })
      }
    />
  );
}

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
    <SessionsList
      sessions={sessions}
      pending={pending}
      onRevokeOthers={() =>
        startTransition(async () => {
          const { error } = await authClient.revokeOtherSessions();
          if (error) toast.error(error.message ?? 'Could not revoke the other sessions.');
          else {
            toast.success('Signed out everywhere else.');
            load();
          }
        })
      }
    />
  );
}
