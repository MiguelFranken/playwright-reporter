import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

const OUTCOMES = ['passed', 'flaky', 'failed'] as const;

const meta = {
  title: 'Primitives/ToggleGroup',
  component: ToggleGroup,
  args: { onValueChange: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline', 'segment'] },
    size: { control: 'inline-radio', options: ['sm', 'default', 'lg'] },
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <ToggleGroup {...args} defaultValue={['passed']}>
      {OUTCOMES.map((o) => (
        <ToggleGroupItem key={o} value={o}>
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-col items-start gap-4">
      {(['default', 'outline', 'segment'] as const).map((variant) => (
        <ToggleGroup key={variant} {...args} variant={variant} defaultValue={['flaky']}>
          {OUTCOMES.map((o) => (
            <ToggleGroupItem key={o} value={o}>
              {o}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ))}
    </div>
  ),
};

export const Vertical: Story = {
  render: (args) => (
    <ToggleGroup {...args} orientation="vertical" defaultValue={['passed']}>
      {OUTCOMES.map((o) => (
        <ToggleGroupItem key={o} value={o}>
          {o}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  ),
};

/** Several outcomes can be filtered at once, so selection is a set, not a value. */
export const SelectsMultiple: Story = {
  render: function Render(args) {
    const [value, setValue] = useState<readonly string[]>(['passed']);
    return (
      <ToggleGroup
        {...args}
        multiple
        value={value}
        onValueChange={(next, details) => {
          setValue(next as readonly string[]);
          args.onValueChange?.(next, details);
        }}
      >
        {OUTCOMES.map((o) => (
          <ToggleGroupItem key={o} value={o}>
            {o}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'failed' }));
    await expect(canvas.getByRole('button', { name: 'passed' })).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', { name: 'failed' })).toHaveAttribute('aria-pressed', 'true');
  },
};
