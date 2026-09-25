import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Checkbox } from './checkbox';
import { Label } from './label';

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  args: { 'aria-label': 'Starts', onCheckedChange: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Indeterminate: Story = { args: { indeterminate: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

/** Wrapped in a `Label`, the text names the box and clicking it toggles. */
export const WithLabel: Story = {
  render: (args) => (
    <Label className="font-normal">
      <Checkbox {...args} aria-label={undefined} />
      Finishes, with its result
    </Label>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Finishes, with its result'));
    await expect(canvas.getByRole('checkbox', { name: 'Finishes, with its result' })).toHaveAttribute('aria-checked', 'true');
    await expect(args.onCheckedChange).toHaveBeenCalled();
  },
};

/** A group under a legend, the way notification preferences use it. */
export const Group: Story = {
  render: function Render(args) {
    const [started, setStarted] = useState(true);
    const [finished, setFinished] = useState(false);
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Notify me when a run</legend>
        <Label className="font-normal">
          <Checkbox {...args} aria-label={undefined} checked={started} onCheckedChange={setStarted} />
          Starts
        </Label>
        <Label className="font-normal">
          <Checkbox {...args} aria-label={undefined} checked={finished} onCheckedChange={setFinished} />
          Finishes, with its result
        </Label>
      </fieldset>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const finished = canvas.getByRole('checkbox', { name: 'Finishes, with its result' });
    await expect(canvas.getByRole('checkbox', { name: 'Starts' })).toHaveAttribute('aria-checked', 'true');
    await expect(finished).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(finished);
    await expect(finished).toHaveAttribute('aria-checked', 'true');
  },
};
