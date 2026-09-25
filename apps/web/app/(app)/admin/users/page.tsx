import { AdminUsersCard, type AdminUserRow } from '@/components/admin/users-card';
import { Pagination } from '@/components/filters/pagination';
import { ResultsBoundary } from '@/components/filters/results-boundary';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { requireSuperadmin } from '@/lib/auth/access';
import { parsePage } from '@/lib/db/queries/shared';
import { listUsers } from '@/lib/db/queries/teams';
import { formatRelative } from '@miguelfranken/ui/lib/format';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Users" description="Accounts on this instance. Team membership is managed from each team's settings." />
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>All accounts</CardTitle>
          <CardDescription>Search by name or email address.</CardDescription>
        </CardHeader>
        <CardContent flush className="py-0">
          <ResultsBoundary searchParams={searchParams} fallback={<TableRowsSkeleton columns={[28, 32, 12, 12]} />}>
            <UsersData searchParams={searchParams} />
          </ResultsBoundary>
        </CardContent>
      </Card>
    </>
  );
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireSuperadmin();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? '';
  const users = await listUsers(q, { page: parsePage(Array.isArray(sp.page) ? sp.page[0] : sp.page) });

  const rows: AdminUserRow[] = users.rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    banned: u.banned,
    banReason: u.banReason,
    teamCount: u.teamCount,
    createdAt: formatRelative(u.createdAt),
  }));
  return (
    <>
      <AdminUsersCard users={rows} currentUserId={me.id} query={q} />
      {users.total > users.pageSize ? (
        <div className="border-t px-(--card-spacing) py-3">
          <Pagination page={users.page} pageSize={users.pageSize} total={users.total} />
        </div>
      ) : null}
    </>
  );
}
