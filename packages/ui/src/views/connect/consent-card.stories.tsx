import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SCOPE_PROJECTS, SCOPE_TEAMS } from '../../fixtures/account';
import { ConnectBrand, ConnectNotice, ConsentCard } from './consent-card';

const meta = {
  title: 'Views/Connect/Consent',
  component: ConsentCard,
  parameters: {
    layout: 'centered',
    a11y: {
      config: {
        // Base UI's focus guards around the open access listbox. Same exception as Primitives/Select.
        rules: [
          { id: 'aria-input-field-name', enabled: false },
          { id: 'aria-hidden-focus', enabled: false },
        ],
      },
    },
  },
  tags: ['themed'],
  args: {
    clientName: 'Claude',
    verified: true,
    redirectHost: 'claude.ai',
    userLabel: 'Ada Lovelace <ada@acme.test>',
    teams: SCOPE_TEAMS,
    projects: SCOPE_PROJECTS,
    isSuperadmin: false,
    onAllow: fn(),
    onDeny: fn(),
  },
  decorators: [
    (Story) => (
      <div className="flex w-[28rem] flex-col gap-4">
        <ConnectBrand />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConsentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Narrow the access, then allow: the choice goes to the callback. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Access' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'Project: acme/web' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Allow' }));
    await expect(args.onAllow).toHaveBeenCalledWith('project:project-web');
  },
};

export const Deny: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Deny' }));
    await expect(args.onDeny).toHaveBeenCalledWith('all');
  },
};

/** A client that registered itself gets a warning to only continue if you started this. */
export const Unverified: Story = {
  args: { clientName: 'my-mcp-client', verified: false, redirectHost: '127.0.0.1:33418' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/registered itself with this server/)).toBeVisible();
  },
};

export const Connecting: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Deny' })).toBeDisabled();
  },
};

export const InvalidRequest: StoryObj<typeof ConnectNotice> = {
  render: (args) => <ConnectNotice {...args} />,
  args: {
    title: 'This connection request is not valid',
    description: 'The redirect URI is not registered for this client. Start the connection again from your assistant.',
  },
};

export const DemoAccount: StoryObj<typeof ConnectNotice> = {
  render: (args) => <ConnectNotice {...args} />,
  args: {
    icon: false,
    title: 'The demo account cannot connect assistants',
    description: 'It is shared by every visitor. Sign in with your own account to connect Claude.',
  },
};
