import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { API_TOKENS, CREATED_API_TOKEN } from '../../fixtures/teams';
import type { RevealedToken } from '../../patterns/token-reveal-dialog';
import { ApiTokens } from './api-tokens';

const meta = {
  title: 'Views/Settings/API tokens',
  component: ApiTokens,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    tokens: API_TOKENS,
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
} satisfies Meta<typeof ApiTokens>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Revoked 1 month ago')).toBeVisible();
    const revoke = canvas.getAllByRole('button', { name: 'Revoke' });
    await expect(revoke).toHaveLength(2);
    await userEvent.click(revoke[0]!);
    await expect(args.onRevoke).toHaveBeenCalledWith(API_TOKENS[0]);
  },
};

export const Empty: Story = {
  args: { tokens: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('No API tokens')).toBeVisible();
  },
};

export const Revoking: Story = {
  args: { revokingId: 'tok-1' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Revoking…' })).toBeDisabled();
  },
};

/** Name it, generate it, copy the secret once. */
export const CreateFlow: Story = {
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const [created, setCreated] = useState<RevealedToken | null>(null);
    return (
      <ApiTokens
        {...args}
        createOpen={open}
        onCreateOpenChange={setOpen}
        created={created}
        onCreatedDismiss={() => setCreated(null)}
        onCreate={(name) => {
          args.onCreate(name);
          setOpen(false);
          setCreated({ ...CREATED_API_TOKEN, name });
        }}
      />
    );
  },
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Generate token' }));
    const d = within(await body.findByRole('dialog', { name: 'Generate API token' }));
    await userEvent.type(d.getByLabelText('Name'), 'Buildkite');
    await userEvent.click(d.getByRole('button', { name: 'Generate' }));
    await expect(args.onCreate).toHaveBeenCalledWith('Buildkite');
    const shown = await body.findByRole('dialog', { name: 'Token created' });
    await waitFor(() => expect(within(shown).getByText(/PW_REPORTER_TOKEN=pwr_live_9…/)).toBeVisible());
  },
};
