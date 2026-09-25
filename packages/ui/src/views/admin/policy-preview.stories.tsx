import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { PENDING_STATE_A11Y } from '../../fixtures/a11y';
import { DUE_PREVIEW, STORAGE_USAGE } from '../../fixtures/admin';
import { DataRetentionDue } from './database';
import { PolicyPreview } from './policy-preview';
import { StorageDue } from './storage';

const meta = {
  title: 'Views/Admin/Policy preview',
  component: PolicyPreview,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { status: 'ready', children: <DataRetentionDue due={DUE_PREVIEW} enabled caption={null} /> },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PolicyPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The changed data retention policy's numbers, framed as "if you save". */
export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'If you save these changes' });
    await expect(region).toHaveAttribute('aria-busy', 'false');
    await expect(within(region).getByText('184')).toBeVisible();
    // The due view's own caption is dropped: the frame says what the numbers are.
    await expect(within(region).queryByText('Deleted on the next sweep.')).toBeNull();
  },
};

/** The first answer for the changes is on its way. */
export const Loading: Story = {
  args: { status: 'loading' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('status', { name: 'Working out what this policy deletes' })).toBeVisible();
    await expect(canvas.getByRole('region', { name: 'If you save these changes' })).toHaveAttribute('aria-busy', 'true');
  },
};

/** The previous answer stays, dimmed, while the next one loads. */
export const Updating: Story = {
  args: { status: 'updating' },
  parameters: PENDING_STATE_A11Y,
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'If you save these changes' });
    await expect(region).toHaveAttribute('aria-busy', 'true');
    await expect(within(region).getByText('184')).toBeVisible();
  },
};

/** Values the save would refuse: the same message the save gives. */
export const Invalid: Story = {
  args: { status: 'invalid', message: 'Keep runs for a whole number of days between 1 and 3650.' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Keep runs for a whole number of days between 1 and 3650.')).toBeVisible();
  },
};

export const Failed: Story = {
  args: { status: 'error' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Could not work out what this policy deletes/)).toBeVisible();
  },
};

/** The storage policy's preview: artifacts by kind, largest first. */
export const Storage: Story = {
  args: { children: <StorageDue rows={STORAGE_USAGE} enabled /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('271')).toBeVisible();
    const labels = canvas.getAllByRole('term').map((t) => t.textContent);
    await expect(labels).toEqual(['Artifacts', 'Space freed', 'Videos', 'Traces', 'Screenshots', 'Text']);
  },
};

/** Nothing would be due, and retention would stay off. */
export const StorageNothingDue: Story = {
  args: { children: <StorageDue rows={STORAGE_USAGE.map((r) => ({ ...r, dueCount: 0, dueBytes: 0 }))} enabled={false} /> },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/nothing is deleted until it is turned on/)).toBeVisible();
  },
};
