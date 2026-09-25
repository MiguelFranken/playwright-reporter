import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { RETENTION_SWEEPS, STORAGE_USAGE } from '../../fixtures/admin';
import { NOW } from '../../fixtures/now';
import { RetentionSweepsTable, StorageUsageTable, StoreSchedule } from './storage';

const meta = {
  title: 'Views/Admin/Storage',
  component: StoreSchedule,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { driver: 'local', retention: 'app', onVercel: false, cronSecretSet: true, ingestSweepHours: 6 },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StoreSchedule>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Self-hosted: any scheduler can call the endpoint, so the curl line is shown. */
export const SelfHosted: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/api\/cron\/artifact-retention/)).toBeVisible();
  },
};

export const Vercel: Story = { args: { driver: 'vercel-blob', onVercel: true } };

/** The endpoint refuses every call without a secret — flagged in red. */
export const MissingCronSecret: Story = {
  args: { cronSecretSet: false, ingestSweepHours: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/CRON_SECRET is not set/)).toBeVisible();
  },
};

/** A store with its own lifecycle rules: sweeps only mark artifacts as expired. */
export const ProviderRetention: Story = {
  args: { driver: 's3', retention: 'provider' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('The store expires objects itself')).toBeVisible();
  },
};

/** An S3 bucket in lifecycle mode: the app writes the rules when the policy is saved. */
export const S3Lifecycle: Story = {
  args: { driver: 's3', retention: 'provider', managesLifecycle: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/writes it to the bucket as lifecycle rules/)).toBeVisible();
  },
};

export const Usage: StoryObj<typeof StorageUsageTable> = {
  render: (args) => <StorageUsageTable {...args} />,
  args: { rows: STORAGE_USAGE },
  play: async ({ canvasElement }) => {
    const total = within(canvasElement).getByRole('row', { name: /total/i });
    await expect(within(total).getByText('2884')).toBeVisible();
  },
};

export const UsageEmpty: StoryObj<typeof StorageUsageTable> = {
  render: (args) => <StorageUsageTable {...args} />,
  args: { rows: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No artifacts uploaded yet.')).toBeVisible();
  },
};

/** Running, cut short by the time budget, done, and failed with a long error that truncates. */
export const Sweeps: StoryObj<typeof RetentionSweepsTable> = {
  render: (args) => <RetentionSweepsTable {...args} />,
  args: { sweeps: RETENTION_SWEEPS, now: NOW },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Running…')).toBeVisible();
    await expect(canvas.getByText('Time budget spent; the next sweep continues.')).toBeVisible();
    await expect(canvas.getByText(/^Failed: BlobServiceUnavailable/)).toBeVisible();
  },
};

export const SweepsEmpty: StoryObj<typeof RetentionSweepsTable> = {
  render: (args) => <RetentionSweepsTable {...args} />,
  args: { sweeps: [] },
};
