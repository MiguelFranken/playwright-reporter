import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { CheckCircle2, MinusCircle, Repeat2, XCircle } from 'lucide-react';
import { OutcomeCard } from './outcome-card';

const meta = {
  title: 'Patterns/OutcomeCard',
  component: OutcomeCard,
  args: {
    label: 'Failed',
    count: 14,
    tone: 'danger' as const,
    icon: XCircle,
    breakdown: [
      { label: 'Assertion', value: 8 },
      { label: 'Timeout', value: 4, tone: 'warning' as const },
      { label: 'Locator', value: 2, tone: 'warning' as const },
    ],
  },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [(Story) => <div className="max-w-xs">{Story()}</div>],
} satisfies Meta<typeof OutcomeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Nothing to break down: the card says so in words rather than showing a gap. */
export const Empty: Story = {
  args: { label: 'Flaky', count: 0, tone: 'warning', icon: Repeat2, breakdown: [], emptyLabel: 'No flaky tests' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No flaky tests')).toBeVisible();
  },
};

/** As a link it filters the run, and `aria-current` marks the one in force. */
export const ActiveLink: Story = {
  args: { href: '#outcome-failed', active: true },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link');
    await expect(link).toHaveAttribute('href', '#outcome-failed');
    await expect(link).toHaveAttribute('aria-current', 'true');
  },
};

/** The row the run summary actually renders — four tones, aligned numbers. */
export const Row: Story = {
  decorators: [(Story) => <div className="w-full">{Story()}</div>],
  render: (args) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <OutcomeCard {...args} />
      <OutcomeCard
        label="Flaky"
        count={9}
        tone="warning"
        icon={Repeat2}
        breakdown={[
          { label: '1 retry', value: 7 },
          { label: '2 retries', value: 2 },
        ]}
      />
      <OutcomeCard label="Skipped" count={4} tone="neutral" icon={MinusCircle} emptyLabel="Nothing skipped" />
      <OutcomeCard
        label="Passed"
        count={213}
        tone="success"
        icon={CheckCircle2}
        breakdown={[{ label: 'of all tests', value: '89%' }]}
      />
    </div>
  ),
};
