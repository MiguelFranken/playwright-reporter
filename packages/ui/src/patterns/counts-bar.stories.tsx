import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { CountsBar, type RunCounts } from './counts-bar';

const counts = (over: Partial<RunCounts> = {}): RunCounts => ({
  total: 0,
  passed: 0,
  failed: 0,
  flaky: 0,
  skipped: 0,
  interrupted: 0,
  running: 0,
  ...over,
});

const meta = {
  title: 'Patterns/CountsBar',
  component: CountsBar,
  args: { counts: counts({ total: 240, passed: 228, flaky: 7, failed: 5 }) },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [(Story) => <div className="max-w-md">{Story()}</div>],
} satisfies Meta<typeof CountsBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};

export const AllPassed: Story = { args: { counts: counts({ total: 240, passed: 240 }) } };

/** Zero of everything still renders the track and a "0 passed" — never nothing. */
export const Empty: Story = {
  args: { counts: counts() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('passed')).toBeVisible();
  },
};

/** The whole vocabulary, in the density a single run's header uses. */
export const Comfortable: Story = {
  args: { counts: counts({ total: 240, passed: 200, flaky: 7, failed: 5, skipped: 28 }) },
};

export const Running: Story = {
  args: { counts: counts({ total: 240, passed: 96, failed: 2, running: 142 }) },
};

export const Interrupted: Story = {
  args: { counts: counts({ total: 240, passed: 88, failed: 3, interrupted: 149 }) },
};

/**
 * Counts that add up to more than `total` — a sharded run double-reporting, say.
 * The denominator is the larger of the two, so segments stay inside the track
 * instead of overflowing it.
 */
export const Overflow: Story = {
  args: { counts: counts({ total: 100, passed: 90, flaky: 30, failed: 20 }) },
};

export const WithoutNumbers: Story = { args: { showNumbers: false } };

/**
 * The list form. The words go to the bar's accessible name — a screen reader
 * still hears "240 tests: 228 passed, 7 flaky, 5 failed" — and the size leads
 * the counts, because every bar fills its track and so none of them can say how
 * big its run was.
 */
export const Compact: Story = {
  args: { density: 'compact', showTotal: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('240 tests')).toBeVisible();
    await expect(canvas.queryByText('passed')).toBeNull();
    await expect(canvas.getByRole('img', { name: /228 passed/ })).toBeVisible();
  },
};

/** Ten rows of it, which is the only way to judge a list treatment. */
export const CompactList: Story = {
  render: () => (
    <div className="flex flex-col divide-y divide-separator">
      {[
        counts({ total: 22, passed: 10, flaky: 3, failed: 6, skipped: 3 }),
        counts({ total: 22, passed: 11, flaky: 2, failed: 6, skipped: 3 }),
        counts({ total: 11, passed: 5, flaky: 1, failed: 3, skipped: 2 }),
        counts({ total: 22, passed: 9, flaky: 2, failed: 8, skipped: 3 }),
        counts({ total: 22, passed: 1, failed: 18, skipped: 3 }),
        counts({ total: 4, passed: 4 }),
      ].map((c, i) => (
        <div key={i} className="py-3">
          <CountsBar counts={c} density="compact" showTotal />
        </div>
      ))}
    </div>
  ),
};

/** Every segment names itself on hover, since the bar alone is only colour. */
export const SegmentsAreTitled: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[title="passed: 228"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[title="failed: 5"]')).not.toBeNull();
  },
};
