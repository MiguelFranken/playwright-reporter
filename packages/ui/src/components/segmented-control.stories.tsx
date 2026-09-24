import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { SegmentedControl } from './segmented-control';

const RANGES = [
  { value: '7', label: '7d', 'aria-label': 'Last 7 days' },
  { value: '30', label: '30d', 'aria-label': 'Last 30 days' },
  { value: '90', label: '90d', 'aria-label': 'Last 90 days' },
];

const meta = {
  title: 'Primitives/SegmentedControl',
  component: SegmentedControl,
  args: { items: RANGES, value: '30', onValueChange: fn(), 'aria-label': 'Time range' },
  argTypes: { size: { control: 'inline-radio', options: ['sm', 'default'] } },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-4">
      <SegmentedControl {...args} size="sm" />
      <SegmentedControl {...args} size="default" />
    </div>
  ),
};

export const WithAll: Story = {
  args: {
    value: 'all',
    items: [{ value: 'all', label: 'All', 'aria-label': 'All time' }, ...RANGES],
  },
};

/** Controlled, so the thumb only moves when the owner says so. */
export const Stateful: Story = {
  render: function Render(args) {
    const [value, setValue] = useState('30');
    return (
      <SegmentedControl
        {...args}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange(next);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Last 7 days' }));
    await expect(args.onValueChange).toHaveBeenCalledWith('7');
    await expect(canvas.getByRole('radio', { name: 'Last 7 days' })).toBeChecked();
  },
};

/**
 * Arrow keys wrap around the track, and only the selected segment is in the tab
 * order — the radiogroup pattern, which is what the roles here promise.
 */
export const KeyboardWraps: Story = {
  render: function Render(args) {
    const [value, setValue] = useState('90');
    return <SegmentedControl {...args} value={value} onValueChange={setValue} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const last = canvas.getByRole('radio', { name: 'Last 90 days' });
    last.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', { name: 'Last 7 days' })).toBeChecked();
  },
};
