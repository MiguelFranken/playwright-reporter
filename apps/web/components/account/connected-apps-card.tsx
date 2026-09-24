'use client';

import { PlugZap } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@miguelfranken/ui/components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { revokeConnectedApp } from '@/app/(app)/account/oauth-actions';

export interface ConnectedAppRow {
  id: string;
  clientName: string;
  /** Host of the client's website or metadata URL, when known. */
  clientHost: string | null;
  access: string;
  connectedAt: string; // pre-formatted
  connectedAtTitle: string;
  lastUsedAt: string | null;
}

/** Applications connected over OAuth (claude.ai, ChatGPT, …), each revocable on its own. */
export function ConnectedAppsCard({ apps }: { apps: ConnectedAppRow[] }) {
  if (apps.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
        <PlugZap className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">No connected apps</p>
        <p className="text-xs text-muted-foreground">Add this server as a connector in claude.ai or ChatGPT; you approve the connection here.</p>
      </div>
    );
  }
  return (
    <div className="panel overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Application</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="w-[110px] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((app) => (
            <ConnectedAppRowView key={app.id} app={app} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConnectedAppRowView({ app }: { app: ConnectedAppRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <TableRow>
      <TableCell className="font-medium">
        {app.clientName}
        {app.clientHost ? <span className="ml-1.5 text-xs text-muted-foreground">{app.clientHost}</span> : null}
      </TableCell>
      <TableCell className="text-xs">{app.access}</TableCell>
      <TableCell className="text-xs tabular-nums" title={app.connectedAtTitle}>
        {app.connectedAt}
      </TableCell>
      <TableCell className="text-xs tabular-nums">{app.lastUsedAt ?? <span className="text-muted-foreground">never</span>}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="xs"
          className="text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Disconnect ${app.clientName}? It loses access immediately.`)) return;
            startTransition(async () => {
              const res = await revokeConnectedApp(app.id);
              if (res.ok) toast.success('Disconnected');
              else toast.error(res.message);
            });
          }}
        >
          {pending ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
