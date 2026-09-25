import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Switch } from './switch';

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  args: { 'aria-label': 'Allow AI assistants to connect', onCheckedChange: fn() },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'default'] },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Small: Story = { args: { size: 'sm', defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, defaultChecked: true } };

/** A settings row: the visible label names the switch, the description explains it. */
export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-96 items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span id="switch-label" className="text-label-m">
          Allow AI assistants to connect
        </span>
        <span id="switch-description" className="text-body-s text-muted-foreground">
          Switching off rejects every MCP request at once.
        </span>
      </div>
      <Switch {...args} aria-label={undefined} aria-labelledby="switch-label" aria-describedby="switch-description" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('switch', { name: 'Allow AI assistants to connect' })).toBeVisible();
  },
};

/** aria-checked is the state; clicking flips it and reports the new value. */
export const Toggles: Story = {
  render: function Render(args) {
    const [checked, setChecked] = useState(false);
    return (
      <Switch
        {...args}
        checked={checked}
        onCheckedChange={(next, details) => {
          setChecked(next);
          args.onCheckedChange?.(next, details);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Allow AI assistants to connect' });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  },
};
