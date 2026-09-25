import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { McpServerSwitch } from './mcp-server-switch';

const meta = {
  title: 'Views/Admin/MCP server switch',
  component: McpServerSwitch,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { checked: true, forcedOffByEnv: false, onCheckedChange: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof McpServerSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = {
  play: async ({ canvasElement, args }) => {
    const control = within(canvasElement).getByRole('switch', { name: 'Allow AI assistants to connect' });
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(control);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(false);
  },
};

export const Off: Story = { args: { checked: false } };

export const Saving: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('switch')).toHaveAttribute('aria-disabled', 'true');
  },
};

/** The environment wins: the switch reads "off" whatever was saved, and cannot move. */
export const ForcedOffByEnvironment: Story = {
  args: { forcedOffByEnv: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch', { name: 'Allow AI assistants to connect' });
    await expect(control).toHaveAttribute('aria-checked', 'false');
    await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByText(/MCP_ENABLED=false is set/)).toBeVisible();
  },
};

/** With a stand-in for the app's optimistic update. */
export const Toggles: Story = {
  render: function Render(args) {
    const [checked, setChecked] = useState(false);
    return (
      <McpServerSwitch
        {...args}
        checked={checked}
        onCheckedChange={(next) => {
          args.onCheckedChange(next);
          setChecked(next);
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole('switch');
    await userEvent.click(control);
    await expect(control).toHaveAttribute('aria-checked', 'true');
  },
};
