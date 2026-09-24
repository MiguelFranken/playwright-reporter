'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@repo/ui/components/alert';
import { Badge } from '@repo/ui/components/badge';
import { Button } from '@repo/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/dialog';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/table';
import { CopyButton } from '@repo/ui/patterns/copy-button';
import { createToken, revokeToken } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

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

export function TokensCard({ teamSlug, projectSlug, tokens }: { teamSlug: string; projectSlug: string; tokens: TokenRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await createToken(teamSlug, projectSlug, name);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setCreateOpen(false);
      setName('');
      setCreated({ token: res.token, name: res.name });
    });
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Tokens authenticate the reporter against this project. The secret is shown once, when the token is generated.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            Generate token
          </Button>
        </div>
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
            <KeyRound className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No API tokens</p>
            <p className="text-xs text-muted-foreground">Generate a token and set it as PW_REPORTER_TOKEN in your Playwright project.</p>
          </div>
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
                  <TableHead className="w-[90px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TokenRowView key={t.id} teamSlug={teamSlug} projectSlug={projectSlug} token={t} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
            <Button onClick={submit} disabled={pending}>
              {pending ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(open) => (!open ? setCreated(null) : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription>
              Copy the token for <span className="font-medium text-foreground">{created?.name}</span> now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 break-all text-code-s">{created.token}</code>
                <CopyButton value={created.token} label="Copy token" successMessage="Token copied" />
              </div>
              <Alert>
                <KeyRound />
                <AlertTitle>Set it in your Playwright project</AlertTitle>
                <AlertDescription>
                  <code className="text-code-s">PW_REPORTER_TOKEN={created.token.slice(0, 10)}…</code>
                </AlertDescription>
              </Alert>
            </>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TokenRowView({ teamSlug, projectSlug, token }: { teamSlug: string; projectSlug: string; token: TokenRow }) {
  const [pending, startTransition] = useTransition();
  const revoked = token.revokedAt !== null;
  return (
    <TableRow className={revoked ? 'text-muted-foreground' : undefined}>
      <TableCell className="font-medium">{token.name}</TableCell>
      <TableCell className="text-code-s">{token.tokenPrefix}…</TableCell>
      <TableCell className="text-xs tabular-nums" title={token.createdAtTitle}>
        {token.createdAt}
      </TableCell>
      <TableCell className="text-xs tabular-nums" title={token.lastUsedAtTitle ?? undefined}>
        {token.lastUsedAt ?? <span className="text-muted-foreground">never</span>}
      </TableCell>
      <TableCell>
        {revoked ? (
          <Badge variant="outline" title={token.revokedAtTitle ?? undefined}>
            Revoked {token.revokedAt}
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
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Revoke token "${token.name}"? Reporters using it will stop working immediately.`)) return;
              startTransition(async () => {
                const res = await revokeToken(teamSlug, projectSlug, token.id);
                if (res.ok) toast.success('Token revoked');
                else toast.error(res.message ?? 'Could not revoke token');
              });
            }}
          >
            {pending ? 'Revoking…' : 'Revoke'}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
