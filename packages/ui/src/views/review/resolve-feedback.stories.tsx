import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { uncommentedRequestFlows, uncommentedRequestHereFlows } from '../../fixtures/review-threads';
import { FeedbackRequestCard, ResolveDone } from './resolve-feedback';

const meta = {
  title: 'Views/Review/Comments/ResolveFeedback',
  component: ResolveDone,
  args: { resolved: 5, open: 2, scope: 'all', onRestart: fn(), onClose: fn() },
  decorators: [(Story) => <div className="bg-popover p-6">{Story()}</div>],
} satisfies Meta<typeof ResolveDone>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Through the feedback, two still open: go through them again. */
export const Done: Story = {
  render: () => <ResolveDone resolved={5} open={2} scope="all" onRestart={fn()} onClose={fn()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('You are through the feedback')).toBeInTheDocument();
    await expect(canvas.getByText('5 resolved · 2 still open.')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Go through the 2 still open/ })).toBeInTheDocument();
  },
};

/** Everything resolved. */
export const AllResolved: Story = {
  render: () => <ResolveDone resolved={7} open={0} scope="verify" onClose={fn()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('All feedback resolved')).toBeInTheDocument();
    await expect(within(canvasElement).queryByRole('button', { name: /still open/ })).toBeNull();
  },
};

/** No screen changed since its feedback: the tests have not run after a fix yet. */
export const NothingToVerify: Story = {
  render: () => <ResolveDone resolved={0} open={0} scope="verify" onClose={fn()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nothing to verify')).toBeInTheDocument();
  },
};

const requestCapture = uncommentedRequestFlows[0].checkpoints[1].captures.find((c) => c.variant === 'desktop')!;
const requestHereCapture = uncommentedRequestHereFlows[0].checkpoints[1].captures.find((c) => c.variant === 'desktop')!;
const onApprove = fn();

/** Changes asked for on an earlier version without a comment: the stage shows that version beside the screen now, and approving settles it. */
export const ChangeRequest: Story = {
  render: () => <div className="w-80"><FeedbackRequestCard request={requestCapture.request!} onApprove={onApprove} onNext={fn()} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Verify the change request' })).toBeInTheDocument();
    await expect(canvas.getByText(/Grace Hopper \(run #470\) asked for changes to an earlier version/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Done — approve/ }));
    await expect(onApprove).toHaveBeenCalled();
  },
};

/** Changes asked for on these very pixels: nothing changed yet; point at what should. */
export const ChangeRequestUnchanged: Story = {
  render: () => <div className="w-80"><FeedbackRequestCard request={requestHereCapture.request!} onApprove={fn()} onPin={fn()} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Change request, unchanged' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Pin what should change/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Approve anyway/ })).toBeInTheDocument();
  },
};
