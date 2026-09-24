'use client';

import { KeyRound, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@miguelfranken/ui/components/alert';
import { Badge } from '@miguelfranken/ui/components/badge';
import { Button } from '@miguelfranken/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@miguelfranken/ui/components/dialog';
import { Input } from '@miguelfranken/ui/components/input';
import { Label } from '@miguelfranken/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@miguelfranken/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@miguelfranken/ui/components/table';
import { CopyButton } from '@miguelfranken/ui/patterns/copy-button';
import { createPersonalToken, revokePersonalToken, type CreatePersonalTokenInput } from '@/app/(app)/account/token-actions';

export interface PersonalTokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  /** Human summary of the restriction, e.g. "All my teams" or "acme/web". */
  access: string;
  createdAt: string; // pre-formatted
  createdAtTitle: string;
  expiresAt: string;
  expiresAtTitle: string;
  lastUsedAt: string | null;
  lastUsedAtTitle: string | null;
  status: 'active' | 'expired' | 'revoked';
  /** Only on the superadmin overview. */
  owner?: string;
}

export interface TokenScopeOption {
  value: string;
  label: string;
}

const EXPIRY_CHOICES = [7, 30, 60, 90, 180, 365];

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
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Tokens let AI assistants read test results as you, through the MCP server. They never see more than you do.{' '}
            <Link href="/account/ai" className="underline underline-offset-2">
              Set up an assistant
            </Link>
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus data-icon="inline-start" />
            Generate token
          </Button>
        </div>
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
            <KeyRound className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No access tokens</p>
            <p className="text-xs text-muted-foreground">Generate one to connect Claude Code, Cursor, VS Code or another MCP client.</p>
          </div>
        ) : (
          <PersonalTokensTable tokens={tokens} />
        )}
      </div>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        teams={teams}
        projects={projects}
        isSuperadmin={isSuperadmin}
        defaultDays={defaultDays}
        maxDays={maxDays}
        onCreated={(result) => {
          setCreateOpen(false);
          setCreated(result);
        }}
      />

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
                <AlertTitle>Next: connect your assistant</AlertTitle>
                <AlertDescription>
                  <Link href="/account/ai" className="underline underline-offset-2">
                    AI assistants
                  </Link>{' '}
                  has ready-made configuration for each client. Keep the token out of version control.
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

function CreateTokenDialog({
  open,
  onOpenChange,
  teams,
  projects,
  isSuperadmin,
  defaultDays,
  maxDays,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: TokenScopeOption[];
  projects: TokenScopeOption[];
  isSuperadmin: boolean;
  defaultDays: number;
  maxDays: number;
  onCreated: (result: { token: string; name: string }) => void;
}) {
  const [name, setName] = useState('');
  const [days, setDays] = useState(String(defaultDays));
  const [scope, setScope] = useState('all');
  const [pending, startTransition] = useTransition();

  const expiryItems = [...new Set([...EXPIRY_CHOICES.filter((d) => d <= maxDays), defaultDays])]
    .sort((a, b) => a - b)
    .map((d) => ({ value: String(d), label: `${d} days` }));
  const scopeItems = [
    { value: 'all', label: 'All teams I belong to' },
    ...(isSuperadmin ? [{ value: 'superadmin', label: 'Every team (superadmin)' }] : []),
    ...teams.map((t) => ({ value: `team:${t.value}`, label: `Team: ${t.label}` })),
    ...projects.map((p) => ({ value: `project:${p.value}`, label: `Project: ${p.label}` })),
  ];

  const submit = () => {
    const restriction: CreatePersonalTokenInput['restriction'] = scope.startsWith('team:')
      ? { kind: 'team', teamId: scope.slice(5) }
      : scope.startsWith('project:')
        ? { kind: 'project', projectId: scope.slice(8) }
        : { kind: 'all' };
    startTransition(async () => {
      const res = await createPersonalToken({ name, expiresInDays: Number(days), restriction, allTeams: scope === 'superadmin' });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setName('');
      setScope('all');
      setDays(String(defaultDays));
      onCreated({ token: res.token, name: res.name });
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate access token</DialogTitle>
          <DialogDescription>Name it after where it is used, e.g. "Claude Code on my laptop". Tokens are read-only.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="pat-name">Name</Label>
            <Input id="pat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code" maxLength={60} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Access</Label>
            <Select items={scopeItems} value={scope} onValueChange={(v) => setScope(String(v))}>
              <SelectTrigger aria-label="Access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Expires after</Label>
            <Select items={expiryItems} value={days} onValueChange={(v) => setDays(String(v))}>
              <SelectTrigger aria-label="Expires after">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {expiryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter showCloseButton>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Generating…' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PersonalTokensTable({ tokens }: { tokens: PersonalTokenRow[] }) {
  const showOwner = tokens.some((t) => t.owner);
  return (
    <div className="panel overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            {showOwner ? <TableHead>Owner</TableHead> : null}
            <TableHead>Token</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[90px] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((t) => (
            <PersonalTokenRowView key={t.id} token={t} showOwner={showOwner} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PersonalTokenRowView({ token, showOwner }: { token: PersonalTokenRow; showOwner: boolean }) {
  const [pending, startTransition] = useTransition();
  const active = token.status === 'active';
  return (
    <TableRow className={active ? undefined : 'text-muted-foreground'}>
      <TableCell className="font-medium" title={`Created ${token.createdAtTitle}`}>
        {token.name}
      </TableCell>
      {showOwner ? <TableCell className="text-muted-foreground">{token.owner}</TableCell> : null}
      <TableCell className="text-code-s">{token.tokenPrefix}…</TableCell>
      <TableCell className="text-xs">{token.access}</TableCell>
      <TableCell className="text-xs tabular-nums" title={token.lastUsedAtTitle ?? undefined}>
        {token.lastUsedAt ?? <span className="text-muted-foreground">never</span>}
      </TableCell>
      <TableCell className="text-xs tabular-nums" title={token.expiresAtTitle}>
        {token.expiresAt}
      </TableCell>
      <TableCell>
        {active ? (
          <Badge variant="outline" className="border-success-border bg-success-subtle text-success-text">
            Active
          </Badge>
        ) : (
          <Badge variant="outline">{token.status === 'revoked' ? 'Revoked' : 'Expired'}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {active ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Revoke token "${token.name}"? Assistants using it stop working immediately.`)) return;
              startTransition(async () => {
                const res = await revokePersonalToken(token.id);
                if (res.ok) toast.success('Token revoked');
                else toast.error(res.message);
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
