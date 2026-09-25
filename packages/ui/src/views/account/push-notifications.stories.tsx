import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PushNotifications } from './push-notifications';

const meta = {
  title: 'Views/Account/Push notifications',
  component: PushNotifications,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    state: { kind: 'on', prefs: { notifyStarted: true, notifyFinished: true } },
    onEnable: fn(),
    onDisable: fn(),
    onPreferencesChange: fn(),
    onTest: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PushNotifications>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Subscribed: each preference reports the whole new set; test and turn off. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Starts' }));
    await expect(args.onPreferencesChange).toHaveBeenCalledWith({ notifyStarted: false, notifyFinished: true });
    await userEvent.click(canvas.getByRole('button', { name: 'Send a test' }));
    await expect(args.onTest).toHaveBeenCalledOnce();
    await userEvent.click(canvas.getByRole('button', { name: 'Turn off in this browser' }));
    await expect(args.onDisable).toHaveBeenCalledOnce();
  },
};

export const OnlyFinished: Story = {
  args: { state: { kind: 'on', prefs: { notifyStarted: false, notifyFinished: true } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('checkbox', { name: 'Starts' })).toHaveAttribute('aria-checked', 'false');
    await expect(canvas.getByRole('checkbox', { name: 'Finishes, with its result' })).toHaveAttribute('aria-checked', 'true');
  },
};

export const Saving: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Send a test' })).toBeDisabled();
  },
};

export const Off: Story = {
  args: { state: { kind: 'off' } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Turn on notifications' }));
    await expect(args.onEnable).toHaveBeenCalledOnce();
  },
};

export const TurningOn: Story = {
  args: { state: { kind: 'off' }, pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Turning on…' })).toBeDisabled();
  },
};

export const Loading: Story = { args: { state: { kind: 'loading' } } };
export const Unsupported: Story = { args: { state: { kind: 'unsupported' } } };
export const Blocked: Story = { args: { state: { kind: 'blocked' } } };
