import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PersonalTokensTable } from '@/components/account/access-tokens-card';
import { McpSettingsCard } from '@/components/admin/mcp-settings-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ListRowsSkeleton, TableRowsSkeleton } from '@miguelfranken/ui/patterns/skeletons';
import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';
import { requireSuperadmin } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { listAllPersonalTokens } from '@/lib/db/queries/personal-tokens';
import { listAllTeams } from '@/lib/db/queries/teams';
import { mcpEnabledByEnv } from '@/lib/mcp/config';
import { getMcpSetting } from '@/lib/mcp/instance';
import { toPersonalTokenRow } from '@/lib/view-models/personal-tokens';

export const metadata: Metadata = { title: 'MCP' };

export default function AdminMcpPage() {
  return (
    <>
      <PageHeader title="MCP" description="The server AI assistants connect to, and every personal access token that can reach it." />

      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>
            Assistants connect to <code className="text-code-s">/api/mcp</code> with a personal access token.{' '}
            <Link href="/account/ai" className="text-accent-text underline-offset-4 hover:underline">
              Setup instructions
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<ListRowsSkeleton rows={2} />}>
            <SettingData />
          </Suspense>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal access tokens</CardTitle>
          <CardDescription>Every user&apos;s tokens. Revoking one disconnects the assistants using it at their next request.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<TableRowsSkeleton rows={4} columns={[20, 15, 15, 20, 15, 15]} />}>
            <TokensData />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function SettingData() {
  await requireSuperadmin();
  const setting = await getMcpSetting();
  const forcedOffByEnv = !mcpEnabledByEnv();
  return (
    <div className="flex flex-col gap-3">
      <McpSettingsCard enabled={setting.enabled} forcedOffByEnv={forcedOffByEnv} />
      <p className="text-body-s text-muted-foreground">
        Endpoint <code className="text-code-s">{baseUrl()}/api/mcp</code>
        {setting.updatedAt ? (
          <>
            {' '}
            · <span title={formatDateTime(setting.updatedAt)}>last changed {formatRelative(setting.updatedAt)}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

async function TokensData() {
  await requireSuperadmin();
  const [tokens, teams] = await Promise.all([listAllPersonalTokens(), listAllTeams()]);
  if (tokens.length === 0) return <p className="text-body-s text-muted-foreground">Nobody has created a personal access token yet.</p>;
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  return <PersonalTokensTable tokens={tokens.map((t) => toPersonalTokenRow(t, teamNames))} />;
}
