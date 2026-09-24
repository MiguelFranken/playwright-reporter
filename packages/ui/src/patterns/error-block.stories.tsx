import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { ANSI_ERROR } from '../fixtures/results';
import { ErrorBlock, ErrorCategoryBadge } from './error-block';

const meta = {
  title: 'Patterns/ErrorBlock',
  component: ErrorBlock,
  args: { message: ANSI_ERROR },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ErrorBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Playwright's output carries ANSI colour codes; a literal `ESC[31m` is noise. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent ?? '').not.toContain('[31m');
  },
};

export const Unclamped: Story = { args: { lines: 0 } };

export const NoMessage: Story = {
  args: { message: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('(no message)')).toBeVisible();
  },
};

/** The category is derived from the message — the wire carries no such field. */
export const Categories: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {[
        'expect(received).toBe(expected)',
        'TimeoutError: page.waitForResponse: Timeout 10000ms exceeded.',
        "locator.click: strict mode violation: getByRole('button') resolved to 3 elements",
        'Error: net::ERR_CONNECTION_REFUSED at http://localhost:3000',
        'Target page, context or browser has been closed',
        'Screenshot comparison failed: toHaveScreenshot',
        'Something else entirely went wrong',
      ].map((m) => (
        <ErrorCategoryBadge key={m} message={m} />
      ))}
    </div>
  ),
};
