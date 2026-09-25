'use client';

import { usePathname } from 'next/navigation';
import { activeTeam } from '@miguelfranken/ui/lib/nav';

export { activeTeam, isActivePath, type SidebarProject, type SidebarTeam, type SidebarUser } from '@miguelfranken/ui/lib/nav';

/** The team the current URL points at; see `activeTeam`. */
export function useActiveTeam<T extends { slug: string }>(teams: T[]): T | null {
  return activeTeam(usePathname(), teams);
}
