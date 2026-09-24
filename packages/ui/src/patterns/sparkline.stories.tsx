import type { Meta, StoryObj } from '@storybook/react';
import { Sparkline } from './sparkline';

const SERIES = [42, 48, 44, 61, 58, 72, 69, 74, 81, 78, 92, 88];

/** Recharts measures its container, so every story gives it a real width. */
const meta = {
  title: 'Patterns/Sparkline',
  component: Sparkline,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: { data: SERIES },
  decorators: [(Story) => <div className="w-40">{Story()}</div>],
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['info', 'success', 'warning', 'danger', 'neutral'] as const).map((tone) => (
        <Sparkline key={tone} data={SERIES} tone={tone} />
      ))}
    </div>
  ),
};

/** One point is not a trend, so nothing is drawn rather than a flat line. */
export const TooFewPoints: Story = { args: { data: [42] } };
