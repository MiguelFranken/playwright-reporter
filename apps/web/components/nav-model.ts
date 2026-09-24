'use client';

import { usePathname } from 'next/navigation';

export type SidebarProject = { slug: string; name: string };
export type SidebarTeam = { slug: string; name: string; image: string | null; canManage: boolean; projects: SidebarProject[] };
export type SidebarUser = { name: string; email: string; image: string | null; isSuperadmin: boolean };

/**
 * The chrome is rendered by one layout shared across every section, so it is
 * never re-rendered on navigation and cannot be handed the route's params.
 * Instead it gets every team the user may open and works out the active one
 * here, from the URL — which is why moving between teams, projects and
 * administration never re-streams the sidebar.
 *
 * Off a team route (`/admin`, `/account`) there is no slug to read, and the
 * first team stands in so the sidebar keeps its shape instead of collapsing to
 * an admin-only menu.
 */
export function activeTeam<T extends { slug: string }>(pathname: string, teams: T[]): T | null {
  const slug = pathname.startsWith('/teams/') ? pathname.split('/')[2] : undefined;
  return teams.find((t) => t.slug === slug) ?? teams[0] ?? null;
}

export function useActiveTeam<T extends { slug: string }>(teams: T[]): T | null {
  return activeTeam(usePathname(), teams);
}

/** `exact` matters for section roots like `/admin`, which every child extends. */
export function isActivePath(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
