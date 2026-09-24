import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CopyButton } from './copy-button';

const meta = {
  title: 'Patterns/CopyButton',
  component: CopyButton,
  args: { value: 'pwr_live_9f2c8a41', label: 'Copy token' },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { size: 'sm', variant: 'outline', children: 'Copy token' },
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      {(['ghost', 'outline', 'secondary', 'default'] as const).map((variant) => (
        <CopyButton key={variant} {...args} variant={variant} size="sm">
          {variant}
        </CopyButton>
      ))}
    </div>
  ),
};

/**
 * Copying flips the icon to a tick for a moment and raises a toast. The
 * clipboard is stubbed here, because a headless browser has no permission to
 * one and the component's job is the feedback, not the platform call.
 */
export const CopiesAndConfirms: Story = {
  play: async ({ canvasElement }) => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });

    await userEvent.click(within(canvasElement).getByRole('button', { name: /copy token/i }));

    await expect(written).toEqual(['pwr_live_9f2c8a41']);
    const toast = await within(document.body).findByText('Copied to clipboard');
    await waitFor(() => expect(toast).toBeVisible());
  },
};

/** A clipboard that refuses says so, rather than silently pretending it worked. */
export const HandlesFailure: Story = {
  play: async ({ canvasElement }) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });

    await userEvent.click(within(canvasElement).getByRole('button', { name: /copy token/i }));

    const toast = await within(document.body).findByText('Could not copy to clipboard');
    await waitFor(() => expect(toast).toBeVisible());
  },
};
