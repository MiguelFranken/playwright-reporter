import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Card, CardContent } from '../../components/card';
import { ADMIN_TEAMS } from '../../fixtures/teams';
import { AdminTeams } from './admin-teams';

const meta = {
  title: 'Views/Admin/Teams',
  component: AdminTeams,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    teams: ADMIN_TEAMS,
    teamHref: (t) => `/teams/${t.slug}/settings/members`,
    createOpen: false,
    onCreateOpenChange: fn(),
    onCreate: fn(),
    toDelete: null,
    onDeleteRequest: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <Card className="max-w-4xl gap-0 py-0">
        <CardContent className="px-0">
          <Story />
        </CardContent>
      </Card>
    ),
  ],
} satisfies Meta<typeof AdminTeams>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('3 teams on this instance.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Labs' }));
    await expect(args.onDeleteRequest).toHaveBeenCalledWith(ADMIN_TEAMS[2]);
  },
};

/** Deleting names what goes with the team, and wants its slug typed. */
export const ConfirmingDelete: Story = {
  args: { toDelete: ADMIN_TEAMS[0] },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Delete Acme' }));
    await waitFor(() => expect(d.getByText(/This deletes 3 project\(s\)/)).toBeVisible());
    await userEvent.type(d.getByLabelText('Team slug'), 'acme');
    await userEvent.click(d.getByRole('button', { name: 'Delete team' }));
    await expect(args.onDelete).toHaveBeenCalledWith(ADMIN_TEAMS[0], 'acme');
  },
};

export const Creating: Story = {
  args: { createOpen: true },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'New team' }));
    await userEvent.type(d.getByLabelText('Name'), 'Growth Squad');
    await userEvent.click(d.getByRole('button', { name: 'Create team' }));
    await expect(args.onCreate).toHaveBeenCalledWith({ name: 'Growth Squad', slug: 'growth-squad' });
  },
};
