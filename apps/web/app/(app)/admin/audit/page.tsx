import { Suspense } from 'react';
import { PageHeader } from '@repo/ui/patterns/page-header';
import { TableRowsSkeleton } from '@repo/ui/patterns/skeletons';
import { Badge } from '@repo/ui/components/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { requireSuperadmin } from '@/lib/auth/access';
import { listAuditLogs } from '@/lib/db/queries/teams';
import { formatDateTime, formatRelative } from '@repo/ui/lib/format';

export default function AdminAuditPage() {
  return (
    <>
      <PageHeader title="Audit log" description="Who did what, when. The 200 most recent entries." />
      <div className="panel overflow-x-auto">
        <Suspense fallback={<TableRowsSkeleton rows={10} columns={[15, 20, 20, 15, 25]} />}>
          <AuditData />
        </Suspense>
      </div>
    </>
  );
}

async function AuditData() {
  await requireSuperadmin();
  const rows = await listAuditLogs({ limit: 200 });

  return (
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
  );
}
