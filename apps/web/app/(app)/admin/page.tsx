import { Building2, FolderKanban, ScrollText, Users } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader } from '@repo/ui/patterns/page-header';
import { ListRowsSkeleton, MetricCardsSkeleton } from '@repo/ui/patterns/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/card';
import { requireSuperadmin } from '@/lib/auth/access';
import { listAllTeams, listAuditLogs, listUsers } from '@/lib/db/queries/teams';
import { formatRelative } from '@repo/ui/lib/format';

/**
 * The headings, card frames and copy never change, so they are part of the
 * static shell; only the counts and the activity list stream in.
 */
export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Administration" description="Instance-wide teams, accounts and activity." />

      <section className="grid gap-4 sm:grid-cols-3">
        <Suspense fallback={<MetricCardsSkeleton count={3} />}>
          <InstanceStats />
        </Suspense>
      </section>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            Recent activity
          </CardTitle>
          <CardDescription>
            The last few audit entries.{' '}
            <Link href="/admin/audit" className="text-accent-text underline-offset-4 hover:underline">
              See all
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Suspense fallback={<ListRowsSkeleton rows={6} />}>
            <RecentActivity />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function InstanceStats() {
  await requireSuperadmin();
  const [teams, users] = await Promise.all([listAllTeams(), listUsers()]);
  const projectCount = teams.reduce((sum, t) => sum + t.projectCount, 0);
  return (
    <>
      <StatCard icon={Building2} label="Teams" value={teams.length} href="/admin/teams" />
      <StatCard icon={Users} label="Users" value={users.length} href="/admin/users" />
      <StatCard icon={FolderKanban} label="Projects" value={projectCount} href="/admin/teams" />
    </>
  );
}

async function RecentActivity() {
  await requireSuperadmin();
  const recent = await listAuditLogs({ limit: 8 });
  if (recent.length === 0) {
    return <p className="px-5 py-6 text-body-s text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <ul className="flex flex-col">
      {recent.map((row) => (
        <li
          key={row.id}
          className="flex items-baseline justify-between gap-4 border-b border-separator px-5 py-3 last:border-b-0"
        >
          <span className="min-w-0 text-body-s">
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-code-xs">{row.action}</code>{' '}
            <span className="text-muted-foreground">
              by {row.actorName ?? row.actorEmail ?? 'system'}
              {row.teamName ? ` in ${row.teamName}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">{formatRelative(row.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function StatCard({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25">
      <Card size="sm" className="gap-2 transition-colors duration-150 hover:border-border-strong">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-eyebrow text-muted-foreground">{label}</CardTitle>
          <Icon className="size-3.5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="text-metric">{value}</CardContent>
      </Card>
    </Link>
  );
}
