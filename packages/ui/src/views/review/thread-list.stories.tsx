import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { buttonThread, NOW, pagewideThread, reviewThreads, VIEWER_ID } from '../../fixtures/review-threads';
import type { ThreadFilter } from '../../lib/review-threads';
import { ThreadList } from './thread-list';

/** The list is controlled; this keeps its filter and open thread the way the viewer does. */
function Hosted(props: Omit<React.ComponentProps<typeof ThreadList>, 'filter' | 'onFilterChange'>) {
  const [filter, setFilter] = useState<ThreadFilter>('open');
  const [open, setOpen] = useState<string | null>(props.openThreadId ?? null);
  const [composing, setComposing] = useState(false);
  return (
    <ThreadList
      {...props}
      filter={filter}
      onFilterChange={setFilter}
      openThreadId={open}
      onOpenThreadChange={(id) => {
        setOpen(id);
        props.onOpenThreadChange?.(id);
      }}
      composing={composing}
      onComposingChange={setComposing}
    />
  );
}

const meta = {
  title: 'Views/Review/Comments/ThreadList',
  component: Hosted,
  args: {
    groups: [{ captureId: 'cap-desktop', variant: 'desktop', threads: reviewThreads }],
    now: NOW,
    viewerId: VIEWER_ID,
    canComment: true,
    onOpenThreadChange: fn(),
    onHighlight: fn(),
    onCommentingChange: fn(),
    onCreateThread: fn(),
    onReply: fn(),
    onSetThreadStatus: fn(),
  },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Hosted>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open threads by number; a row opens its pin, and resolves from the check beside it. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Open, 5' })).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: /^Thread 1: / }));
    await expect(args.onOpenThreadChange).toHaveBeenCalledWith('thread-1');
    await expect(args.onHighlight).toHaveBeenCalledWith('thread-1');
    await userEvent.click(canvas.getByRole('button', { name: 'Resolve thread 2' }));
    await expect(args.onSetThreadStatus).toHaveBeenCalledWith({ threadId: 'thread-2', status: 'resolved', captureId: 'cap-desktop' });
  },
};

/** The resolved threads, and every one. */
export const Filtering: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Resolved, 1' }));
    await expect(canvas.getAllByRole('listitem')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('radio', { name: 'All, 6' }));
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
  },
};

/** A thread about the whole image opens here, with its replies. */
export const WholeImageThread: Story = {
  args: { groups: [{ captureId: 'cap-desktop', variant: 'desktop', threads: [pagewideThread] }] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Thread 5: / }));
    await userEvent.type(await canvas.findByRole('textbox', { name: 'Reply to thread 5' }), 'Agreed{Enter}');
    await expect(args.onReply).toHaveBeenCalledWith({ threadId: 'thread-5', body: 'Agreed' });
  },
};

/** No comments yet: how to start one, and a comment on the whole image. */
export const Empty: Story = {
  args: { groups: [{ captureId: 'cap-desktop', variant: 'desktop', threads: [] }] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/No comments yet/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Comment on the whole image' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Comment on the whole image' }), 'Feels cramped{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith({ captureId: 'cap-desktop', anchor: { kind: 'image', x: 0, y: 0 }, body: 'Feels cramped' });
  },
};

/** Desktop and mobile shown together: a heading per variant. */
export const SeveralVariants: Story = {
  args: {
    groups: [
      { captureId: 'cap-desktop', variant: 'desktop', threads: reviewThreads.slice(0, 2) },
      { captureId: 'cap-mobile', variant: 'mobile', threads: [{ ...buttonThread, id: 'thread-m1' }] },
    ],
  },
};

export const ReadOnly: Story = {
  args: { canComment: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Comment' })).toBeNull();
    await expect(canvas.queryByRole('button', { name: /^Resolve thread/ })).toBeNull();
  },
};
