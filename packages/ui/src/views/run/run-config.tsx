import { Badge } from '../../components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import type { CiInfo, GitInfo, PlaywrightInfo, SystemInfo } from '@miguelfranken/protocol';
import { formatBytes, formatDateTime, formatDuration } from '../../lib/format';

/**
 * Everything the configuration tab reports. The four nested shapes come from
 * `@miguelfranken/protocol` as types only — they are the wire vocabulary, so sharing
 * them is what stops the tab drifting from what the reporter actually sends.
 */
export interface RunConfigData {
  id: string;
  executor: string;
  expectedTests: number;
  shardTotal: number;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  lastEventAt: Date;
  environment: string | null;
  tags: string[];
  gitBranch: string | null;
  gitSha: string | null;
  gitMessage: string | null;
  gitAuthorName: string | null;
  gitAuthorEmail: string | null;
  gitRepoUrl: string | null;
  prNumber: number | null;
  prUrl: string | null;
  ciProvider: string | null;
  ciBuildUrl: string | null;
  ciBuildNumber: string | null;
  ciJob: string | null;
  ciRunId: string | null;
  git: GitInfo;
  ci: CiInfo;
  system: SystemInfo;
  playwright: PlaywrightInfo;
}

type Item = { label: string; value: React.ReactNode; mono?: boolean };

function DefList({ items }: { items: Item[] }) {
  const shown = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '');
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Not reported.</p>;
  return (
    <dl className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {shown.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className={i.mono ? 'min-w-0 break-all text-code-s leading-5' : 'min-w-0 break-words'}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExtLink({ href, children }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
      {children ?? href}
    </a>
  );
}

export function RunConfig({ run }: { run: RunConfigData }) {
  const sys = run.system ?? {};
  const pw = run.playwright ?? { projects: [] };
  const git = run.git ?? {};
  const ci = run.ci ?? {};

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Source control</CardTitle>
        </CardHeader>
        <CardContent>
          <DefList
            items={[
              { label: 'Branch', value: run.gitBranch ?? git.branch, mono: true },
              { label: 'Commit', value: run.gitSha ?? git.sha, mono: true },
              { label: 'Message', value: run.gitMessage ?? git.message },
              {
                label: 'Author',
                value: run.gitAuthorName ? `${run.gitAuthorName}${run.gitAuthorEmail ? ` <${run.gitAuthorEmail}>` : ''}` : git.authorName,
              },
              { label: 'Repository', value: run.gitRepoUrl ? <ExtLink href={run.gitRepoUrl} /> : null, mono: true },
              {
                label: 'Pull request',
                value: run.prNumber ? run.prUrl ? <ExtLink href={run.prUrl}>#{run.prNumber}</ExtLink> : `#${run.prNumber}` : run.prUrl ? <ExtLink href={run.prUrl} /> : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>CI</CardTitle>
        </CardHeader>
        <CardContent>
          <DefList
            items={[
              { label: 'Executor', value: <Badge variant="outline" className="uppercase">{run.executor}</Badge> },
              { label: 'Provider', value: run.ciProvider ?? ci.provider },
              { label: 'Build', value: run.ciBuildUrl ? <ExtLink href={run.ciBuildUrl} /> : ci.buildUrl, mono: true },
              { label: 'Job', value: run.ciJob ?? ci.job },
              { label: 'Build number', value: run.ciBuildNumber ?? ci.buildNumber, mono: true },
              { label: 'CI run id', value: run.ciRunId, mono: true },
              { label: 'Shards', value: run.shardTotal > 1 ? String(run.shardTotal) : null },
            ]}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent>
          <DefList
            items={[
              { label: 'OS', value: [sys.os, sys.osRelease].filter(Boolean).join(' ') || null },
              { label: 'Architecture', value: sys.arch, mono: true },
              { label: 'CPUs', value: sys.cpus !== undefined ? String(sys.cpus) : null },
              { label: 'Memory', value: sys.memoryBytes !== undefined ? formatBytes(sys.memoryBytes) : null },
              { label: 'Node', value: sys.node, mono: true },
              { label: 'Hostname', value: sys.hostname, mono: true },
              { label: 'Timezone', value: sys.timezone },
            ]}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Run</CardTitle>
        </CardHeader>
        <CardContent>
          <DefList
            items={[
              { label: 'Environment', value: run.environment ? <Badge variant="secondary">{run.environment}</Badge> : null },
              {
                label: 'Tags',
                value:
                  run.tags.length > 0 ? (
                    <span className="flex flex-wrap gap-1">
                      {run.tags.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
              },
              { label: 'Expected tests', value: String(run.expectedTests) },
              { label: 'Started', value: formatDateTime(run.startedAt) },
              { label: 'Finished', value: run.finishedAt ? formatDateTime(run.finishedAt) : 'Still running' },
              { label: 'Duration', value: formatDuration(run.durationMs) },
              { label: 'Last event', value: formatDateTime(run.lastEventAt) },
              { label: 'Run id', value: run.id, mono: true },
            ]}
          />
        </CardContent>
      </Card>

      <Card size="sm" className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Playwright</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DefList
            items={[
              { label: 'Version', value: pw.version, mono: true },
              { label: 'Workers', value: pw.workers !== undefined ? String(pw.workers) : null },
              { label: 'Config file', value: pw.configFile, mono: true },
            ]}
          />
          {pw.projects.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Project</TableHead>
                    <TableHead>Browser</TableHead>
                    <TableHead>Viewport</TableHead>
                    <TableHead className="text-right">Retries</TableHead>
                    <TableHead className="text-right">Timeout</TableHead>
                    <TableHead>Base URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pw.projects.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name || '(default)'}</TableCell>
                      <TableCell>{p.browserName ?? '–'}</TableCell>
                      <TableCell className="tabular-nums">{p.viewport ? `${p.viewport.width}×${p.viewport.height}` : '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.retries}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatDuration(p.timeout)}</TableCell>
                      <TableCell className="max-w-64 truncate text-code-s" title={p.baseURL}>
                        {p.baseURL ?? '–'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Playwright projects reported.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
