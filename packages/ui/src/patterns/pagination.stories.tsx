import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useState } from 'react';
import { Pagination } from './pagination';

const meta = {
  title: 'Patterns/Pagination',
  component: Pagination,
  args: { page: 3, pageSize: 25, total: 240, onPageChange: fn() },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstPage: Story = { args: { page: 1 } };
export const LastPage: Story = { args: { page: 10 } };
export const Pending: Story = { args: { isPending: true } };

/** One page of results needs no pager, so it renders nothing rather than a dead one. */
export const SinglePage: Story = {
  args: { page: 1, total: 12 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('navigation')).toBeNull();
  },
};

/** A final page that is not full still reports the real range, not page × size. */
export const PartialLastPage: Story = { args: { page: 10, total: 238 } };

export const Pages: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('51–75')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await expect(args.onPageChange).toHaveBeenCalledWith(4);

    await userEvent.click(canvas.getByRole('button', { name: /previous/i }));
    await expect(args.onPageChange).toHaveBeenLastCalledWith(2);
  },
};

/** The ends are dead ends: Previous is disabled on page 1, Next on the last. */
export const StopsAtTheEnds: Story = {
  render: function Render(args) {
    const [page, setPage] = useState(1);
    return (
      <Pagination
        {...args}
        page={page}
        onPageChange={(next) => {
          setPage(next);
          args.onPageChange(next);
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeDisabled();

    await userEvent.click(canvas.getByRole('button', { name: /next/i }));
    await expect(canvas.getByRole('button', { name: /previous/i })).toBeEnabled();
    await expect(canvas.getByText('26–50')).toBeVisible();
  },
};
