import 'server-only';
import { cache } from 'react';
import { Suspense } from 'react';
import { AppBreadcrumbs, BreadcrumbsSkeleton } from '@/components/app-breadcrumbs';
import {
  AppSidebar,
  SidebarNav,
  SidebarNavSkeleton,
  TeamSwitcher,
  TeamSwitcherSkeleton,
  UserMenu,
  UserMenuSkeleton,
  type SidebarTeam,
} from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@miguelfranken/ui/components/sidebar';
import { TooltipProvider } from '@miguelfranken/ui/components/tooltip';
import { requireUser } from '@/lib/auth/access';
import { roleCan } from '@/lib/auth/permissions';
import { listAllTeams, listMyTeams, listProjectsForTeams } from '@/lib/db/queries/teams';

/**
 * Everything the chrome needs, resolved once per request: the teams this user
 * may open, each with its projects and whether they can manage it.
 *
 * Deliberately **not** keyed by the current URL. This layout is shared by every
 * signed-in section, so Next.js keeps it mounted across navigations and never
 * re-runs it; the nav and the breadcrumbs pick the active team out of this set
 * on the client, from `usePathname()`. That is what makes switching teams,
 * projects and sections instant instead of re-streaming the sidebar.
 *
 * Both queries are indexed lookups over a handful of rows — a self-hosted
 * instance has tens of teams, not thousands — so loading all of them beats a
 * round trip per navigation.
 */
const shellData = cache(async () => {
  const user = await requireUser();

  // A superadmin can open any team, so the switcher offers all of them.
  const rows = user.isSuperadmin
    ? (await listAllTeams()).map((t) => ({ id: t.id, slug: t.slug, name: t.name, image: t.image, canManage: true }))
    : (await listMyTeams(user.id)).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        image: t.image,
        canManage: roleCan(t.role, { member: ['read'] }),
      }));

  const projects = await listProjectsForTeams(rows.map((t) => t.id));

  const teams: SidebarTeam[] = rows.map((t) => ({
    slug: t.slug,
    name: t.name,
    image: t.image,
    canManage: t.canManage,
    projects: projects.filter((p) => p.teamId === t.id).map((p) => ({ slug: p.slug, name: p.name })),
  }));

  return { user, teams };
});

/**
 * The application shell: sidebar, sticky header and the content well.
 *
 * Nothing here awaits, so the frame is part of the static shell and paints
 * immediately. The session-dependent pieces — the switcher, the nav, the
 * account menu and the breadcrumbs — each sit behind their own boundary, and
 * `{children}` streams independently of all four.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          switcher={
            <Suspense fallback={<TeamSwitcherSkeleton />}>
              <SwitcherSlot />
            </Suspense>
          }
          nav={
            <Suspense fallback={<SidebarNavSkeleton />}>
              <NavSlot />
            </Suspense>
          }
          account={
            <Suspense fallback={<UserMenuSkeleton />}>
              <AccountSlot />
            </Suspense>
          }
        />
        <SidebarInset className="min-w-0 overflow-hidden">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b border-separator bg-surface/85 px-4 backdrop-blur-sm md:rounded-t-xl">
            <SidebarTrigger className="-ms-1.5" />
            <Suspense fallback={<BreadcrumbsSkeleton />}>
              <BreadcrumbsSlot />
            </Suspense>
          </header>
          <div className="mx-auto flex w-full max-w-[112rem] flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

async function SwitcherSlot() {
  const { teams } = await shellData();
  return <TeamSwitcher teams={teams} />;
}

async function NavSlot() {
  const { teams, user } = await shellData();
  return <SidebarNav teams={teams} isSuperadmin={user.isSuperadmin} />;
}

async function AccountSlot() {
  const { user } = await shellData();
  return <UserMenu user={{ name: user.name, email: user.email, image: user.image, isSuperadmin: user.isSuperadmin }} />;
}

async function BreadcrumbsSlot() {
  const { teams } = await shellData();
  return <AppBreadcrumbs teams={teams} />;
}
