import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { DATA_SWEEPS, DUE_PREVIEW, PROJECT_FOOTPRINTS } from '../../fixtures/admin';
import { NOW } from '../../fixtures/now';
import { DataRetentionDue, DataRetentionSchedule, DataSweepsTable, ProjectFootprintTable } from './database';

const meta = {
  title: 'Views/Admin/Database',
  component: DataRetentionSchedule,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { onVercel: false, cronSecretSet: true, ingestSweepHours: 12 },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataRetentionSchedule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Self-hosted: any scheduler can call the endpoint, so the curl line is shown. */
export const SelfHosted: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/api\/cron\/data-retention/)).toBeVisible();
  },
};

export const Vercel: Story = { args: { onVercel: true } };

export const MissingCronSecret: Story = {
  args: { cronSecretSet: false, ingestSweepHours: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/CRON_SECRET is not set/)).toBeVisible();
    await expect(canvas.getByText(/DATA_RETENTION_INGEST_SWEEP/)).toBeVisible();
  },
};

export const Due: StoryObj<typeof DataRetentionDue> = {
  render: (args) => <DataRetentionDue {...args} />,
  args: { due: DUE_PREVIEW, enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('43,870')).toBeVisible();
    await expect(canvas.getByText('2.4 GB')).toBeVisible();
    await expect(canvas.getByText('Deleted on the next sweep.')).toBeVisible();
    // The audit log is kept forever, so it has no count.
    await expect(canvas.queryByText('Audit entries')).toBeNull();
  },
};

/** Off: the same numbers, as a preview. */
export const DuePreview: StoryObj<typeof DataRetentionDue> = {
  render: (args) => <DataRetentionDue {...args} />,
  args: { due: { ...DUE_PREVIEW, audit: 1_204, expired: null }, enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/A preview: data retention is off/)).toBeVisible();
    await expect(canvas.getByText('Audit entries')).toBeVisible();
    await expect(canvas.queryByText('Expired sign-ins')).toBeNull();
  },
};

export const DueNothing: StoryObj<typeof DataRetentionDue> = {
  render: (args) => <DataRetentionDue {...args} />,
  args: { due: { runs: 0, results: 0, artifactBytes: 0, events: 0, audit: 0, expired: 0 }, enabled: true },
};

/** A long project and team name truncate; a project without artifacts shows a dash. */
export const Projects: StoryObj<typeof ProjectFootprintTable> = {
  render: (args) => <ProjectFootprintTable {...args} />,
  args: { rows: PROJECT_FOOTPRINTS, now: NOW },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('row', { name: /docs/ });
    await expect(within(row).getByText('27,620')).toBeVisible();
    await expect(within(row).getByText('–')).toBeVisible();
  },
};

export const ProjectsEmpty: StoryObj<typeof ProjectFootprintTable> = {
  render: (args) => <ProjectFootprintTable {...args} />,
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No projects yet.')).toBeVisible();
  },
};

/** Running, cut short by the budget, done, failed with a long error, and a purge. */
export const Sweeps: StoryObj<typeof DataSweepsTable> = {
  render: (args) => <DataSweepsTable {...args} />,
  args: { sweeps: DATA_SWEEPS, now: NOW },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Running…')).toBeVisible();
    await expect(canvas.getByText('Time budget spent; the next sweep continues.')).toBeVisible();
    await expect(canvas.getByText(/^Failed: BlobServiceUnavailable/)).toBeVisible();
    await expect(canvas.getByText('Purge history')).toBeVisible();
  },
};

export const SweepsEmpty: StoryObj<typeof DataSweepsTable> = {
  render: (args) => <DataSweepsTable {...args} />,
  args: { sweeps: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No sweep has run yet.')).toBeVisible();
  },
};
