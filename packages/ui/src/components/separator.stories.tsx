import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta = {
  title: 'Primitives/Separator',
  component: Separator,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="max-w-sm">
      <p className="text-body-s">Runs</p>
      <Separator className="my-3" />
      <p className="text-body-s">Tests</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-3 text-body-s">
      <span>1,204 runs</span>
      <Separator orientation="vertical" />
      <span>98.4% passing</span>
      <Separator orientation="vertical" />
      <span>12 flaky</span>
    </div>
  ),
};
