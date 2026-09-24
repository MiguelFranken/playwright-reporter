'use client';

import {
  Building2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  FlaskConical,
  Folder,
  GitBranch,
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
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ThemeToggle } from '@miguelfranken/ui/patterns/theme-toggle';
import { Button } from '@miguelfranken/ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@miguelfranken/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@miguelfranken/ui/components/dropdown-menu';
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
} from '@miguelfranken/ui/components/sidebar';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { authClient } from '@/lib/auth/client';
import { isActivePath, useActiveTeam, type SidebarTeam, type SidebarUser } from '@/components/nav-model';
import { ProfileAvatar } from '@/components/profile-avatar';
import { cn } from '@miguelfranken/ui/lib/cn';

export type { SidebarProject, SidebarTeam, SidebarUser } from '@/components/nav-model';

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
  { segment: 'settings', title: 'Settings', icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { title: 'Overview', href: '/admin', icon: LayoutDashboard, exact: true },
  { title: 'Teams', href: '/admin/teams', icon: Building2 },
  { title: 'Users', href: '/admin/users', icon: Users },
  { title: 'Audit log', href: '/admin/audit', icon: ScrollText },
];

/**
 * One navigation tree for the whole product: projects, workspace and — for a
 * superadmin — the instance section, all as sibling groups. Administration
 * expands in place like a project rather than swapping the sidebar out.
 */
export function SidebarNav({ teams, isSuperadmin }: { teams: SidebarTeam[]; isSuperadmin: boolean }) {
  const team = useActiveTeam(teams);
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
              <NavLink href={teamBase} title="Overview" icon={Users} exact />
              {team?.canManage ? (
                <NavLink
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
              <NavSection icon={Shield} title="Administration" href="/admin" section="/admin" items={ADMIN_NAV} />
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
  icon: Icon,
  title,
  href,
  section,
  items,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  section: string;
  items: NavItem[];
}) {
  const pathname = usePathname();
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
  href,
  section,
  title,
  icon: Icon,
  exact,
}: {
  href: string;
  section?: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
}) {
  const pathname = usePathname();
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

export function TeamSwitcher({ teams }: { teams: SidebarTeam[] }) {
  const team = useActiveTeam(teams);
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

export function UserMenu({ user }: { user: SidebarUser }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
        <div className="flex items-center justify-between gap-2 rounded-md py-1 pe-1 ps-2 text-sm">
          <span className="text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await authClient.signOut();
              router.push('/login');
              router.refresh();
            })
          }
        >
          <LogOut className="opacity-60" />
          {pending ? 'Signing out…' : 'Sign out'}
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

/** A plain button for pages without a sidebar (invitation, empty states). */
export function PlainSignOutButton({ next = '/login' }: { next?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.push(next);
          router.refresh();
        })
      }
    >
      <LogOut data-icon="inline-start" />
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
