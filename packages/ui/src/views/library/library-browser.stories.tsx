import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { allViews, libraryFlows, manyLibraryFlows, NOW, savedViews, VIEWER_ID } from '../../fixtures/library-views';
import { BUILT_IN_VIEWS, DEFAULT_LIBRARY_VIEW } from '../../lib/library-views';
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
  tags: ['themed'],
} satisfies Meta<typeof LibraryBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every flow, by suite: the counts say what waits, the rows say where. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Ready to verify\s*1/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByRole('article', { name: /places an order/ })).toBeInTheDocument();
    await expect(canvas.getByRole('img', { name: 'Priority: Critical' })).toBeInTheDocument();
    // The views list their counts; a screen from an earlier run says which.
    await expect(within(canvas.getByRole('navigation', { name: 'Views' })).getByRole('button', { name: /^Open feedback/ })).toHaveTextContent('2');
    await expect(canvas.getAllByText('#483').length).toBeGreaterThan(0);
  },
};

/** A count filters to its step of the loop: here, the feedback a reviewer can verify now. */
export const FiltersFromTheSummary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Ready to verify\s*1/ }));
    await expect(args.onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ filters: { states: ['verify'], priorities: [] } }));
    await waitFor(() => expect(canvas.queryByRole('article', { name: /lists everything that is missing/ })).toBeNull());
    await expect(canvas.getByRole('article', { name: /places an order/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Remove the state filter' })).toBeInTheDocument();
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
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Scroll to top' }));
    await waitFor(() => expect(window.scrollY).toBe(0));
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
