import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { RETENTION_POLICY } from '../../fixtures/admin';
import { NOW, ago } from '../../fixtures/now';
import { RetentionPolicyForm, RetentionPolicySource } from './retention-policy-form';

const KINDS = ['screenshot', 'video', 'trace', 'image', 'text', 'other'] as const;

const meta = {
  title: 'Views/Admin/Retention policy',
  component: RetentionPolicyForm,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { policy: RETENTION_POLICY, kinds: KINDS, action: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RetentionPolicyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Overrides show as values; blank kinds show the lifetime as their placeholder, and follow it. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Videos')).toHaveValue(7);
    await expect(canvas.getByLabelText('Screenshots')).toHaveAttribute('placeholder', '30');
    const days = canvas.getByLabelText('Lifetime in days');
    await userEvent.clear(days);
    await userEvent.type(days, '45');
    await expect(canvas.getByLabelText('Screenshots')).toHaveAttribute('placeholder', '45');
  },
};

/** Submits the fields the server action reads, under their names. */
export const Submits: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Keep forever' }));
    await userEvent.type(canvas.getByLabelText('Screenshots'), '10');
    await userEvent.click(canvas.getByRole('button', { name: 'Save policy' }));
    await expect(args.action).toHaveBeenCalledOnce();
    const data = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData;
    await expect(data.get('enabled')).toBe('off');
    await expect(data.get('days')).toBe('30');
    await expect(data.get('days.screenshot')).toBe('10');
    await expect(data.get('days.video')).toBe('7');
  },
};

export const KeepForever: Story = { args: { policy: { enabled: false, days: 90, overrides: {} } } };

export const Saving: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  },
};

export const SourceSaved: StoryObj<typeof RetentionPolicySource> = {
  render: (args) => <RetentionPolicySource {...args} />,
  args: { source: 'saved', updatedAt: ago(60 * 26), now: NOW },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Last changed 1 day ago.')).toBeVisible();
  },
};

export const SourceEnvironment: StoryObj<typeof RetentionPolicySource> = {
  render: (args) => <RetentionPolicySource {...args} />,
  args: { source: 'environment', updatedAt: null },
};

export const SourceDefault: StoryObj<typeof RetentionPolicySource> = {
  render: (args) => <RetentionPolicySource {...args} />,
  args: { source: 'default', updatedAt: null },
};
