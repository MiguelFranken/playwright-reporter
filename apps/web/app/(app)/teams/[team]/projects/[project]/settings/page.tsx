import path from 'node:path';
import { Suspense } from 'react';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { ProjectDangerZone } from '@/components/settings/danger-zone';
import { ProjectRenameForm } from '@/components/settings/project-form';
import { DefaultBranchForm } from '@/components/settings/default-branch-form';
import { ReporterSetup } from '@miguelfranken/ui/views/settings/reporter-setup';
import { StorageCard } from '@miguelfranken/ui/views/settings/storage-card';
import { TokensCard, type TokenRow } from '@/components/settings/tokens-card';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { requireProject } from '@/lib/auth/access';
import { s3ConfigFromEnv } from '@/lib/storage/s3-config';
import { listTokens } from '@/lib/db/queries/projects';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';
import { baseUrl, storageDriver } from '@/lib/storage';

type Params = Promise<{ team: string; project: string }>;

export default function SettingsPage(props: { params: Params }) {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent {...props} />
    </Suspense>
  );
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function SettingsContent({ params }: { params: Params }) {
  const { team, project: projectSlug } = await params;
  const access = await requireProject(team, projectSlug);
  const { project } = access;

  // Viewers do not see the token card at all: it is also the place where new
  // secrets are minted.
  const canSeeTokens = access.can({ token: ['read'] });
  const canUpdate = access.can({ project: ['update'] });
  const canDelete = access.can({ project: ['delete'] });
  const configuredBranch = typeof project.settings.defaultBranch === 'string' ? project.settings.defaultBranch : '';
  // Resolved with empty settings on purpose: the placeholder shows what an empty field falls back to.
  const [tokens, fallbackBranch] = await Promise.all([
    canSeeTokens ? listTokens(project.id) : [],
    canUpdate ? defaultBranch(project.id, {}) : null,
  ]);

  const rows: TokenRow[] = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    createdAt: formatRelative(t.createdAt),
    createdAtTitle: formatDateTime(t.createdAt),
    lastUsedAt: t.lastUsedAt ? formatRelative(t.lastUsedAt) : null,
    lastUsedAtTitle: t.lastUsedAt ? formatDateTime(t.lastUsedAt) : null,
    revokedAt: t.revokedAt ? formatRelative(t.revokedAt) : null,
    revokedAtTitle: t.revokedAt ? formatDateTime(t.revokedAt) : null,
  }));

  const driver = storageDriver();
  const localDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STORAGE_LOCAL_DIR ?? '.storage');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Project details, API tokens and reporter setup." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>Identity and counters for this project.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Team</dt>
              <dd className="text-code-s leading-5">{access.team.slug}</dd>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="text-code-s leading-5">{project.slug}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="tabular-nums" title={formatDateTime(project.createdAt)}>
                {formatRelative(project.createdAt)}
              </dd>
              <dt className="text-muted-foreground">Run counter</dt>
              <dd className="tabular-nums">{project.runCounter}</dd>
              <dt className="text-muted-foreground">Project id</dt>
              <dd className="break-all text-code-s leading-5 text-muted-foreground">{project.id}</dd>
            </dl>
            {canUpdate ? <ProjectRenameForm teamSlug={team} projectSlug={project.slug} name={project.name} /> : null}
            {canUpdate && fallbackBranch ? (
              <DefaultBranchForm teamSlug={team} projectSlug={project.slug} value={configuredBranch} fallback={fallbackBranch} />
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>Where test attachments are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <StorageCard driver={driver} localDir={localDir} blobConfigured={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} {...s3Settings(driver)} />
          </CardContent>
        </Card>
      </div>

      {canSeeTokens ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>API tokens</CardTitle>
              <CardDescription>Credentials used by the Playwright reporter to upload runs.</CardDescription>
            </CardHeader>
            <CardContent>
              <TokensCard teamSlug={team} projectSlug={project.slug} tokens={rows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reporter setup</CardTitle>
              <CardDescription>Connect a Playwright project to this server.</CardDescription>
            </CardHeader>
            <CardContent>
              <ReporterSetup baseUrl={baseUrl()} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {canDelete ? <ProjectDangerZone teamSlug={team} projectSlug={project.slug} name={project.name} /> : null}
    </div>
  );
}

/** The S3 settings the storage card shows (never the credentials), or why they are unusable. */
function s3Settings(driver: string) {
  if (driver !== 's3') return {};
  try {
    const c = s3ConfigFromEnv();
    return { s3: { bucket: c.bucket, region: c.region, endpoint: c.endpoint ?? null, keyPrefix: c.keyPrefix, lifecycle: c.retention === 'provider' } };
  } catch (error) {
    return { s3: null, s3Error: (error as Error).message };
  }
}
