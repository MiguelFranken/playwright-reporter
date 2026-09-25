import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ALL_PERSONAL_TOKENS, CREATED_TOKEN, PERSONAL_TOKENS, SCOPE_PROJECTS, SCOPE_TEAMS } from '../../fixtures/account';
import { AccessTokens, CreateTokenDialog, PersonalTokensTable, TokenCreatedDialog, type CreatedToken } from './access-tokens';

/**
 * Base UI's positioner inserts aria-hidden, tabbable focus guards around an
 * open listbox — the library's focus trap, not controls of ours. Same
 * exception as Primitives/Select, for the stories that open one.
 */
const OPEN_SELECT_A11Y = {
  a11y: {
    config: {
      rules: [
        { id: 'aria-input-field-name', enabled: false },
        { id: 'aria-hidden-focus', enabled: false },
      ],
    },
  },
} as const;

const meta = {
  title: 'Views/Account/Access tokens',
  component: AccessTokens,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    tokens: PERSONAL_TOKENS,
    teams: SCOPE_TEAMS,
    projects: SCOPE_PROJECTS,
    isSuperadmin: false,
    defaultDays: 90,
    maxDays: 365,
    setupHref: '/account/ai',
    createOpen: false,
    onCreateOpenChange: fn(),
    onCreate: fn(),
    created: null,
    onCreatedDismiss: fn(),
    onRevoke: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AccessTokens>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Active tokens can be revoked; expired and revoked ones are muted and cannot. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const revoke = canvas.getAllByRole('button', { name: 'Revoke' });
    await expect(revoke).toHaveLength(2);
    await userEvent.click(revoke[0]!);
    await expect(args.onRevoke).toHaveBeenCalledWith(PERSONAL_TOKENS[0]);
    await expect(canvas.getByText('never')).toBeVisible();
    await expect(canvas.getByText('Expired')).toBeVisible();
    await expect(canvas.getByText('Revoked')).toBeVisible();
  },
};

export const Empty: Story = {
  args: { tokens: [] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No access tokens')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Generate token' }));
    await expect(args.onCreateOpenChange).toHaveBeenCalledWith(true);
  },
};

/** One row's revocation is in flight; the others stay usable. */
export const Revoking: Story = {
  args: { revokingId: 'pat-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Revoking…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Revoke' })).toBeEnabled();
  },
};

/**
 * The whole flow with a stand-in for the app: open the dialog, name the token,
 * generate it, and see the secret once.
 */
export const CreateFlow: Story = {
  args: { tokens: [] },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const [created, setCreated] = useState<CreatedToken | null>(null);
    return (
      <AccessTokens
        {...args}
        createOpen={open}
        onCreateOpenChange={setOpen}
        created={created}
        onCreatedDismiss={() => setCreated(null)}
        onCreate={(values) => {
          args.onCreate(values);
          setOpen(false);
          setCreated({ ...CREATED_TOKEN, name: values.name });
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Generate token' }));
    const dialog = await body.findByRole('dialog', { name: 'Generate access token' });
    const generate = within(dialog).getByRole('button', { name: 'Generate' });
    await expect(generate).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Claude Code');
    await userEvent.click(generate);
    await expect(args.onCreate).toHaveBeenCalledWith({ name: 'Claude Code', expiresInDays: 90, scope: 'all' });

    // The first dialog animates out while this one animates in.
    const shown = await body.findByRole('dialog', { name: 'Token created' });
    await waitFor(() => expect(within(shown).getByText(CREATED_TOKEN.token)).toBeVisible());
    await userEvent.click(within(shown).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
  },
};

type DialogStory = StoryObj<typeof CreateTokenDialog>;

/** Superadmins may also mint a token that reaches every team. */
export const CreateDialogSuperadmin: DialogStory = {
  parameters: OPEN_SELECT_A11Y,
  render: (args) => <CreateTokenDialog {...args} />,
  args: {
    open: true,
    onOpenChange: fn(),
    teams: SCOPE_TEAMS,
    projects: SCOPE_PROJECTS,
    isSuperadmin: true,
    defaultDays: 90,
    maxDays: 365,
    onSubmit: fn(),
  },
  play: async ({ args }) => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Generate access token' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Release bot');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Access' }));
    await userEvent.click(await body.findByRole('option', { name: 'Every team (superadmin)' }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Expires after' }));
    await userEvent.click(await body.findByRole('option', { name: '30 days' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate' }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ name: 'Release bot', expiresInDays: 30, scope: 'superadmin' });
  },
};

/** A 30-day ceiling hides the longer lifetimes; an odd default still appears. */
export const CreateDialogShortLifetimes: DialogStory = {
  parameters: OPEN_SELECT_A11Y,
  render: (args) => <CreateTokenDialog {...args} />,
  args: { ...CreateDialogSuperadmin.args, isSuperadmin: false, defaultDays: 14, maxDays: 30 },
  play: async () => {
    const body = within(document.body);
    const dialog = await body.findByRole('dialog', { name: 'Generate access token' });
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Expires after' }));
    const listbox = await body.findByRole('listbox');
    await waitFor(() =>
      expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual(['7 days', '14 days', '30 days']),
    );
  },
};

export const CreateDialogPending: DialogStory = {
  render: (args) => <CreateTokenDialog {...args} />,
  args: { ...CreateDialogSuperadmin.args, pending: true },
  play: async () => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Generate access token' });
    await expect(within(dialog).getByRole('button', { name: 'Generating…' })).toBeDisabled();
  },
};

export const TokenCreated: StoryObj<typeof TokenCreatedDialog> = {
  render: (args) => <TokenCreatedDialog {...args} />,
  args: { created: CREATED_TOKEN, onDismiss: fn(), setupHref: '/account/ai' },
  play: async ({ args }) => {
    const dialog = await within(document.body).findByRole('dialog', { name: 'Token created' });
    await expect(within(dialog).getByRole('link', { name: 'AI assistants' })).toHaveAttribute('href', '/account/ai');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

/** Admin → MCP: every user's tokens, with an owner column. */
export const AdminOverview: StoryObj<typeof PersonalTokensTable> = {
  render: (args) => <PersonalTokensTable {...args} />,
  args: { tokens: ALL_PERSONAL_TOKENS, onRevoke: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('columnheader', { name: 'Owner' })).toBeVisible();
    await expect(canvas.getByText('linus@platform.test')).toBeVisible();
  },
};

/** Without `onRevoke` the table is read-only. */
export const ReadOnly: StoryObj<typeof PersonalTokensTable> = {
  render: (args) => <PersonalTokensTable {...args} />,
  // `meta.args` supplies an `onRevoke`; take it away.
  args: { tokens: PERSONAL_TOKENS, onRevoke: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Revoke' })).toBeNull();
  },
};
