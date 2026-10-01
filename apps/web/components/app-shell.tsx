import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { Suspense } from 'react';
import { AppBreadcrumbs, BreadcrumbsSkeleton } from '@/components/app-breadcrumbs';
import { AppDictationProvider, EnableDictation } from '@/components/dictation';
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
import { parseWorkspace } from '@miguelfranken/ui/lib/nav';
import { WORKSPACE_COOKIE } from '@/lib/workspace-cookie';
import { canDictate } from '@/lib/transcription/transcribe';
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
 * Off team routes there is no slug in the URL, so the nav and the switcher keep
 * the team and project last visited: tracked on the client while the shell is
 * mounted, and seeded from a cookie (`lib/workspace-cookie.ts`) for a page
 * loaded directly — so opening `/admin` never switches you to another team.
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

  const lastWorkspace = parseWorkspace((await cookies()).get(WORKSPACE_COOKIE)?.value);

  return { user, teams, lastWorkspace };
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
        {/* Clipped, not hidden: `overflow: hidden` makes the inset a scroll container, and nothing inside it (this
            header, the library's folder tree) could stick to the window any more. `--sticky-offset` is the header's
            height: what sticks below it starts there. */}
        <SidebarInset className="min-w-0 overflow-clip [--sticky-offset:3.5rem]">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2.5 border-b border-separator bg-surface/85 px-4 backdrop-blur-sm md:rounded-t-xl">
            <SidebarTrigger className="-ms-1.5" />
            <Suspense fallback={<BreadcrumbsSkeleton />}>
              <BreadcrumbsSlot />
            </Suspense>
          </header>
          <div className="mx-auto flex w-full max-w-[112rem] flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
            <AppDictationProvider>{children}</AppDictationProvider>
          </div>
          <Suspense fallback={null}>
            <DictationSlot />
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

async function SwitcherSlot() {
  const { teams, lastWorkspace } = await shellData();
  return <TeamSwitcher teams={teams} lastWorkspace={lastWorkspace} />;
}

async function NavSlot() {
  const { teams, user, lastWorkspace } = await shellData();
  return <SidebarNav teams={teams} isSuperadmin={user.isSuperadmin} lastWorkspace={lastWorkspace} />;
}

async function AccountSlot() {
  const { user } = await shellData();
  return <UserMenu user={{ name: user.name, email: user.email, image: user.image, isSuperadmin: user.isSuperadmin }} />;
}

/** Turns on the composers' microphone once the session is known, for whoever the deployment lets dictate. */
async function DictationSlot() {
  const { user } = await shellData();
  return canDictate(user) ? <EnableDictation /> : null;
}

async function BreadcrumbsSlot() {
  const { teams } = await shellData();
  return <AppBreadcrumbs teams={teams} />;
}
