import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';

const meta = {
  title: 'Primitives/Skeleton',
  component: Skeleton,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { className: 'h-4 w-48' } };

/**
 * A skeleton is only useful if it is the same size as what replaces it —
 * otherwise the page jumps when the data lands.
 */
export const RowPlaceholder: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-2.5 rounded-full" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="ms-auto h-4 w-16" />
        </div>
      ))}
    </div>
  ),
};

export const Shapes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-9 w-28 rounded-lg" />
      <Skeleton className="h-24 w-40 rounded-xl" />
    </div>
  ),
};
