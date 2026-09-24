import { Suspense } from 'react';
import { requireSuperadmin } from '@/lib/auth/access';

/**
 * Administration is a section of the shared shell, not a shell of its own; all
 * this layout adds is the instance-role gate. It stays behind Suspense so the
 * session read never blocks the static shell.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <AdminGuard />
      </Suspense>
      {children}
    </>
  );
}

async function AdminGuard() {
  await requireSuperadmin();
  return null;
}
