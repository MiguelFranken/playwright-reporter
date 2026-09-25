import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DATA_RETENTION_POLICY, DUE_PREVIEW } from '../../fixtures/admin';
import { NOW, ago } from '../../fixtures/now';
import { DataRetentionDue } from './database';
import { DataRetentionPolicyForm, DataRetentionPolicySource } from './data-retention-policy-form';
import { PolicyPreview } from './policy-preview';

const meta = {
  title: 'Views/Admin/Data retention policy',
  component: DataRetentionPolicyForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { policy: DATA_RETENTION_POLICY, action: fn(), artifactDays: 30, onFieldsChange: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataRetentionPolicyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Keep runs for (days)')).toHaveValue(90);
    await expect(canvas.getByLabelText('Keep the audit log for (days)')).toHaveAttribute('placeholder', 'Forever');
    await expect(canvas.queryByText('Runs go before their artifacts would')).toBeNull();
  },
};

/** Submits the fields the server action reads, under their names. */
export const Submits: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const days = canvas.getByLabelText('Keep runs for (days)');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await userEvent.type(canvas.getByLabelText('Keep the audit log for (days)'), '365');
    await userEvent.click(canvas.getByRole('switch', { name: 'Clean up what has expired' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save policy' }));
    await expect(args.action).toHaveBeenCalledOnce();
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    await expect(data.get('enabled')).toBe('on');
    await expect(data.get('runDays')).toBe('45');
    await expect(data.get('keepLatestRuns')).toBe('20');
    await expect(data.get('eventDays')).toBe('7');
    await expect(data.get('auditDays')).toBe('365');
    await expect(data.get('housekeeping')).toBe('off');
  },
};

/**
 * Every change reports the fields under the names the form posts, for the
 * host's preview: typing, and the switch, which posts through a hidden input.
 * Nothing is reported before the user changes something.
 */
export const ReportsFields: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const report = args.onFieldsChange as ReturnType<typeof fn>;
    await expect(report).not.toHaveBeenCalled();

    // What React adds to a form bound to a server action is not reported.
    const plumbing = Object.assign(document.createElement('input'), { type: 'hidden', name: '$ACTION_KEY', value: 'k'.repeat(80) });
    canvasElement.querySelector('form')!.append(plumbing);

    const days = canvas.getByLabelText('Keep runs for (days)');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ runDays: '45', keepLatestRuns: '20', housekeeping: 'on' }));
    await expect(report.mock.lastCall![0]).not.toHaveProperty('$ACTION_KEY');

    await userEvent.click(canvas.getByRole('switch', { name: 'Clean up what has expired' }));
    await expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ runDays: '45', housekeeping: 'off' }));
  },
};

/** The host's preview sits above the Save button. */
export const WithPreview: Story = {
  args: {
    preview: (
      <PolicyPreview status="ready">
        <DataRetentionDue due={DUE_PREVIEW} enabled caption={null} />
      </PolicyPreview>
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'If you save these changes' })).toBeVisible();
  },
};

/** A run lifetime shorter than the artifact lifetime would take artifacts early: said so, not prevented. */
export const ShorterThanArtifacts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const days = canvas.getByLabelText('Keep runs for (days)');
    await userEvent.clear(days);
    await userEvent.type(days, '14');
    await expect(canvas.getByText('Runs go before their artifacts would')).toBeVisible();
    await expect(canvas.getByText(/keeps artifacts up to 30 days/)).toBeVisible();
  },
};

export const KeepForever: Story = { args: { policy: { ...DATA_RETENTION_POLICY, enabled: false, auditDays: 400, housekeeping: false } } };

export const Saving: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  },
};

export const SourceSaved: StoryObj<typeof DataRetentionPolicySource> = {
  render: (args) => <DataRetentionPolicySource {...args} />,
  args: { source: 'saved', updatedAt: ago(60 * 26), now: NOW },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Last changed 1 day ago.')).toBeVisible();
  },
};

export const SourceEnvironment: StoryObj<typeof DataRetentionPolicySource> = {
  render: (args) => <DataRetentionPolicySource {...args} />,
  args: { source: 'environment', updatedAt: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/DATA_RETENTION_DAYS/)).toBeVisible();
  },
};

export const SourceDefault: StoryObj<typeof DataRetentionPolicySource> = {
  render: (args) => <DataRetentionPolicySource {...args} />,
  args: { source: 'default', updatedAt: null },
};
