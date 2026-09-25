import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { CONNECTED_APPS } from '../../fixtures/account';
import { ConnectedApps } from './connected-apps';

const meta = {
  title: 'Views/Account/Connected apps',
  component: ConnectedApps,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { apps: CONNECTED_APPS, onDisconnect: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConnectedApps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each grant is revocable on its own; a self-registered client has no host. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('claude.ai')).toBeVisible();
    await expect(canvas.getByText('never')).toBeVisible();
    await userEvent.click(canvas.getAllByRole('button', { name: 'Disconnect' })[1]!);
    await expect(args.onDisconnect).toHaveBeenCalledWith(CONNECTED_APPS[1]);
  },
};

export const Empty: Story = {
  args: { apps: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No connected apps')).toBeVisible();
  },
};

export const Disconnecting: Story = {
  args: { disconnectingId: 'grant-1' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Disconnecting…' })).toBeDisabled();
  },
};
