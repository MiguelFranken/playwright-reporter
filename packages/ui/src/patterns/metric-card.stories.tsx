import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Activity, Clock, Repeat2, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/badge';
import { TooltipProvider } from '../components/tooltip';
import { MetricCard, toneClass } from './metric-card';

const meta = {
  title: 'Patterns/MetricCard',
  component: MetricCard,
  args: { label: 'Pass rate', value: '98.4%' },
  parameters: { layout: 'padded' },
  tags: ['themed'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="max-w-xs">{Story()}</div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithEverything: Story = {
  args: {
    label: 'Reliability',
    value: '82',
    icon: ShieldCheck,
    hint: 'Failures weigh fully, flakiness half. 0–100.',
    badge: <Badge variant="outline" className={toneClass.good}>Healthy</Badge>,
    subtext: 'Up 4 points over the last 30 days',
  },
};

/** How the dashboard actually uses them: one row, four cards, aligned numbers. */
export const Row: Story = {
  decorators: [(Story) => <TooltipProvider>{Story()}</TooltipProvider>],
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard label="Runs" value="1,204" icon={Activity} subtext="Last 30 days" />
      <MetricCard label="Pass rate" value="98.4%" icon={ShieldCheck} subtext="228 of 240 tests" />
      <MetricCard label="Flaky" value="7" icon={Repeat2} badge={<Badge variant="outline" className={toneClass.warn}>Unreliable</Badge>} />
      <MetricCard label="Median duration" value="4m 12s" icon={Clock} subtext="p95 11m 40s" />
    </div>
  ),
};

/** Long labels truncate rather than wrapping the card out of the grid. */
export const LongText: Story = {
  args: {
    label: 'Median duration of the checkout suite on CI',
    value: '1h 12m',
    subtext: 'Measured across every shard of every run in the selected range',
  },
};

export const NoData: Story = {
  args: { label: 'Reliability', value: '–', badge: <Badge variant="outline" className={toneClass.muted}>No data</Badge> },
};

/** The hint is a real tooltip, reachable by keyboard and named for screen readers. */
export const HintOpens: Story = {
  args: { hint: 'Failures weigh fully, flakiness half. 0–100.' },
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole('button', { name: /about pass rate/i }));
    const tip = await within(document.body).findByText(/failures weigh fully/i);
    await waitFor(() => expect(tip).toBeVisible());
  },
};
