import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '../../components/button';
import { AiAssistants } from './ai-assistants';

const PROJECTS = [
  { value: 'acme/web', label: 'acme/web' },
  { value: 'acme/checkout', label: 'acme/checkout' },
  { value: 'platform/design-system', label: 'platform/design-system' },
];

const meta = {
  title: 'Views/Account/AI assistants',
  component: AiAssistants,
  parameters: {
    layout: 'padded',
    a11y: {
      config: {
        // Base UI's positioner inserts aria-hidden, tabbable focus guards
        // around the open project listbox — the library's focus trap, not
        // controls of ours. Same exception as Primitives/Select.
        rules: [
          { id: 'aria-input-field-name', enabled: false },
          { id: 'aria-hidden-focus', enabled: false },
        ],
      },
    },
  },
  tags: ['themed'],
  args: {
    baseUrl: 'https://reporter.acme.test',
    projects: PROJECTS,
    tokensHref: '/account',
    testConnection: (
      <Button size="sm" variant="outline">
        Test connection
      </Button>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AiAssistants>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Drives the page the way a user does: pick a client, then pin a project, and every snippet follows. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await expect(canvas.getByText(/claude mcp add --transport http playwright-reporter/)).toBeVisible();

    await userEvent.click(canvas.getByRole('tab', { name: 'Cursor' }));
    await expect(await canvas.findByText(/"mcpServers"/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Add to Cursor' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=playwright-reporter&config=/),
    );

    await userEvent.click(canvas.getByRole('combobox', { name: 'Default project' }));
    await userEvent.click(await body.findByRole('option', { name: 'acme/checkout' }));
    await waitFor(() => expect(canvas.getByText('https://reporter.acme.test/api/mcp?project=acme%2Fcheckout')).toBeVisible());

    await userEvent.click(canvas.getByRole('tab', { name: 'Codex' }));
    await expect(await canvas.findByText(/\[mcp_servers\.playwright-reporter\]/)).toBeVisible();
  },
};

/** Opened from a project: the picker starts on it and the snippets already carry it. */
export const WithProject: Story = {
  args: { defaultProject: 'acme/web', defaultClient: 'vscode' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Default project' })).toHaveTextContent('acme/web');
    await expect(canvas.getByText(/"type": "http"/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Add to VS Code' })).toHaveAttribute('href', expect.stringContaining('acme%252Fweb'));
  },
};

/** A new account nobody has added to a team yet. */
export const NoProjects: Story = {
  args: { projects: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/cannot see any project yet/)).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: 'Default project' })).toHaveTextContent('Any project (ask each time)');
  },
};

/** Clients that are not wired up yet still show their configuration, flagged. */
export const ComingSoon: Story = {
  args: { defaultClient: 'claude-desktop' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Coming soon')).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'claude.ai / ChatGPT' }));
    await expect(await canvas.findByText(/custom connector/)).toBeVisible();
  },
};

/** Right after minting: the real token is embedded, so the placeholder hint disappears. */
export const WithToken: Story = {
  args: { token: 'pwr_pat_3kQ9xV2mR7tL0aB5nC8dE1fG4hJ6', testConnection: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/Replace/)).toBeNull();
    await expect(canvas.getByText(/Bearer pwr_pat_3kQ9/)).toBeVisible();
  },
};

/** A self-hosted install on a long internal URL — the snippets must scroll, not overflow the card. */
export const LongUrl: Story = {
  args: { baseUrl: 'https://playwright-reporter.internal.eu-central-1.acme-corporation.test:8443', defaultProject: 'platform/design-system' },
};
