'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { parseAccessScope } from '@miguelfranken/ui/lib/access-scope';
import {
  AccessTokens,
  PersonalTokensTable as PersonalTokensTableView,
  type CreatedToken,
  type CreateTokenValues,
  type PersonalTokenRow,
  type TokenScopeOption,
} from '@miguelfranken/ui/views/account/access-tokens';
import { createPersonalToken, revokePersonalToken, type CreatePersonalTokenInput } from '@/app/(app)/account/token-actions';

/** Binds the design system's access-token view to the token server actions. */
export function AccessTokensCard({
  tokens,
  teams,
  projects,
  isSuperadmin,
  defaultDays,
  maxDays,
}: {
  tokens: PersonalTokenRow[];
  teams: TokenScopeOption[];
  projects: TokenScopeOption[];
  isSuperadmin: boolean;
  defaultDays: number;
  maxDays: number;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [creating, startCreate] = useTransition();
  const { revokingId, revoke } = useRevokeToken();

  const create = ({ name, expiresInDays, scope }: CreateTokenValues) =>
    startCreate(async () => {
      const parsed = parseAccessScope(scope);
      const restriction: CreatePersonalTokenInput['restriction'] =
        parsed.kind === 'team' || parsed.kind === 'project' ? parsed : { kind: 'all' };
      const res = await createPersonalToken({ name, expiresInDays, restriction, allTeams: parsed.kind === 'superadmin' });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setCreateOpen(false);
      setCreated({ token: res.token, name: res.name });
    });

  return (
    <AccessTokens
      tokens={tokens}
      teams={teams}
      projects={projects}
      isSuperadmin={isSuperadmin}
      defaultDays={defaultDays}
      maxDays={maxDays}
      setupHref="/account/ai"
      createOpen={createOpen}
      onCreateOpenChange={setCreateOpen}
      creating={creating}
      onCreate={create}
      created={created}
      onCreatedDismiss={() => setCreated(null)}
      onRevoke={revoke}
      revokingId={revokingId}
    />
  );
}

/** The superadmin overview's table, with the same revoke action. */
export function PersonalTokensTable({ tokens }: { tokens: PersonalTokenRow[] }) {
  const { revokingId, revoke } = useRevokeToken();
  return <PersonalTokensTableView tokens={tokens} onRevoke={revoke} revokingId={revokingId} />;
}

function useRevokeToken() {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const revoke = (token: PersonalTokenRow) => {
    if (!window.confirm(`Revoke token "${token.name}"? Assistants using it stop working immediately.`)) return;
    setRevokingId(token.id);
    startTransition(async () => {
      const res = await revokePersonalToken(token.id);
      setRevokingId(null);
      if (res.ok) toast.success('Token revoked');
      else toast.error(res.message);
    });
  };
  return { revokingId, revoke };
}
