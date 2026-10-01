import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { uncommentedRequestFlows, uncommentedRequestHereFlows } from '../../fixtures/review-threads';
import { RequestVerify, ResolveBar, ResolveDone } from './resolve-feedback';

const meta = {
  title: 'Views/Review/Comments/ResolveFeedback',
  component: ResolveBar,
  args: { index: 2, total: 7, done: 2, scope: 'verify', counts: { verify: 4, waiting: 3, all: 7 }, onScopeChange: fn(), onStep: fn() },
  decorators: [(Story) => <div className="bg-popover p-6">{Story()}</div>],
} satisfies Meta<typeof ResolveBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Where you are in the feedback, how much is resolved, which feedback, and the way on. */
export const Bar: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('3 of 7')).toBeInTheDocument();
    await expect(canvas.getByText('2 resolved')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'All open, 7' }));
    await expect(args.onScopeChange).toHaveBeenCalledWith('all');
    await userEvent.click(canvas.getByRole('button', { name: 'Next feedback' }));
    await expect(args.onStep).toHaveBeenCalledWith(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Previous feedback' }));
    await expect(args.onStep).toHaveBeenCalledWith(-1);
  },
};

/** At the first item there is nothing before it. */
export const AtTheStart: Story = {
  args: { index: 0, done: 0 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Previous feedback' })).toBeDisabled();
  },
};

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

/** Changes asked for on an earlier version without a comment: that version beside the screen now, and approving settles it. */
export const ChangeRequest: Story = {
  render: () => (
    <RequestVerify
      request={requestCapture.request!}
      then={requestCapture.baseline!.image}
      image={requestCapture.image}
      frame={{ width: 1280, height: 720 }}
      zoom={0.3}
      label="Checkout filled in"
      currentLabel="Now · run #486"
      index={3}
      total={7}
      onApprove={onApprove}
      onSkip={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Verify the change request' })).toBeInTheDocument();
    await expect(canvas.getByText(/Grace Hopper \(run #470\) asked for changes to an earlier version/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: /Done — approve/ }));
    await expect(onApprove).toHaveBeenCalled();
  },
};

/** Changes asked for on these very pixels: nothing changed yet; point at what should. */
export const ChangeRequestUnchanged: Story = {
  render: () => (
    <RequestVerify
      request={requestHereCapture.request!}
      image={requestHereCapture.image}
      frame={{ width: 1280, height: 720 }}
      zoom={0.3}
      label="Checkout filled in"
      onApprove={fn()}
      onPin={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Change request, unchanged' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Pin what should change/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Approve anyway/ })).toBeInTheDocument();
  },
};
