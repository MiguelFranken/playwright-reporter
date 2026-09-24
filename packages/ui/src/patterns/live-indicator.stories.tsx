import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { LiveIndicator } from './live-indicator';

const meta = {
  title: 'Patterns/LiveIndicator',
  component: LiveIndicator,
  args: { state: 'live' },
  argTypes: { state: { control: 'inline-radio', options: ['connecting', 'live', 'polling', 'done', 'off'] } },
  parameters: { layout: 'centered' },
  tags: ['themed'],
} satisfies Meta<typeof LiveIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(['connecting', 'live', 'polling', 'done'] as const).map((state) => (
        <LiveIndicator key={state} state={state} />
      ))}
    </div>
  ),
};

/** The app renames "Live" per surface — "Watching" on a project, say. */
export const CustomLabel: Story = { args: { label: 'Watching' } };

/** `off` renders nothing at all, so a header does not reserve space for it. */
export const Off: Story = {
  args: { state: 'off' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/live|polling|finished|connecting/i)).toBeNull();
  },
};
