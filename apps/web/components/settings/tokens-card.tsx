'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { RevealedToken } from '@miguelfranken/ui/patterns/token-reveal-dialog';
import { ApiTokens, type TokenRow } from '@miguelfranken/ui/views/settings/api-tokens';
import { createToken, revokeToken } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

export type { TokenRow } from '@miguelfranken/ui/views/settings/api-tokens';

/** Binds the project's API tokens to the create and revoke actions. */
export function TokensCard({ teamSlug, projectSlug, tokens }: { teamSlug: string; projectSlug: string; tokens: TokenRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<RevealedToken | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [, startTransition] = useTransition();

  return (
    <ApiTokens
      tokens={tokens}
      createOpen={createOpen}
      onCreateOpenChange={setCreateOpen}
      creating={creating}
      onCreate={(name) =>
        startCreate(async () => {
          const res = await createToken(teamSlug, projectSlug, name);
          if (!res.ok) {
            toast.error(res.message);
            return;
          }
          setCreateOpen(false);
          setCreated({ token: res.token, name: res.name });
        })
      }
      created={created}
      onCreatedDismiss={() => setCreated(null)}
      onRevoke={(token) => {
        if (!window.confirm(`Revoke token "${token.name}"? Reporters using it will stop working immediately.`)) return;
        setRevokingId(token.id);
        startTransition(async () => {
          const res = await revokeToken(teamSlug, projectSlug, token.id);
          setRevokingId(null);
          if (res.ok) toast.success('Token revoked');
          else toast.error(res.message ?? 'Could not revoke token');
        });
      }}
      revokingId={revokingId}
    />
  );
}
