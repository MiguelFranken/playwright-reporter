import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Slider } from './slider';

function Hosted(props: { onValueChange?: (v: number) => void; disabled?: boolean }) {
  const [value, setValue] = useState(40);
  return (
    <div className="flex w-64 items-center gap-3">
      <Slider
        value={value}
        min={0}
        max={100}
        disabled={props.disabled}
        onValueChange={(v) => {
          const next = Array.isArray(v) ? v[0] : v;
          setValue(next);
          props.onValueChange?.(next);
        }}
        thumbLabel="Volume"
        valueText={(v) => `${v} percent`}
      />
      <span className="w-8 text-right text-label-s tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

const meta = {
  title: 'Primitives/Forms/Slider',
  component: Hosted,
  args: { onValueChange: fn() },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Volume' });
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith(41);
    await expect(slider).toHaveAttribute('aria-valuetext', '41 percent');
  },
};

export const Disabled: Story = { args: { disabled: true } };
