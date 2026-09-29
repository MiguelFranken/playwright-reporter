'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { activeTeam, serializeWorkspace, workspaceFromPath, type Workspace } from '@miguelfranken/ui/lib/nav';
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from '@/lib/workspace-cookie';

export {
  activeTeam,
  isActivePath,
  type SidebarProject,
  type SidebarTeam,
  type SidebarUser,
  type Workspace,
} from '@miguelfranken/ui/lib/nav';

/** The team the current URL points at; see `activeTeam`. */
export function useActiveTeam<T extends { slug: string }>(teams: T[]): T | null {
  return activeTeam(usePathname(), teams);
}

/**
 * The team and project last visited, which the chrome keeps showing off team
 * routes. `initial` is the cookie as the shell read it on the first request;
 * the shell stays mounted from then on, so every later team route updates this
 * state — and the cookie, for the next full load.
 */
export function useLastWorkspace(initial: Workspace | null): Workspace | null {
  const here = workspaceFromPath(usePathname());
  const [last, setLast] = useState(initial);
  if (here && (here.team !== last?.team || here.project !== last?.project)) setLast(here);

  const value = last ? serializeWorkspace(last) : null;
  useEffect(() => {
    if (value) document.cookie = `${WORKSPACE_COOKIE}=${value}; path=/; max-age=${WORKSPACE_COOKIE_MAX_AGE}; samesite=lax`;
  }, [value]);

  return last;
}
