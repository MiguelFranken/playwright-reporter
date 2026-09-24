import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { AnnouncementBar } from './announcement-bar';

const meta = {
  title: 'Marketing/AnnouncementBar',
  component: AnnouncementBar,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: {
    text: 'v0.4 adds per-shard progress and the flaky-test drawer.',
    href: '/features',
    linkLabel: "What's new",
  },
} satisfies Meta<typeof AnnouncementBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutLink: Story = { args: { href: null, linkLabel: null } };

export const NotDismissible: Story = { args: { dismissible: false } };

const DISMISS_TEXT = 'This announcement can be dismissed.';

export const Dismisses: Story = {
  args: { text: DISMISS_TEXT },
  // Dismissal is remembered, so without this a second run in the same browser
  // would render nothing to click. It has to happen before the first mount.
  beforeEach: () => {
    localStorage.removeItem(`announcement-dismissed:${DISMISS_TEXT}`);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /dismiss announcement/i }));
    await expect(canvas.queryByRole('button', { name: /dismiss announcement/i })).toBeNull();
  },
};
