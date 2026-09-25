'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AdminUsers, type AdminSecret, type AdminUserRow } from '@miguelfranken/ui/views/admin/admin-users';
import { createUserAccount, deleteUserAccount, setBanned, setInstanceRole, setTemporaryPassword } from '@/app/(app)/admin/actions';

export type { AdminUserRow } from '@miguelfranken/ui/views/admin/admin-users';

/** Binds Admin → Users to the account actions. */
export function AdminUsersCard({ users, currentUserId, query }: { users: AdminUserRow[]; currentUserId: string; query: string }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<AdminSecret | null>(null);
  const [toDelete, setToDelete] = useState<AdminUserRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [, startTransition] = useTransition();

  const onRow = (user: AdminUserRow, run: () => Promise<void>) => {
    setPendingId(user.id);
    startTransition(async () => {
      await run();
      setPendingId(null);
    });
  };

  return (
    <AdminUsers
      users={users}
      currentUserId={currentUserId}
      query={query}
      onSearch={(q) => router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : '/admin/users')}
      secret={secret}
      onSecretDismiss={() => setSecret(null)}
      createOpen={createOpen}
      onCreateOpenChange={setCreateOpen}
      creating={creating}
      onCreate={({ email, name, role }) =>
        startCreate(async () => {
          const res = await createUserAccount(email, name, role);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          setSecret({ title: 'Password', email: email.trim().toLowerCase(), value: res.password });
          setCreateOpen(false);
        })
      }
      onRoleChange={(user, role) =>
        onRow(user, async () => {
          const res = await setInstanceRole(user.id, role);
          if (!res.ok) toast.error(res.message);
          else toast.success('Instance role updated.');
        })
      }
      onTemporaryPassword={(user) =>
        onRow(user, async () => {
          const res = await setTemporaryPassword(user.id);
          if (!res.ok) toast.error(res.message);
          else setSecret({ title: 'Temporary password', email: user.email, value: res.password });
        })
      }
      onBanToggle={(user) =>
        onRow(user, async () => {
          const res = await setBanned(user.id, !user.banned);
          if (!res.ok) toast.error(res.message);
          else toast.success(user.banned ? 'User unbanned.' : 'User banned and signed out.');
        })
      }
      toDelete={toDelete}
      onDeleteRequest={setToDelete}
      onDelete={(user) =>
        onRow(user, async () => {
          const res = await deleteUserAccount(user.id);
          if (!res.ok) toast.error(res.message);
          else {
            toast.success('User deleted.');
            setToDelete(null);
          }
        })
      }
      pendingId={pendingId}
    />
  );
}
