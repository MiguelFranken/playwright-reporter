import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { checkoutDesktopDiff, diffStatesFlow, measuredDiff } from '../../fixtures/review';
import { DiffSummary } from './diff-summary';

const meta = {
  title: 'Views/Review/Diff/DiffSummary',
  component: DiffSummary,
  args: { diff: checkoutDesktopDiff, referenceLabel: 'Approved (#470)' },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="max-w-80">{Story()}</div>],
} satisfies Meta<typeof DiffSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Changed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/38,800 of 7,680,000 pixels differ from approved \(#470\)/)).toBeInTheDocument();
    await expect(canvas.getByText(/2 changed regions/)).toBeInTheDocument();
  },
};

export const NoVisibleChange: Story = { args: { diff: measuredDiff([], { width: 2560, height: 1440 }, { withinTolerance: true }) } };

/** A banner pushed the page down: the aligned rows say what really moved. */
export const ContentMoved: Story = {
  args: { diff: diffStatesFlow.checkpoints[1].captures[0].diff! },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/height \+240 px/)).toBeInTheDocument();
    await expect(canvas.getByText(/240 px added at y 440/)).toBeInTheDocument();
  },
};

export const Measuring: Story = { args: { diff: diffStatesFlow.checkpoints[3].captures[0].diff!, referenceLabel: 'Run #481' } };

export const TooLarge: Story = { args: { diff: diffStatesFlow.checkpoints[2].captures[0].diff! } };

export const Failed: Story = { args: { diff: { ...checkoutDesktopDiff, state: 'failed', error: 'An image is no longer stored.' } } };
