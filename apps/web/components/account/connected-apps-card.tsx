'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ConnectedApps, type ConnectedAppRow } from '@miguelfranken/ui/views/account/connected-apps';
import { revokeConnectedApp } from '@/app/(app)/account/oauth-actions';

/** Applications connected over OAuth (claude.ai, ChatGPT, …), each revocable on its own. */
export function ConnectedAppsCard({ apps }: { apps: ConnectedAppRow[] }) {
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const disconnect = (app: ConnectedAppRow) => {
    if (!window.confirm(`Disconnect ${app.clientName}? It loses access immediately.`)) return;
    setDisconnectingId(app.id);
    startTransition(async () => {
      const res = await revokeConnectedApp(app.id);
      setDisconnectingId(null);
      if (res.ok) toast.success('Disconnected');
      else toast.error(res.message);
    });
  };

  return <ConnectedApps apps={apps} onDisconnect={disconnect} disconnectingId={disconnectingId} />;
}
