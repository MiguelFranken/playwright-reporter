import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { checkoutDesktopDiff, checkoutMobileDiff, diffStatesFlow, measuredDiff } from '../../fixtures/review';
import { DiffBadge } from './diff-summary';

const meta = {
  title: 'Views/Review/Diff/DiffBadge',
  component: DiffBadge,
  args: { diff: checkoutDesktopDiff },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DiffBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A recoloured button and pill, half a percent of a long page: a minor change. */
export const Minor: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('0.51% changed')).toBeInTheDocument();
  },
};

export const MinorMobile: Story = { args: { diff: checkoutMobileDiff } };

/** The page grew: loud enough to tone as a warning, whatever the share. */
export const Major: Story = { args: { diff: diffStatesFlow.checkpoints[1].captures[0].diff } };

/** Different bytes, same pixels. */
export const NoVisibleChange: Story = { args: { diff: measuredDiff([], { width: 2560, height: 1440 }) } };

export const Measuring: Story = { args: { diff: diffStatesFlow.checkpoints[3].captures[0].diff } };

/** The project's tolerance approved it; the badge says so instead of a number. */
export const AutoApproved: Story = { args: { diff: diffStatesFlow.checkpoints[0].captures[0].diff, decision: diffStatesFlow.checkpoints[0].captures[0].decision } };

/** Not measured (too large): nothing to say, nothing shown. */
export const TooLarge: Story = {
  args: { diff: diffStatesFlow.checkpoints[2].captures[0].diff },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('span')).toBeNull();
  },
};
