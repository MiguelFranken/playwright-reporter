import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { INVITATIONS, MEMBERS, TEAM_PROJECTS } from '../fixtures/teams';
import { NavTabs } from '../patterns/nav-tabs';
import { PageHeader } from '../patterns/page-header';
import { TeamMembers } from '../views/teams/team-members';
import { TeamProjects } from '../views/teams/team-projects';

const meta = {
  title: 'Pages/Team settings',
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = () => {};

const TABS = ['members', 'projects', 'general'].map((segment) => ({
  href: `/teams/acme/settings/${segment}`,
  label: segment[0]!.toUpperCase() + segment.slice(1),
}));

function Frame({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Team settings" description="Who can see this team, what they may do, and which projects it owns." />
      <NavTabs items={TABS} activeHref={`/teams/acme/settings/${active}`} label="Team settings sections" />
      {children}
    </div>
  );
}

export const Members: Story = {
  render: () => (
    <Frame active="members">
      <TeamMembers
        members={MEMBERS}
        invitations={INVITATIONS}
        currentUserId="u-ada"
        canManage
        link={null}
        onLinkDismiss={noop}
        inviteOpen={false}
        onInviteOpenChange={noop}
        onInvite={noop}
        onRoleChange={noop}
        onRemove={noop}
        onNewLink={noop}
        onRevokeInvitation={noop}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('navigation', { name: 'Team settings sections' })).toBeVisible();
  },
};

export const Projects: Story = {
  render: () => (
    <Frame active="projects">
      <TeamProjects
        teamSlug="acme"
        projects={TEAM_PROJECTS}
        projectHref={(p) => `/teams/acme/projects/${p.slug}/dashboard`}
        canCreate
        canDelete
        createOpen={false}
        onCreateOpenChange={noop}
        onCreate={noop}
        toDelete={null}
        onDeleteRequest={noop}
        onDelete={noop}
      />
    </Frame>
  ),
};
