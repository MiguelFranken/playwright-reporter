import { TEAM_AVATAR, USER_AVATAR } from './avatars';
import type { AdminTeamRow } from '../views/admin/admin-teams';
import type { AdminUserRow } from '../views/admin/admin-users';
import type { TokenRow } from '../views/settings/api-tokens';
import type { InvitationRow, MemberRow } from '../views/teams/team-members';
import type { ProjectRow } from '../views/teams/team-projects';
import type { SidebarTeam, SidebarUser } from '../lib/nav';

export const MEMBERS: MemberRow[] = [
  { userId: 'u-ada', name: 'Ada Lovelace', email: 'ada@acme.test', image: USER_AVATAR, role: 'admin', instanceRole: 'superadmin', banned: false, joinedAt: 'Mar 2, 2026' },
  { userId: 'u-grace', name: 'Grace Hopper', email: 'grace@acme.test', image: null, role: 'member', instanceRole: 'user', banned: false, joinedAt: 'Apr 18, 2026' },
  { userId: 'u-linus', name: 'Linus Torvalds', email: 'linus@acme.test', image: null, role: 'viewer', instanceRole: 'user', banned: true, joinedAt: 'Jun 9, 2026' },
];

export const INVITATIONS: InvitationRow[] = [
  { id: 'inv-1', email: 'margaret@acme.test', role: 'member', expiresAt: 'Sep 25, 2026', invitedBy: 'Ada Lovelace' },
  { id: 'inv-2', email: 'dennis@contractor.test', role: 'viewer', expiresAt: 'Sep 21, 2026', invitedBy: null },
];

export const INVITATION_LINK = { email: 'margaret@acme.test', url: 'https://reporter.acme.test/invite/7c1f0a9e2b4d4f58a3e6b1c9d0f2a4b6' };

export const TEAM_PROJECTS: ProjectRow[] = [
  { id: 'p-web', slug: 'web', name: 'Web shop', runCounter: 482, createdAt: 'Mar 2, 2026' },
  { id: 'p-checkout', slug: 'checkout', name: 'Checkout', runCounter: 131, createdAt: 'May 11, 2026' },
  { id: 'p-admin', slug: 'admin', name: 'Back office', runCounter: 0, createdAt: 'Sep 17, 2026' },
];

export const ADMIN_USERS: AdminUserRow[] = [
  { id: 'u-ada', name: 'Ada Lovelace', email: 'ada@acme.test', role: 'superadmin', banned: false, banReason: null, teamCount: 2, createdAt: 'Mar 2, 2026' },
  { id: 'u-grace', name: 'Grace Hopper', email: 'grace@acme.test', role: 'user', banned: false, banReason: null, teamCount: 1, createdAt: 'Apr 18, 2026' },
  { id: 'u-linus', name: 'Linus Torvalds', email: 'linus@acme.test', role: 'user', banned: true, banReason: 'Shared their password', teamCount: 1, createdAt: 'Jun 9, 2026' },
];

export const ADMIN_TEAMS: AdminTeamRow[] = [
  { id: 't-acme', slug: 'acme', name: 'Acme', memberCount: 12, projectCount: 3, createdAt: 'Mar 2, 2026' },
  { id: 't-platform', slug: 'platform', name: 'Platform', memberCount: 4, projectCount: 5, createdAt: 'Apr 1, 2026' },
  { id: 't-labs', slug: 'labs', name: 'Labs', memberCount: 1, projectCount: 0, createdAt: 'Sep 12, 2026' },
];

export const API_TOKENS: TokenRow[] = [
  { id: 'tok-1', name: 'GitHub Actions', tokenPrefix: 'pwr_live_9f2c', createdAt: '3 months ago', createdAtTitle: 'Jun 14, 2026, 10:00 AM', lastUsedAt: '12 minutes ago', lastUsedAtTitle: 'Sep 18, 2026, 8:48 AM', revokedAt: null, revokedAtTitle: null },
  { id: 'tok-2', name: "Miguel's laptop", tokenPrefix: 'pwr_live_1a7e', createdAt: '2 weeks ago', createdAtTitle: 'Sep 4, 2026, 3:12 PM', lastUsedAt: null, lastUsedAtTitle: null, revokedAt: null, revokedAtTitle: null },
  { id: 'tok-3', name: 'Old Jenkins', tokenPrefix: 'pwr_live_c04b', createdAt: '6 months ago', createdAtTitle: 'Mar 20, 2026, 9:30 AM', lastUsedAt: '2 months ago', lastUsedAtTitle: 'Jul 2, 2026, 4:00 AM', revokedAt: '1 month ago', revokedAtTitle: 'Aug 11, 2026, 11:20 AM' },
];

export const CREATED_API_TOKEN = { name: 'GitHub Actions', token: 'pwr_live_9f2c8a41b6d3e7f0a2c5b8d1e4f7a0c3b6d9e2f5' };

export const SIDEBAR_TEAMS: SidebarTeam[] = [
  {
    slug: 'acme',
    name: 'Acme',
    image: TEAM_AVATAR,
    canManage: true,
    projects: [
      { slug: 'web', name: 'Web shop' },
      { slug: 'checkout', name: 'Checkout' },
    ],
  },
  { slug: 'platform', name: 'Platform', image: null, canManage: false, projects: [{ slug: 'api', name: 'API' }] },
];

export const SIDEBAR_USER: SidebarUser = { name: 'Ada Lovelace', email: 'ada@acme.test', image: USER_AVATAR, isSuperadmin: true };
