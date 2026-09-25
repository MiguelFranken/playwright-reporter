'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/alert';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { EmptyState } from '../../patterns/empty-state';
import { TokenRevealDialog, type RevealedToken } from '../../patterns/token-reveal-dialog';

export interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string; // pre-formatted
  createdAtTitle: string;
  lastUsedAt: string | null;
  lastUsedAtTitle: string | null;
  revokedAt: string | null;
  revokedAtTitle: string | null;
}

export interface ApiTokensProps {
  tokens: TokenRow[];
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  creating?: boolean;
  onCreate: (name: string) => void;
  /** The token just minted; the dialog showing it stays open until dismissed. */
  created: RevealedToken | null;
  onCreatedDismiss: () => void;
  onRevoke: (token: TokenRow) => void;
  /** The row whose revocation is in flight. */
  revokingId?: string | null;
}

/** Project settings → API tokens: the tokens the reporter authenticates with. */
export function ApiTokens({
  tokens,
  createOpen,
  onCreateOpenChange,
  creating = false,
  onCreate,
  created,
  onCreatedDismiss,
  onRevoke,
  revokingId,
}: ApiTokensProps) {
  const [name, setName] = useState('');
  const [wasOpen, setWasOpen] = useState(createOpen);
  if (wasOpen !== createOpen) {
    setWasOpen(createOpen);
    if (!createOpen) setName('');
  }
  const submit = () => {
    if (!creating) onCreate(name);
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Tokens authenticate the reporter against this project. The secret is shown once, when the token is generated.
          </p>
          <Button size="sm" onClick={() => onCreateOpenChange(true)}>
            <Plus data-icon="inline-start" />
            Generate token
          </Button>
        </div>
        {tokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API tokens"
            description="Generate a token and set it as PW_REPORTER_TOKEN in your Playwright project."
            className="py-8"
          />
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[90px] text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => {
                  const revoked = t.revokedAt !== null;
                  const revoking = revokingId === t.id;
                  return (
                    <TableRow key={t.id} className={revoked ? 'text-muted-foreground' : undefined}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-code-s">{t.tokenPrefix}…</TableCell>
                      <TableCell className="text-xs tabular-nums" title={t.createdAtTitle}>
                        {t.createdAt}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" title={t.lastUsedAtTitle ?? undefined}>
                        {t.lastUsedAt ?? <span className="text-muted-foreground">never</span>}
                      </TableCell>
                      <TableCell>
                        {revoked ? (
                          <Badge variant="outline" title={t.revokedAtTitle ?? undefined}>
                            Revoked {t.revokedAt}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-success-border bg-success-subtle text-success-text">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!revoked ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:text-destructive"
                            disabled={revoking}
                            onClick={() => onRevoke(t)}
                          >
                            {revoking ? 'Revoking…' : 'Revoke'}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API token</DialogTitle>
            <DialogDescription>Give the token a name so you can tell where it is used, e.g. "GitHub Actions" or "Miguel's laptop".</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Label htmlFor="token-name">Name</Label>
            <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Reporter token" maxLength={80} autoFocus />
          </form>
          <DialogFooter showCloseButton>
            <Button onClick={submit} disabled={creating}>
              {creating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TokenRevealDialog created={created} onDismiss={onCreatedDismiss}>
        {created ? (
          <Alert>
            <KeyRound />
            <AlertTitle>Set it in your Playwright project</AlertTitle>
            <AlertDescription>
              <code className="text-code-s">PW_REPORTER_TOKEN={created.token.slice(0, 10)}…</code>
            </AlertDescription>
          </Alert>
        ) : null}
      </TokenRevealDialog>
    </>
  );
}
