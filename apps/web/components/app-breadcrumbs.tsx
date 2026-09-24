'use client';

import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { activeTeam, type SidebarTeam } from '@/components/nav-model';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@miguelfranken/ui/components/breadcrumb';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';

const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  runs: 'Test Runs',
  tests: 'Test Explorer',
  branches: 'Branches',
  settings: 'Settings',
  members: 'Members',
  general: 'General',
  projects: 'Projects',
  teams: 'Teams',
  users: 'Users',
  audit: 'Audit log',
  storage: 'Storage',
};

type Crumb = { label: string; href?: string };

/** Where in the product the current page sits — the page's own title lives in `PageHeader`. */
export function AppBreadcrumbs({ teams }: { teams: SidebarTeam[] }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname, teams);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap gap-1.5 sm:gap-2">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem className="min-w-0">
                {last || !crumb.href ? (
                  <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href} className="truncate">
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator className="shrink-0 opacity-60" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function BreadcrumbsSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-3.5 w-20" />
    </div>
  );
}

function buildCrumbs(pathname: string, teams: SidebarTeam[]): Crumb[] {
  if (pathname.startsWith('/admin')) {
    const rest = pathname.slice('/admin'.length).split('/').filter(Boolean);
    const crumbs: Crumb[] = [{ label: 'Administration', href: '/admin' }];
    if (rest[0]) crumbs.push({ label: SECTION_LABELS[rest[0]] ?? titleCase(rest[0]) });
    return crumbs;
  }

  if (pathname.startsWith('/account')) return [{ label: 'Account' }];

  const team = activeTeam(pathname, teams);
  if (!team) return [{ label: 'Teams' }];

  const teamBase = `/teams/${team.slug}`;
  const crumbs: Crumb[] = [{ label: team.name, href: teamBase }];
  const rest = pathname.startsWith(teamBase) ? pathname.slice(teamBase.length).split('/').filter(Boolean) : [];

  if (rest[0] === 'projects' && rest[1]) {
    const project = team.projects.find((p) => p.slug === rest[1]);
    const base = `${teamBase}/projects/${rest[1]}`;
    crumbs.push({ label: project?.name ?? rest[1], href: `${base}/dashboard` });
    if (rest[2]) crumbs.push({ label: SECTION_LABELS[rest[2]] ?? titleCase(rest[2]), href: `${base}/${rest[2]}` });
    if (rest[2] === 'branches' && rest[3]) crumbs.push({ label: rest.slice(3).map(decodeSegment).join('/') });
    else if (rest[3]) crumbs.push({ label: rest[2] === 'runs' ? `Run #${rest[3]}` : titleCase(rest[3]) });
  } else if (rest[0] === 'settings') {
    crumbs.push({ label: 'Team settings', href: `${teamBase}/settings/members` });
    if (rest[1]) crumbs.push({ label: SECTION_LABELS[rest[1]] ?? titleCase(rest[1]) });
  }

  return crumbs;
}

/** A branch name arrives encoded per segment (see `branchHref`); a malformed escape is shown as typed. */
function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ');
}
