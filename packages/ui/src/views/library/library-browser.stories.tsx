import type { Meta, StoryObj } from '@storybook/react';
import { startTransition, useState } from 'react';
import { expect, fn, spyOn, userEvent, waitFor, within } from 'storybook/test';
import { allViews, libraryFlows, manyLibraryFlows, NOW, savedViews, VIEWER_ID, waitingFlow } from '../../fixtures/library-views';
import type { FeedbackScope } from '../../lib/feedback-queue';
import { BUILT_IN_VIEWS, DEFAULT_LIBRARY_VIEW } from '../../lib/library-views';
import type { ReviewSelection } from '../review/checkpoint-viewer';
import { LibraryBrowser } from './library-browser';

const meta = {
  title: 'Views/Library/Browser/LibraryBrowser',
  component: LibraryBrowser,
  args: {
    flows: libraryFlows,
    views: allViews,
    onConfigChange: fn(),
    onActiveViewChange: fn(),
    onSaveView: fn(),
    onUpdateView: fn(),
    onDeleteView: fn(),
    onSelectionChange: fn(),
    onOpenThread: fn(),
    comments: { canComment: true, onCreateThread: fn(), onSetThreadStatus: fn(), onReply: fn(), now: NOW, viewerId: VIEWER_ID },
  },
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-dvh bg-surface p-6">{Story()}</div>],
} satisfies Meta<typeof LibraryBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every flow, by suite: the views count what waits, the rows say where. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Nothing is filtered, so there is no row of filter chips.
    await expect(canvas.queryByRole('button', { name: /^Remove the/ })).toBeNull();
    await expect(canvas.getByRole('article', { name: /places an order/ })).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: 'Priority: Critical' })).toBeInTheDocument();
    // The views list their counts; a screen from an earlier run says which.
    await expect(within(canvas.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: /^Open feedback/ })).toHaveTextContent('2');
    await expect(canvas.getAllByText('#483').length).toBeGreaterThan(0);
  },
};

/** The Filter menu narrows the library to a step of the loop, and the filter shows as a chip under the title. */
export const FiltersFromTheMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: /^Filter/ }));
    await userEvent.click(await body.findByRole('menuitemcheckbox', { name: /Ready to verify/ }));
    await expect(args.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ filters: { states: ['verify'], priorities: [] } }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(canvas.queryByRole('article', { name: /lists everything that is missing/ })).toBeNull());
    await expect(canvas.getByRole('article', { name: /places an order/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove the state filter' }));
    await expect(await canvas.findByRole('article', { name: /lists everything that is missing/ })).toBeInTheDocument();
  },
};

/** A built-in view: the developer's — open feedback on the screens as they are, by priority. */
export const ToFix: Story = {
  args: { activeViewId: 'to-fix', config: BUILT_IN_VIEWS.find((v) => v.id === 'to-fix')!.config },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 2, name: /High/ })).toBeInTheDocument();
    await expect(canvas.queryByRole('article', { name: /places an order/ })).toBeNull();
  },
};

/**
 * Filters set on top of a view hold everywhere: the views count what each
 * would show with them, the folders how many of their flows pass, and
 * picking another view keeps the filter it leaves open.
 */
export const CountsFollowTheFilters: Story = {
  args: { activeViewId: 'all', config: { ...DEFAULT_LIBRARY_VIEW, filters: { states: [], priorities: ['critical'] } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const shown = canvas.getAllByRole('article').length;
    const views = within(canvas.getByRole('navigation', { name: 'Views' }));
    await expect(views.getByRole('button', { name: /^All flows/ })).toHaveTextContent(new RegExp(`${shown}$`));
    const tree = within(canvas.getByRole('navigation', { name: 'Folders' }));
    await expect(tree.getByRole('button', { name: /All suites/ })).toHaveTextContent(new RegExp(`${shown}$`));
    await userEvent.click(views.getByRole('button', { name: /^To fix/ }));
    await expect(args.onActiveViewChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'to-fix' }),
      expect.objectContaining({ filters: { states: ['waiting'], priorities: ['critical'] } }),
    );
  },
};

/** The selection and the open thread kept the way the app keeps them in the URL. */
function Hosted(props: React.ComponentProps<typeof LibraryBrowser>) {
  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [thread, setThread] = useState<number | null>(null);
  return (
    <LibraryBrowser
      {...props}
      selection={selection}
      onSelectionChange={(next) => {
        props.onSelectionChange?.(next);
        setSelection(next);
      }}
      onOpenThread={(next, n) => {
        props.onOpenThread?.(next, n);
        setSelection(next);
        setThread(n);
      }}
      comments={{ ...props.comments, openThread: thread, onOpenThreadChange: setThread }}
    />
  );
}

/**
 * Resolve feedback: what changed since it was given first, one comment after
 * another, compared with the version it was made on. E resolves it and goes
 * on; the end says so; the strip switches to all open feedback, and the next
 * item on another screen is the host's to show.
 */
