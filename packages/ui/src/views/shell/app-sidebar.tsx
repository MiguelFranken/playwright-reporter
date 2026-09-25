'use client';

import {
  Bot,
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Database,
  FlaskConical,
  Folder,
  GitBranch,
  GitPullRequest,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Play,
  ScrollText,
  Settings,
  Shield,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '../../components/sidebar';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../lib/cn';
import { activeTeam, isActivePath, type SidebarTeam, type SidebarUser } from '../../lib/nav';
import { ProfileAvatar } from '../../patterns/profile-avatar';
import { ThemeMenuItem } from '../../patterns/theme-toggle';
import { Link } from '../../provider';

export type { SidebarProject, SidebarTeam, SidebarUser } from '../../lib/nav';

/**
 * The sidebar frame. Everything here is static chrome, so it paints with the
 * shell; the `switcher`, `nav` and `account` slots are streamed in separately.
 */
export function AppSidebar({
  switcher,
  nav,
  account,
}: {
  switcher: React.ReactNode;
  nav: React.ReactNode;
  account: React.ReactNode;
}) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pb-1">
        <SidebarMenu>
          <SidebarMenuItem>{switcher}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-1">{nav}</SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>{account}</SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation                                                                  */
/* -------------------------------------------------------------------------- */

type NavItem = { title: string; href: string; icon: LucideIcon; exact?: boolean };

const PROJECT_NAV = [
  { segment: 'dashboard', title: 'Dashboard', icon: LayoutDashboard },
  { segment: 'runs', title: 'Test Runs', icon: Play },
  { segment: 'tests', title: 'Test Explorer', icon: ListChecks },
  { segment: 'branches', title: 'Branches', icon: GitBranch },
  { segment: 'pull-requests', title: 'Pull requests', icon: GitPullRequest },
  { segment: 'settings', title: 'Settings', icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { title: 'Overview', href: '/admin', icon: LayoutDashboard, exact: true },
  { title: 'Teams', href: '/admin/teams', icon: Building2 },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Storage', href: '/admin/storage', icon: HardDrive },
  { title: 'Database', href: '/admin/database', icon: Database },
  { title: 'MCP', href: '/admin/mcp', icon: Bot },
  { title: 'Audit log', href: '/admin/audit', icon: ScrollText },
];

/**
 * One navigation tree for the whole product: projects, workspace and — for a
 * superadmin — the instance section, all as sibling groups. Administration
 * expands in place like a project rather than swapping the sidebar out.
 */
export function SidebarNav({ teams, isSuperadmin, pathname }: { teams: SidebarTeam[]; isSuperadmin: boolean; pathname: string }) {
  const team = activeTeam(pathname, teams);
  const teamBase = team ? `/teams/${team.slug}` : null;

  return (
    <>
      {team && teamBase && team.projects.length > 0 ? (
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {team.projects.map((p) => {
                const base = `${teamBase}/projects/${p.slug}`;
                return (
                  <NavSection
                    key={p.slug}
                    pathname={pathname}
                    icon={Folder}
                    title={p.name}
                    href={`${base}/dashboard`}
                    section={base}
                    items={PROJECT_NAV.map((i) => ({ title: i.title, icon: i.icon, href: `${base}/${i.segment}` }))}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {teamBase ? (
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavLink pathname={pathname} href={teamBase} title="Overview" icon={Users} exact />
              {team?.canManage ? (
                <NavLink
                  pathname={pathname}
                  href={`${teamBase}/settings/members`}
                  section={`${teamBase}/settings`}
                  title="Team settings"
                  icon={UserCog}
                />
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}

      {isSuperadmin ? (
        <SidebarGroup>
          <SidebarGroupLabel>Instance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <NavSection pathname={pathname} icon={Shield} title="Administration" href="/admin" section="/admin" items={ADMIN_NAV} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  );
}

/**
 * A top-level entry that owns a sub-menu — a project, or Administration.
 *
 * The section it points at is open whenever the URL is inside it, and the
 * chevron toggles it by hand; a navigation into or out of the section wins over
 * a manual toggle, so the tree always reflects where you are.
 */
function NavSection({
  pathname,
  icon: Icon,
  title,
  href,
  section,
  items,
}: {
  pathname: string;
  icon: LucideIcon;
  title: string;
  href: string;
  section: string;
  items: NavItem[];
}) {
  const closeOnMobile = useCloseOnMobile();
  const inSection = isActivePath(pathname, section);

  const [open, setOpen] = useState(inSection);
  const [lastInSection, setLastInSection] = useState(inSection);
  if (lastInSection !== inSection) {
    setLastInSection(inSection);
    setOpen(inSection);
  }

  const activeItem = items.find((i) => isActivePath(pathname, i.href, i.exact));

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<SidebarMenuItem />}>
      <SidebarMenuButton
        isActive={inSection && !activeItem}
        tooltip={title}
        onClick={closeOnMobile}
        render={<Link href={href} />}
      >
        <Icon />
        <span className="truncate font-medium">{title}</span>
      </SidebarMenuButton>
      <CollapsibleTrigger
        render={
          <SidebarMenuAction aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}>
            <ChevronRight
              aria-hidden
              className={cn(
                'size-3.5 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
                open && 'rotate-90',
              )}
            />
          </SidebarMenuAction>
        }
      />
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-ending-style:h-0 data-starting-style:h-0">
        <SidebarMenuSub>
          {items.map((item) => (
            <SidebarMenuSubItem key={item.href}>
              <SidebarMenuSubButton
                isActive={item === activeItem}
                onClick={closeOnMobile}
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A top-level entry with no sub-menu. */
function NavLink({
  pathname,
  href,
  section,
  title,
  icon: Icon,
  exact,
}: {
  pathname: string;
  href: string;
  section?: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
}) {
  const closeOnMobile = useCloseOnMobile();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActivePath(pathname, section ?? href, exact)}
        tooltip={title}
        onClick={closeOnMobile}
        render={<Link href={href} />}
      >
        <Icon />
        <span>{title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** On a phone the sidebar is a sheet over the page; following a link closes it. */
function useCloseOnMobile() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}

export function SidebarNavSkeleton() {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2 p-2 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-7 w-[85%] self-end" />
        <Skeleton className="h-7 w-[85%] self-end" />
        <Skeleton className="h-7 w-[85%] self-end" />
        <Skeleton className="mt-3 h-3 w-20" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/* -------------------------------------------------------------------------- */
/* Workspace switcher                                                          */
/* -------------------------------------------------------------------------- */

function BrandMark() {
  return (
    <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <FlaskConical className="size-4" />
    </span>
  );
}

/** Team images arrive vetted by the host. */
export function TeamSwitcher({ teams, pathname }: { teams: SidebarTeam[]; pathname: string }) {
  const team = activeTeam(pathname, teams);
  const label = (
    <>
      {team?.image ? <ProfileAvatar name={team.name} image={team.image} shape="square" /> : <BrandMark />}
      <span className="grid flex-1 text-left leading-tight">
        <span className="truncate text-sm font-semibold">{team?.name ?? 'Playwright Reporter'}</span>
        <span className="truncate text-xs text-sidebar-foreground/70">{team ? 'Playwright Reporter' : 'All teams'}</span>
      </span>
    </>
  );

  if (teams.length <= 1 && team) {
    return (
      <SidebarMenuButton size="lg" tooltip={team.name} render={<Link href={`/teams/${team.slug}`} />}>
        {label}
      </SidebarMenuButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg" tooltip={team?.name ?? 'Switch team'}>
            {label}
            <ChevronsUpDown className="ms-auto size-4 opacity-60 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="w-(--anchor-width) min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Teams</DropdownMenuLabel>
          {teams.map((t) => (
            <DropdownMenuItem key={t.slug} render={<Link href={`/teams/${t.slug}`} />}>
              {t.image ? (
                <ProfileAvatar name={t.name} image={t.image} shape="square" size="sm" className="size-4" />
              ) : (
                <Building2 className="opacity-60" />
              )}
              <span className="truncate">{t.name}</span>
              {t.slug === team?.slug ? <Check className="ms-auto size-4 text-accent-text" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TeamSwitcherSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2 p-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Account                                                                     */
/* -------------------------------------------------------------------------- */

/** The account menu. The user's image arrives vetted by the host; signing out is the host's job. */
export function UserMenu({ user, signingOut = false, onSignOut }: { user: SidebarUser; signingOut?: boolean; onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg" tooltip={user.email}>
            <ProfileAvatar
              name={user.name || user.email}
              image={user.image}
              shape="square"
              fallbackClassName="bg-accent-subtle text-eyebrow text-accent-text"
            />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/70">{user.email}</span>
            </span>
            <ChevronsUpDown className="ms-auto size-4 opacity-60 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-(--anchor-width) min-w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserRound className="opacity-60" />
          Account
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/ai" />}>
          <Bot className="opacity-60" />
          AI assistants
        </DropdownMenuItem>
        <ThemeMenuItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onClick={onSignOut}>
          <LogOut className="opacity-60" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex h-12 items-center gap-2 p-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="flex flex-1 flex-col gap-1.5 group-data-[collapsible=icon]:hidden">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}
