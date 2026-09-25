import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { Pagination } from '@/components/filters/pagination';
import { ResultsBoundary } from '@/components/filters/results-boundary';
import { requireSuperadmin } from '@/lib/auth/access';
import { parsePage } from '@/lib/db/queries/shared';
import { listAuditLogPage } from '@/lib/db/queries/teams';
import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Audit log" description="Who did what, when. Newest first." />
      <ResultsBoundary
        searchParams={searchParams}
        fallback={<TableRowsSkeleton rows={10} columns={[15, 20, 20, 15, 25]} className="panel" />}
      >
        <AuditData searchParams={searchParams} />
      </ResultsBoundary>
    </>
  );
}

async function AuditData({ searchParams }: { searchParams: SearchParams }) {
  await requireSuperadmin();
  const sp = await searchParams;
  const { rows, page, pageSize, total } = await listAuditLogPage({ page: parsePage(Array.isArray(sp.page) ? sp.page[0] : sp.page) });

  return (
    <>
      <div className="panel overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted-foreground tabular-nums" title={formatDateTime(row.createdAt)}>
                    {formatRelative(row.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-code-xs">
                      {row.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.actorName ?? row.actorEmail ?? 'system'}</TableCell>
                  <TableCell className="text-muted-foreground">{row.teamName ?? '–'}</TableCell>
                  <TableCell className="max-w-md truncate text-code-xs text-muted-foreground">
                    {Object.keys(row.target).length === 0 ? '–' : JSON.stringify(row.target)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} />
    </>
  );
}
