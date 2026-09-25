import type { Meta, StoryObj } from '@storybook/react';
import { Play } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { DATA_RETENTION_POLICY, DATA_SWEEPS, DUE_PREVIEW, PROJECT_FOOTPRINTS, TABLE_SIZES, ingestDays } from '../fixtures/admin';
import { NOW, ago } from '../fixtures/now';
import { PageHeader } from '../patterns/page-header';
import { DataRetentionPolicyForm, DataRetentionPolicySource } from '../views/admin/data-retention-policy-form';
import { DataRetentionDue, DataRetentionSchedule, DataSweepsTable, ProjectFootprintTable } from '../views/admin/database';
import { DatabaseIngestChart, DatabaseSizeChart } from '../views/admin/database-charts';
import { PurgeRunHistory } from '../views/admin/purge-run-history';

const meta = {
  title: 'Pages/Admin database',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const GB = 1024 ** 3;

/** Admin → Database with a policy in force, a year of ingest and a week of sweeps. */
export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Database" description="How much run history the database holds, how fast it grows, and how long it is kept." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent>
            <DatabaseSizeChart totalBytes={5.9 * GB} historyBytes={5.78 * GB} tables={TABLE_SIZES} bytesPerResult={5_400} resultsLast30Days={96_000} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <DatabaseIngestChart data={ingestDays()} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Retention policy</CardTitle>
            <CardDescription>Separate from the artifact policy under Storage. Deleting a run deletes everything recorded for it.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <DataRetentionPolicySource source="saved" updatedAt={ago(60 * 26)} now={NOW} />
            <DataRetentionPolicyForm policy={DATA_RETENTION_POLICY} action={() => {}} artifactDays={30} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Due</CardTitle>
              <CardDescription>What the saved policy deletes on the next sweep.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataRetentionDue due={DUE_PREVIEW} enabled />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>What deletes expired rows, and when.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataRetentionSchedule onVercel cronSecretSet ingestSweepHours={12} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Projects</CardTitle>
          <CardDescription>The ten projects holding the most test results.</CardDescription>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <ProjectFootprintTable rows={PROJECT_FOOTPRINTS} now={NOW} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b py-5">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Recent sweeps</CardTitle>
            <CardDescription>The last ten, from the scheduler, finished runs, or this page.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              <Play data-icon="inline-start" />
              Run now
            </Button>
            <PurgeRunHistory open={false} onOpenChange={() => {}} expected="delete all run history" onConfirm={() => {}} />
          </div>
        </CardHeader>
        <CardContent flush className="overflow-x-auto">
          <DataSweepsTable sweeps={DATA_SWEEPS} now={NOW} />
        </CardContent>
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Save policy' })).toBeVisible();
    await expect(canvas.getByText('Database size')).toBeVisible();
  },
};
