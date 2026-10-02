import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixedThread, NOW, VIEWER_ID } from '../../fixtures/review-threads';
import { FeedbackPanel, type FeedbackEntry } from './feedback-panel';
import { FeedbackThreadCard } from './thread-verify';

const entries: FeedbackEntry[] = [
  { key: 'a', screen: '2. Checkout filled in · desktop', number: 1, excerpt: 'The order button should use the primary style.', stage: 'verify', done: true },
  { key: 'b', screen: '2. Checkout filled in · desktop', number: 3, excerpt: 'The header wraps onto two lines.', stage: 'verify', done: false },
  { key: 'c', screen: '2. Checkout filled in · mobile', number: 1, excerpt: 'The button is cut off at 390px.', stage: 'waiting', done: false },
  { key: 'd', screen: '3. Order placed · desktop', number: null, excerpt: 'Changes requested without a comment', stage: 'verify', done: false },
  { key: 'e', screen: '3. Order placed · desktop', number: 2, excerpt: 'The confirmation number should be copyable — a long comment that runs on past the width of the panel.', stage: 'waiting', done: false },
];

const meta = {
  title: 'Views/Review/Comments/FeedbackPanel',
  component: FeedbackPanel,
  args: {
    mode: 'resolve',
    entries,
    currentKey: 'b',
    onGo: fn(),
    onStep: fn(),
    scope: 'all',
    counts: { verify: 3, waiting: 2, all: 5 },
    onScopeChange: fn(),
    comparing: true,
    onComparingChange: fn(),
  },
  decorators: [(Story) => <div className="w-80 bg-popover p-4">{Story()}</div>],
} satisfies Meta<typeof FeedbackPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The round: where you are, how much is resolved, which feedback, and every thread of it by screen. */
export const Default: Story = {
  args: {
    children: <FeedbackThreadCard thread={fixedThread} stage="verify" captureId="c" now={NOW} viewerId={VIEWER_ID} canComment onResolve={fn()} onNext={fn()} onReply={fn()} />,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('2 of 5')).toBeInTheDocument();
    await expect(canvas.getByText('1 resolved')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('radio', { name: 'To verify, 3' }));
    await expect(args.onScopeChange).toHaveBeenCalledWith('verify');
    await userEvent.click(canvas.getByRole('button', { name: 'Next feedback' }));
    await expect(args.onStep).toHaveBeenCalledWith(1);
    const list = within(canvas.getByRole('navigation', { name: 'Feedback in this round' }));
    await expect(list.getByRole('button', { name: /Comment 3:/ })).toHaveAttribute('aria-current', 'step');
    await userEvent.click(list.getByRole('button', { name: /The button is cut off/ }));
    await expect(args.onGo).toHaveBeenCalledWith('c');
    await userEvent.click(canvas.getByRole('button', { name: 'Show the screen' }));
    await expect(args.onComparingChange).toHaveBeenCalledWith(false);
  },
};

/** At the first item there is nothing before it. */
export const AtTheStart: Story = {
  args: { currentKey: 'a' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Previous feedback' })).toBeDisabled();
  },
};

/** Verifying the comments of one screen: no scope, and a way out. */
export const VerifyingOneScreen: Story = {
  args: { mode: 'verify', entries: entries.slice(0, 2), scope: undefined, counts: undefined, onScopeChange: undefined, onComparingChange: undefined, onClose: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('region', { name: 'Verifying comments' })).toBeInTheDocument();
    await expect(canvas.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Stop verifying' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** Nothing in the round. */
export const Empty: Story = { args: { entries: [], currentKey: null, counts: { verify: 0, waiting: 0, all: 0 } } };