export const ResolvesFeedback: Story = {
  args: { onResolvingChange: fn() },
  render: (args) => <Hosted {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: /^Resolve feedback: 1 to verify/ }));
    await expect(args.onResolvingChange).toHaveBeenCalledWith('verify');
    const bar = within(await body.findByRole('group', { name: 'Resolving feedback' }));
    await expect(bar.getByText('1 of 1')).toBeInTheDocument();
    await expect(await body.findByRole('group', { name: 'Verify comment 1' })).toBeInTheDocument();
    await userEvent.keyboard('e');
    await expect(args.comments!.onSetThreadStatus).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-verify', status: 'resolved' }));
    await expect(await body.findByText('All feedback resolved')).toBeInTheDocument();
    await userEvent.click(bar.getByRole('radio', { name: /^All open, / }));
    await expect(args.onResolvingChange).toHaveBeenCalledWith('all');
    await expect(await body.findByRole('group', { name: 'Verify comment 1' })).toBeInTheDocument();
    await userEvent.keyboard(']');
    await expect(args.onOpenThread).toHaveBeenCalledWith({ checkpointId: waitingFlow.checkpoints[0].id, variant: 'desktop' }, 2);
    await expect(await body.findByRole('group', { name: 'Comment 2, unchanged' })).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Close' }));
    await expect(args.onResolvingChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  },
};

/**
 * Held in the URL, as the app does: what is open and the feedback being gone
 * through change in a transition (Next.js applies a new query string in one),
 * so they arrive a render after what the browser keeps itself.
 */
function UrlHosted({ resolving: initialResolving, ...props }: React.ComponentProps<typeof LibraryBrowser>) {
  const [selection, setSelection] = useState<ReviewSelection | null>(null);
  const [resolving, setResolving] = useState<FeedbackScope | null>(initialResolving ?? null);
  const [thread, setThread] = useState<number | null>(null);
  const later = (update: () => void) => startTransition(update);
  return (
    <LibraryBrowser
      {...props}
      selection={selection}
      onSelectionChange={(next) => later(() => setSelection(next))}
      resolving={resolving}
      onResolvingChange={(next) => {
        props.onResolvingChange?.(next);
        later(() => setResolving(next));
      }}
      onOpenThread={(next, n) => later(() => (setSelection(next), setThread(n)))}
      comments={{ ...props.comments, openThread: thread, onOpenThreadChange: (n) => later(() => setThread(n)) }}
    />
  );
}

/** A link into the feedback (`resolve=waiting`) opens it; the close button closes it, and it stays closed. */
export const ClosesFeedbackFromALink: Story = {
  args: { resolving: 'waiting', onResolvingChange: fn() },
  render: (args) => <UrlHosted {...args} />,
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(await body.findByRole('group', { name: 'Resolving feedback' })).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Close' }));
    await expect(args.onResolvingChange).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await new Promise((r) => setTimeout(r, 300));
    await expect(body.queryByRole('dialog')).toBeNull();
    await expect(args.onResolvingChange).toHaveBeenLastCalledWith(null);
  },
};

/** The feedback inbox goes through what it lists, one by one. */
export const ResolvesFromTheInbox: Story = {
  args: { onResolvingChange: fn() },
  render: (args) => <Hosted {...args} />,
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^Open feedback:/ }));
    const sheet = within(await body.findByRole('dialog', { name: /Open feedback/ }));
    await userEvent.click(sheet.getByRole('radio', { name: /^Waiting for changes/ }));
    await userEvent.click(sheet.getByRole('button', { name: /Go through them one by one/ }));
    await expect(args.onResolvingChange).toHaveBeenCalledWith('waiting');
    await expect(args.onOpenThread).toHaveBeenCalledWith({ checkpointId: waitingFlow.checkpoints[0].id, variant: 'desktop' }, 2);
    await expect(await body.findByRole('group', { name: 'Comment 2, unchanged' })).toBeInTheDocument();
  },
};

/** Grouped by review state. */
export const ByState: Story = { args: { config: { ...DEFAULT_LIBRARY_VIEW, group: 'state' } } };

/** Changed settings can be reset or saved as a view of one's own, in the view builder. */
export const SavesAView: Story = {
  args: { config: { ...DEFAULT_LIBRARY_VIEW, group: 'priority' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Edited')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Save view' }));
    const dialog = within(await within(document.body).findByRole('dialog', { name: 'New view' }));
    await userEvent.type(dialog.getByRole('textbox', { name: 'Name' }), 'By priority');
    await userEvent.click(dialog.getByRole('button', { name: /Waiting for changes/ }));
    await expect(dialog.getByText(/Shows/)).toHaveTextContent('Shows 1 of 4 flows');
    await userEvent.click(dialog.getByRole('button', { name: 'Create view' }));
    await expect(args.onSaveView).toHaveBeenCalledWith({ name: 'By priority', config: expect.objectContaining({ group: 'priority', filters: { states: ['waiting'], priorities: [] } }) });
    await waitFor(() => expect(within(document.body).queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.querySelector('[data-base-ui-focus-guard]')).toBeNull());
  },
};

