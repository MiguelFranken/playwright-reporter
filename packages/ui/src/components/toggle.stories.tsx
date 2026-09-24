import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Bold } from 'lucide-react';
import { Toggle } from './toggle';

const meta = {
  title: 'Primitives/Toggle',
  component: Toggle,
  args: { children: 'Only failures', onPressedChange: fn(), 'aria-label': 'Only failures' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline'] },
    size: { control: 'inline-radio', options: ['sm', 'default', 'lg'] },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Pressed: Story = { args: { defaultPressed: true } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Disabled: Story = { args: { disabled: true } };
export const IconOnly: Story = { args: { children: <Bold />, 'aria-label': 'Bold' } };

/** aria-pressed is the state; the styling follows it, never the other way round. */
export const Toggles: Story = {
  render: function Render(args) {
    const [pressed, setPressed] = useState(false);
    return (
      <Toggle
        {...args}
        pressed={pressed}
        onPressedChange={(next) => {
          setPressed(next);
          args.onPressedChange?.(next, undefined as never);
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const toggle = within(canvasElement).getByRole('button', { name: /only failures/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(args.onPressedChange).toHaveBeenCalled();
  },
};
