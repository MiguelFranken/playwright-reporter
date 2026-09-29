'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SignOutButton } from '@miguelfranken/ui/views/auth/invitation';
import {
  SidebarNav as SidebarNavView,
  TeamSwitcher as TeamSwitcherView,
  UserMenu as UserMenuView,
} from '@miguelfranken/ui/views/shell/app-sidebar';
import { authClient } from '@/lib/auth/client';
import { displayableAvatar } from '@/lib/avatars';
import { useLastWorkspace, type SidebarTeam, type SidebarUser, type Workspace } from '@/components/nav-model';

export { AppSidebar, SidebarNavSkeleton, TeamSwitcherSkeleton, UserMenuSkeleton } from '@miguelfranken/ui/views/shell/app-sidebar';
export type { SidebarProject, SidebarTeam, SidebarUser, Workspace } from '@/components/nav-model';

/**
 * The connected halves of the sidebar: they read the URL, remember the last
 * team and project, vet avatar URLs and sign out through the auth client; the
 * design system renders the rest.
 */
export function SidebarNav({
  teams,
  isSuperadmin,
  lastWorkspace,
}: {
  teams: SidebarTeam[];
  isSuperadmin: boolean;
  lastWorkspace: Workspace | null;
}) {
  return (
    <SidebarNavView
      teams={teams}
      isSuperadmin={isSuperadmin}
      pathname={usePathname()}
      lastWorkspace={useLastWorkspace(lastWorkspace)}
    />
  );
}

export function TeamSwitcher({ teams, lastWorkspace }: { teams: SidebarTeam[]; lastWorkspace: Workspace | null }) {
  return (
    <TeamSwitcherView
      teams={teams.map((t) => ({ ...t, image: displayableAvatar(t.image) }))}
      pathname={usePathname()}
      lastWorkspace={useLastWorkspace(lastWorkspace)}
    />
  );
}

export function UserMenu({ user }: { user: SidebarUser }) {
  const { pending, signOut } = useSignOut('/login');
  return <UserMenuView user={{ ...user, image: displayableAvatar(user.image) }} signingOut={pending} onSignOut={signOut} />;
}

/** A plain button for pages without a sidebar (invitation, empty states). */
export function PlainSignOutButton({ next = '/login' }: { next?: string }) {
  const { pending, signOut } = useSignOut(next);
  return <SignOutButton pending={pending} onSignOut={signOut} />;
}

function useSignOut(next: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const signOut = () =>
    startTransition(async () => {
      await authClient.signOut();
      // The query cache outlives navigations; the next account must not see this one's data.
      queryClient.clear();
      router.push(next);
      router.refresh();
    });
  return { pending, signOut };
}
