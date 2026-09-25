import { PlugZap } from 'lucide-react';
import { Button } from '../../components/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { EmptyState } from '../../patterns/empty-state';

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

export interface ConnectedAppsProps {
  apps: ConnectedAppRow[];
  onDisconnect: (app: ConnectedAppRow) => void;
  /** The row whose disconnection is in flight. */
  disconnectingId?: string | null;
}

/** Applications connected over OAuth (claude.ai, ChatGPT, …), each revocable on its own. */
export function ConnectedApps({ apps, onDisconnect, disconnectingId }: ConnectedAppsProps) {
  if (apps.length === 0) {
    return (
      <EmptyState
        icon={PlugZap}
        title="No connected apps"
        description="Add this server as a connector in claude.ai or ChatGPT; you approve the connection here."
        className="py-8"
      />
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
            <TableHead className="w-[110px] text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((app) => {
            const pending = disconnectingId === app.id;
            return (
              <TableRow key={app.id}>
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
                    onClick={() => onDisconnect(app)}
                  >
                    {pending ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
