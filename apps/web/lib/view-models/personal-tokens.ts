import { formatDateTime, formatRelative } from '@miguelfranken/ui/lib/format';
import type { PersonalTokenRow } from '@miguelfranken/ui/views/account/access-tokens';
import type { PersonalTokenListRow } from '@/lib/db/queries/personal-tokens';

/** The list row the token tables render, with every date pre-formatted on the server. */
export function toPersonalTokenRow(
  t: PersonalTokenListRow & { userName?: string | null; userEmail?: string },
  teamNames: ReadonlyMap<string, string>,
  now = new Date(),
): PersonalTokenRow {
  return {
    id: t.id,
    name: t.name,
    tokenPrefix: t.tokenPrefix,
    access: describeAccess(t, teamNames),
    createdAt: formatRelative(t.createdAt),
    createdAtTitle: formatDateTime(t.createdAt),
    expiresAt: formatRelative(t.expiresAt, { now }),
    expiresAtTitle: formatDateTime(t.expiresAt),
    lastUsedAt: t.lastUsedAt ? formatRelative(t.lastUsedAt) : null,
    lastUsedAtTitle: t.lastUsedAt ? formatDateTime(t.lastUsedAt) : null,
    status: t.revokedAt ? 'revoked' : t.expiresAt <= now ? 'expired' : 'active',
    owner: t.userEmail ? t.userName || t.userEmail : undefined,
  };
}

export function describeAccess(
  t: Pick<PersonalTokenListRow, 'projectId' | 'projectSlug' | 'projectTeamSlug' | 'teamIds' | 'allTeams'>,
  teamNames: ReadonlyMap<string, string>,
): string {
  if (t.projectId) return t.projectSlug ? `${t.projectTeamSlug}/${t.projectSlug}` : 'Deleted project';
  if (t.teamIds?.length) return t.teamIds.map((id) => teamNames.get(id) ?? 'Deleted team').join(', ');
  return t.allTeams ? 'Every team (superadmin)' : 'All my teams';
}
