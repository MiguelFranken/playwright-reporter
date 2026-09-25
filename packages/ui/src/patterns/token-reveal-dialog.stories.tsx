import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TokenRevealDialog } from './token-reveal-dialog';

const meta = {
  title: 'Patterns/TokenRevealDialog',
  component: TokenRevealDialog,
  tags: ['themed'],
  args: {
    created: { name: 'GitHub Actions', token: 'pwr_live_9f2c8a41b6d3e7f0a2c5b8d1e4f7a0c3b6d9e2f5' },
    onDismiss: fn(),
    children: <p className="text-body-s text-muted-foreground">Set it as PW_REPORTER_TOKEN in your CI secrets.</p>,
  },
} satisfies Meta<typeof TokenRevealDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Token created' });
    await expect(within(dialog).getByText(args.created!.token)).toBeInTheDocument();
    await expect(within(dialog).getByText(/PW_REPORTER_TOKEN/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

/** A long secret breaks across lines instead of widening the dialog. */
export const LongToken: Story = {
  args: { created: { name: 'CI', token: `pwr_live_${'a1b2c3d4e5'.repeat(12)}` } },
};
