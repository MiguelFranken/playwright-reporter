'use client';

import { KeyRound, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '../../components/alert';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { accessScopeItems, DEFAULT_ACCESS_SCOPE, type AccessScopeOption } from '../../lib/access-scope';
import { CopyButton } from '../../patterns/copy-button';
import { EmptyState } from '../../patterns/empty-state';
import { Link } from '../../provider';

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

export type TokenScopeOption = AccessScopeOption;

export interface CreateTokenValues {
  name: string;
  expiresInDays: number;
  /** An `accessScopeItems` value; `parseAccessScope` splits it. */
  scope: string;
}

export interface CreatedToken {
  /** The secret, shown exactly once. */
  token: string;
  name: string;
}

const EXPIRY_CHOICES = [7, 30, 60, 90, 180, 365];

export interface AccessTokensProps {
  tokens: PersonalTokenRow[];
  teams: TokenScopeOption[];
  projects: TokenScopeOption[];
  isSuperadmin: boolean;
  defaultDays: number;
  maxDays: number;
  /** Account → AI assistants, linked from the intro and the "created" dialog. */
  setupHref: string;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  creating?: boolean;
  onCreate: (values: CreateTokenValues) => void;
  /** The token just minted; the dialog showing it stays open until dismissed. */
  created: CreatedToken | null;
  onCreatedDismiss: () => void;
  onRevoke: (token: PersonalTokenRow) => void;
  /** The row whose revocation is in flight. */
  revokingId?: string | null;
}

/**
 * Account → Access tokens: the viewer's personal tokens, a dialog to mint one,
 * and a dialog that shows the secret once. Every dialog is controlled, so the
 * app decides when a creation succeeded.
 */
export function AccessTokens({
  tokens,
  teams,
  projects,
  isSuperadmin,
  defaultDays,
  maxDays,
  setupHref,
  createOpen,
  onCreateOpenChange,
  creating = false,
  onCreate,
  created,
  onCreatedDismiss,
  onRevoke,
  revokingId,
}: AccessTokensProps) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Tokens let AI assistants read test results as you, through the MCP server. They never see more than you do.{' '}
            <Link href={setupHref} className="underline underline-offset-2">
              Set up an assistant
            </Link>
          </p>
          <Button size="sm" onClick={() => onCreateOpenChange(true)}>
            <Plus data-icon="inline-start" />
            Generate token
          </Button>
        </div>
        {tokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No access tokens"
            description="Generate one to connect Claude Code, Cursor, VS Code or another MCP client."
            className="py-8"
          />
        ) : (
          <PersonalTokensTable tokens={tokens} onRevoke={onRevoke} revokingId={revokingId} />
        )}
      </div>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={onCreateOpenChange}
        teams={teams}
        projects={projects}
        isSuperadmin={isSuperadmin}
        defaultDays={defaultDays}
        maxDays={maxDays}
        pending={creating}
        onSubmit={onCreate}
      />

      <TokenCreatedDialog created={created} onDismiss={onCreatedDismiss} setupHref={setupHref} />
    </>
  );
}

export interface CreateTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: TokenScopeOption[];
  projects: TokenScopeOption[];
  isSuperadmin: boolean;
  defaultDays: number;
  maxDays: number;
  pending?: boolean;
  onSubmit: (values: CreateTokenValues) => void;
}

/** Name, access and lifetime of a new token. The fields reset whenever the dialog closes. */
export function CreateTokenDialog({
  open,
  onOpenChange,
  teams,
  projects,
  isSuperadmin,
  defaultDays,
  maxDays,
  pending = false,
  onSubmit,
}: CreateTokenDialogProps) {
  const [name, setName] = useState('');
  const [days, setDays] = useState(String(defaultDays));
  const [scope, setScope] = useState(DEFAULT_ACCESS_SCOPE);

  useEffect(() => {
    if (open) return;
    setName('');
    setScope(DEFAULT_ACCESS_SCOPE);
    setDays(String(defaultDays));
  }, [open, defaultDays]);

  const expiryItems = [...new Set([...EXPIRY_CHOICES.filter((d) => d <= maxDays), defaultDays])]
    .sort((a, b) => a - b)
    .map((d) => ({ value: String(d), label: `${d} days` }));
  const scopeItems = accessScopeItems({ teams, projects, isSuperadmin });

  const submit = () => {
    if (pending || !name.trim()) return;
    onSubmit({ name, expiresInDays: Number(days), scope });
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

/** Shows a new token's secret, the one time it can be seen. */
export function TokenCreatedDialog({ created, onDismiss, setupHref }: { created: CreatedToken | null; onDismiss: () => void; setupHref: string }) {
  return (
    <Dialog open={created !== null} onOpenChange={(open) => (!open ? onDismiss() : null)}>
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
                <Link href={setupHref} className="underline underline-offset-2">
                  AI assistants
                </Link>{' '}
                has ready-made configuration for each client. Keep the token out of version control.
              </AlertDescription>
            </Alert>
          </>
        ) : null}
        <DialogFooter>
          <Button onClick={onDismiss}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface PersonalTokensTableProps {
  tokens: PersonalTokenRow[];
  /** Omit for a read-only table: active rows then get no Revoke button. */
  onRevoke?: (token: PersonalTokenRow) => void;
  revokingId?: string | null;
}

/** Personal tokens, newest first. An owner column appears when any row names one (the superadmin overview). */
export function PersonalTokensTable({ tokens, onRevoke, revokingId }: PersonalTokensTableProps) {
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
            <TableHead className="w-[90px] text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tokens.map((t) => (
            <PersonalTokenRowView key={t.id} token={t} showOwner={showOwner} onRevoke={onRevoke} revoking={revokingId === t.id} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PersonalTokenRowView({
  token,
  showOwner,
  onRevoke,
  revoking,
}: {
  token: PersonalTokenRow;
  showOwner: boolean;
  onRevoke?: (token: PersonalTokenRow) => void;
  revoking: boolean;
}) {
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
        {active && onRevoke ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            disabled={revoking}
            onClick={() => onRevoke(token)}
          >
            {revoking ? 'Revoking…' : 'Revoke'}
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