/** On a saved view that was changed: save into it, or as a new one. */
export const ChangedSavedView: Story = {
  args: { activeViewId: savedViews[0].id, config: { ...savedViews[0].config, sort: 'recent' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save to “Checkout fixes”' }));
    await expect(args.onUpdateView).toHaveBeenCalledWith({ id: savedViews[0].id, config: expect.objectContaining({ sort: 'recent' }) });
    await expect(canvas.getByRole('img', { name: 'changed' })).toBeInTheDocument();
  },
};

/** By spec file: the tree and the sections follow the view's folders. */
export const BySpecFile: Story = {
  args: { config: { ...DEFAULT_LIBRARY_VIEW, folders: 'file' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tree = within(canvas.getByRole('navigation', { name: 'Folders' }));
    await expect(tree.getByRole('heading', { name: 'Spec files' })).toBeInTheDocument();
    await expect(tree.getByRole('button', { name: /All files/ })).toBeInTheDocument();
    await expect(tree.queryByRole('button', { name: 'Test Cases' })).toBeNull();
  },
};

/** A saved view, edited in the builder: its name and its settings, saved together. */
export const EditsASavedView: Story = {
  args: { activeViewId: savedViews[0].id, config: savedViews[0].config },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Actions for the view Checkout fixes' }));
    await userEvent.click(await body.findByRole('menuitem', { name: 'Edit view' }));
    const dialog = within(await body.findByRole('dialog', { name: 'Edit view' }));
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Checkout fixes');
    await userEvent.click(dialog.getByRole('button', { name: 'Files' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save view' }));
    await expect(args.onUpdateView).toHaveBeenCalledWith({ id: savedViews[0].id, name: 'Checkout fixes', config: expect.objectContaining({ folders: 'file', group: 'priority' }) });
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  },
};

/** Scrolled far down a long library, one click goes back to the top. */
export const ScrollsBackToTop: Story = {
  args: { flows: manyLibraryFlows },
  play: async ({ canvasElement }) => {
    window.scrollTo({ top: 3000 });
    // Assert the request, not the glide: a smooth scroll only advances on
    // animation frames, which a busy parallel run can starve until it stalls.
    const scrollTo = spyOn(window, 'scrollTo');
    try {
      await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Scroll to top' }));
      await expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    } finally {
      scrollTo.mockRestore();
    }
  },
};

/** The inbox lists every open comment; one opens the viewer at its pin. */
export const OpensTheInbox: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Open feedback: 2 open comments, 1 to verify/ }));
    const body = within(document.body);
    const list = await body.findByRole('list', { name: 'Open comments' });
    await expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(body.getByRole('radio', { name: 'Ready to verify, 1' }));
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(1));
    await userEvent.click(within(list).getByRole('button', { name: /primary style/ }));
    await expect(args.onOpenThread).toHaveBeenCalledWith({ checkpointId: libraryFlows[0].checkpoints[1].id, variant: 'desktop' }, 1);
  },
};

/** A right-click on a suite approves what in it needs review, or shows its open comments. */
export const FolderMenu: Story = {
  args: { onDecide: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.pointer({ keys: '[MouseRight]', target: canvas.getByRole('button', { name: /All suites/ }) });
    const approve = await body.findByRole('menuitem', { name: /^Approve \d+ flows?$/ });
    await userEvent.click(approve);
    const dialog = await body.findByRole('dialog', { name: /^Approve/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /^Approve/ }));
    await waitFor(() => expect(args.onDecide).toHaveBeenCalledWith(expect.objectContaining({ decision: 'approved' })));

    await userEvent.pointer({ keys: '[MouseRight]', target: canvas.getByRole('button', { name: /All suites/ }) });
    await userEvent.click(await body.findByRole('menuitem', { name: 'Show 2 open comments' }));
    const list = await body.findByRole('list', { name: 'Open comments' });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2));
  },
};

/** Filters that match nothing say so, and clear in one click. */
export const NothingMatches: Story = {
  args: { config: { ...DEFAULT_LIBRARY_VIEW, filters: { states: ['waiting'], priorities: ['low'] } } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No flows match this view')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Clear filters' }));
    await expect(args.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ filters: { states: [], priorities: [] } }));
  },
};

export const Empty: Story = { args: { flows: [], emptyTitle: 'No screens for main yet' } };

/** A library that has grown: hundreds of flows, virtualised. */
export const ManyFlows: Story = { args: { flows: manyLibraryFlows } };

/** Without saving: a viewer without write access still filters and groups. */
export const WithoutSaving: Story = { args: { onSaveView: undefined, onUpdateView: undefined, onDeleteView: undefined, views: BUILT_IN_VIEWS, config: { ...DEFAULT_LIBRARY_VIEW, sort: 'priority' } } };

/** On a phone the rail folds away behind one button, so the flows come first. */
export const Phone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: /Views and folders/ });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByRole('navigation', { name: 'Views' })).toBeVisible();
  },
};
