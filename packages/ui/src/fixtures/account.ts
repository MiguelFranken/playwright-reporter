import type { AccessScopeOption } from '../lib/access-scope';
import type { ConnectedAppRow } from '../views/account/connected-apps';
import type { PersonalTokenRow } from '../views/account/access-tokens';
import type { ProfileTeam } from '../views/account/profile-details';

export const SCOPE_TEAMS: AccessScopeOption[] = [
  { value: 'team-acme', label: 'Acme' },
  { value: 'team-platform', label: 'Platform' },
];

export const SCOPE_PROJECTS: AccessScopeOption[] = [
  { value: 'project-web', label: 'acme/web' },
  { value: 'project-checkout', label: 'acme/checkout' },
  { value: 'project-ds', label: 'platform/design-system' },
];

export const PERSONAL_TOKENS: PersonalTokenRow[] = [
  {
    id: 'pat-1',
    name: 'Claude Code on my laptop',
    tokenPrefix: 'pwr_pat_7Hq2',
    access: 'All my teams',
    createdAt: '12 days ago',
    createdAtTitle: 'Sep 6, 2026, 10:12 AM',
    expiresAt: 'in 78 days',
    expiresAtTitle: 'Dec 5, 2026, 10:12 AM',
    lastUsedAt: '3 hours ago',
    lastUsedAtTitle: 'Sep 18, 2026, 6:00 AM',
    status: 'active',
  },
  {
    id: 'pat-2',
    name: 'Cursor',
    tokenPrefix: 'pwr_pat_Zk91',
    access: 'acme/web',
    createdAt: '2 days ago',
    createdAtTitle: 'Sep 16, 2026, 2:40 PM',
    expiresAt: 'in 28 days',
    expiresAtTitle: 'Oct 16, 2026, 2:40 PM',
    lastUsedAt: null,
    lastUsedAtTitle: null,
    status: 'active',
  },
  {
    id: 'pat-3',
    name: 'CI experiment',
    tokenPrefix: 'pwr_pat_b0Ae',
    access: 'Team Platform',
    createdAt: '4 months ago',
    createdAtTitle: 'May 2, 2026, 9:00 AM',
    expiresAt: '1 month ago',
    expiresAtTitle: 'Aug 1, 2026, 9:00 AM',
    lastUsedAt: '2 months ago',
    lastUsedAtTitle: 'Jul 20, 2026, 4:30 PM',
    status: 'expired',
  },
  {
    id: 'pat-4',
    name: 'Old VS Code setup',
    tokenPrefix: 'pwr_pat_Qe3x',
    access: 'All my teams',
    createdAt: '3 months ago',
    createdAtTitle: 'Jun 11, 2026, 11:15 AM',
    expiresAt: 'in 1 month',
    expiresAtTitle: 'Oct 20, 2026, 11:15 AM',
    lastUsedAt: '1 month ago',
    lastUsedAtTitle: 'Aug 14, 2026, 3:10 PM',
    status: 'revoked',
  },
];

/** The superadmin overview: the same rows, each naming its owner. */
export const ALL_PERSONAL_TOKENS: PersonalTokenRow[] = PERSONAL_TOKENS.map((t, i) => ({
  ...t,
  owner: ['ada@acme.test', 'grace@acme.test', 'linus@platform.test', 'ada@acme.test'][i],
}));

export const CREATED_TOKEN = {
  name: 'Claude Code on my laptop',
  token: 'pwr_pat_7Hq2mXc4R9tYvB1nLk8sWd3fGz6pJe0uAoQi5hNlTyVr',
};

export const CONNECTED_APPS: ConnectedAppRow[] = [
  {
    id: 'grant-1',
    clientName: 'Claude',
    clientHost: 'claude.ai',
    access: 'All my teams',
    connectedAt: '5 days ago',
    connectedAtTitle: 'Sep 13, 2026, 8:20 AM',
    lastUsedAt: '12 minutes ago',
  },
  {
    id: 'grant-2',
    clientName: 'ChatGPT',
    clientHost: 'chatgpt.com',
    access: 'acme/checkout',
    connectedAt: '1 month ago',
    connectedAtTitle: 'Aug 10, 2026, 1:05 PM',
    lastUsedAt: null,
  },
  {
    id: 'grant-3',
    clientName: 'Internal release assistant with a rather long self-registered name',
    clientHost: null,
    access: 'Team Platform',
    connectedAt: '2 weeks ago',
    connectedAtTitle: 'Sep 4, 2026, 4:45 PM',
    lastUsedAt: '1 day ago',
  },
];

export const PROFILE_TEAMS: ProfileTeam[] = [
  { id: 'team-acme', name: 'Acme', role: 'owner', href: '/teams/acme' },
  { id: 'team-platform', name: 'Platform', role: 'member', href: '/teams/platform' },
];

/** `team/project` refs, as "Test connection" reports them. */
export const REACHABLE_PROJECTS = ['acme/web', 'acme/checkout', 'acme/admin', 'platform/design-system', 'platform/api', 'platform/docs', 'labs/prototype'];
