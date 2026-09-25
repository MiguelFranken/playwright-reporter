import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SidebarInset, SidebarProvider } from '../../components/sidebar';
import { TooltipProvider } from '../../components/tooltip';
import { SIDEBAR_TEAMS, SIDEBAR_USER } from '../../fixtures/teams';
import { AppSidebar, SidebarNav, SidebarNavSkeleton, TeamSwitcher, TeamSwitcherSkeleton, UserMenu, UserMenuSkeleton } from './app-sidebar';

interface ShellArgs {
  pathname: string;
  isSuperadmin: boolean;
  teams: typeof SIDEBAR_TEAMS;
  onSignOut: () => void;
}

function Shell({ pathname, isSuperadmin, teams, onSignOut }: ShellArgs) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          switcher={<TeamSwitcher teams={teams} pathname={pathname} />}
          nav={<SidebarNav teams={teams} isSuperadmin={isSuperadmin} pathname={pathname} />}
          account={<UserMenu user={{ ...SIDEBAR_USER, isSuperadmin }} onSignOut={onSignOut} />}
        />
        <SidebarInset>
          <div className="p-8 text-body-s text-muted-foreground">{pathname}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

const meta = {
  title: 'Views/Shell/Sidebar',
  component: Shell,
  parameters: { layout: 'fullscreen' },
  tags: ['themed'],
  args: { pathname: '/teams/acme/projects/web/runs', isSuperadmin: true, teams: SIDEBAR_TEAMS, onSignOut: fn() },
} satisfies Meta<typeof Shell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Inside a project: its section is open and the current page is marked. */
export const InAProject: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Test Runs' })).toHaveAttribute('data-active');
    await expect(canvas.getByRole('button', { name: 'Collapse Web shop' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Expand Checkout' })).toBeVisible();
  },
};

/** Administration expands in place like a project. */
export const InAdministration: Story = {
  args: { pathname: '/admin/users' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'Users' })).toHaveAttribute('data-active');
  },
};

/** A regular user sees no Instance group, and no Team settings on a team they cannot manage. */
export const RegularUser: Story = {
  args: { pathname: '/teams/platform', isSuperadmin: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Instance')).toBeNull();
    await expect(canvas.queryByRole('link', { name: 'Team settings' })).toBeNull();
  },
};

/** With one team there is nothing to switch to: the header links to the team. */
export const OneTeam: Story = {
  args: { teams: SIDEBAR_TEAMS.slice(0, 1) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: /Acme/ })).toHaveAttribute('href', '/teams/acme');
  },
};

export const SignsOut: Story = {
  parameters: {
    // Base UI's aria-hidden, tabbable focus guards around the open menu — the
    // library's focus trap, not controls of ours. Same exception as Primitives/Select.
    a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } },
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /ada@acme\.test/ }));
    await userEvent.click(await within(document.body).findByRole('menuitem', { name: 'Sign out' }));
    await expect(args.onSignOut).toHaveBeenCalled();
  },
};

/** What paints before the slots stream in. */
export const Loading: Story = {
  render: () => (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar switcher={<TeamSwitcherSkeleton />} nav={<SidebarNavSkeleton />} account={<UserMenuSkeleton />} />
        <SidebarInset />
      </SidebarProvider>
    </TooltipProvider>
  ),
};
