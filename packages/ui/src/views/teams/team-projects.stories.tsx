import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { TEAM_PROJECTS } from '../../fixtures/teams';
import { TeamProjects } from './team-projects';

const meta = {
  title: 'Views/Teams/Projects',
  component: TeamProjects,
  parameters: { layout: 'padded' },
  tags: ['themed'],
  args: {
    teamSlug: 'acme',
    projects: TEAM_PROJECTS,
    projectHref: (p) => `/teams/acme/projects/${p.slug}/dashboard`,
    canCreate: true,
    canDelete: true,
    createOpen: false,
    onCreateOpenChange: fn(),
    onCreate: fn(),
    toDelete: null,
    onDeleteRequest: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TeamProjects>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Web shop' })).toHaveAttribute('href', '/teams/acme/projects/web/dashboard');
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Checkout' }));
    await expect(args.onDeleteRequest).toHaveBeenCalledWith(TEAM_PROJECTS[1]);
    await userEvent.click(canvas.getByRole('button', { name: 'New project' }));
    await expect(args.onCreateOpenChange).toHaveBeenCalledWith(true);
  },
};

export const ReadOnly: Story = {
  args: { canCreate: false, canDelete: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

export const OneProject: Story = { args: { projects: TEAM_PROJECTS.slice(0, 1) } };

/** The team page's create dialog prefixes the team's URL. */
export const Creating: Story = {
  args: { createOpen: true },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'New project' }));
    await userEvent.type(d.getByLabelText('Name'), 'Mobile');
    await expect(d.getByText('/teams/acme/projects/mobile')).toBeVisible();
    await userEvent.click(d.getByRole('button', { name: 'Create project' }));
    await expect(args.onCreate).toHaveBeenCalledWith({ name: 'Mobile', slug: 'mobile' });
  },
};

export const ConfirmingDelete: Story = {
  args: { toDelete: TEAM_PROJECTS[1] },
  play: async ({ args }) => {
    const d = within(await within(document.body).findByRole('dialog', { name: 'Delete Checkout' }));
    await userEvent.type(d.getByLabelText('Project slug'), 'checkout');
    await userEvent.click(d.getByRole('button', { name: 'Delete project' }));
    await expect(args.onDelete).toHaveBeenCalledWith(TEAM_PROJECTS[1], 'checkout');
  },
};
