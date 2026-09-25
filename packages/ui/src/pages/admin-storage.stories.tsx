import type { Meta, StoryObj } from '@storybook/react';
import { Play } from 'lucide-react';
import { expect, within } from 'storybook/test';
import { Button } from '../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/card';
import { RETENTION_POLICY, RETENTION_SWEEPS, STORAGE_USAGE } from '../fixtures/admin';
import { NOW, ago } from '../fixtures/now';
import { PageHeader } from '../patterns/page-header';
import { RetentionPolicyForm, RetentionPolicySource } from '../views/admin/retention-policy-form';
import { RetentionSweepsTable, StorageUsageTable, StoreSchedule } from '../views/admin/storage';

const meta = {
  title: 'Pages/Admin storage',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const KINDS = ['screenshot', 'video', 'trace', 'image', 'text', 'other'] as const;

/** Admin → Storage with a policy in force, a week of sweeps and one failure. */
export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Storage" description="Where test artifacts live, and how long screenshots, videos and traces are kept." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Retention policy</CardTitle>
            <CardDescription>
              Expired artifacts are deleted from the store. Their runs keep every result, error and step, and show the artifact as expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RetentionPolicySource source="saved" updatedAt={ago(60 * 26)} now={NOW} />
            <RetentionPolicyForm policy={RETENTION_POLICY} kinds={KINDS} action={() => {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Store and schedule</CardTitle>
            <CardDescription>What deletes expired artifacts, and when.</CardDescription>
          </CardHeader>
          <CardContent>
            <StoreSchedule driver="vercel-blob" retention="app" onVercel cronSecretSet ingestSweepHours={6} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-5">
          <CardTitle>Usage</CardTitle>
          <CardDescription>Artifacts by kind. “Due” is what the saved policy expires on the next sweep, counted even while retention is off.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <StorageUsageTable rows={STORAGE_USAGE} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b py-5">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Recent sweeps</CardTitle>
            <CardDescription>The last ten, from the scheduler, finished runs, or this page.</CardDescription>
          </div>
          <Button size="sm" variant="outline">
            <Play data-icon="inline-start" />
            Run now
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <RetentionSweepsTable sweeps={RETENTION_SWEEPS} now={NOW} />
        </CardContent>
      </Card>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Save policy' })).toBeVisible();
  },
};
