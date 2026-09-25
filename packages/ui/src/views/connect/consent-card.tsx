'use client';

import { KeyRound, PlugZap, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '../../components/alert';
import { Button } from '../../components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../components/card';
import { Label } from '../../components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { accessScopeItems, DEFAULT_ACCESS_SCOPE, type AccessScopeOption } from '../../lib/access-scope';

export interface ConsentCardProps {
  clientName: string;
  /** The client proved who it is (a client ID metadata document) rather than registering itself. */
  verified: boolean;
  /** Where the browser returns to after the decision. */
  redirectHost: string;
  /** Who is signed in, e.g. `Ada Lovelace <ada@acme.test>`. */
  userLabel: string;
  teams: AccessScopeOption[];
  projects: AccessScopeOption[];
  isSuperadmin: boolean;
  pending?: boolean;
  /** Called with the chosen `accessScopeItems` value. */
  onAllow: (access: string) => void;
  onDeny: (access: string) => void;
}

/**
 * What the user sees before an assistant gets access: who is asking, where
 * the browser goes back to, and a choice of how much it may read.
 */
export function ConsentCard({
  clientName,
  verified,
  redirectHost,
  userLabel,
  teams,
  projects,
  isSuperadmin,
  pending = false,
  onAllow,
  onDeny,
}: ConsentCardProps) {
  const [access, setAccess] = useState(DEFAULT_ACCESS_SCOPE);
  const items = accessScopeItems({ teams, projects, isSuperadmin });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allow {clientName} to read your test results?</CardTitle>
        <CardDescription>
          Signed in as {userLabel}. After you allow it, your browser returns to <span className="font-medium text-foreground">{redirectHost}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          <li>Read runs, results, errors, flakiness and trends</li>
          <li>Open screenshots, traces and other artifacts</li>
          <li>Never more than you can see yourself, and nothing it can change</li>
        </ul>
        <div className="flex flex-col gap-2">
          <Label>Access</Label>
          <Select items={items} value={access} onValueChange={(v) => setAccess(String(v))}>
            <SelectTrigger aria-label="Access">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!verified ? (
          <Alert>
            <KeyRound />
            <AlertDescription>
              {clientName} registered itself with this server. Only continue if you started this connection from that application.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={() => onDeny(access)}>
          Deny
        </Button>
        <Button disabled={pending} onClick={() => onAllow(access)}>
          {pending ? 'Connecting…' : 'Allow'}
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The product mark above the consent card, so the user knows whose screen this is. */
export function ConnectBrand() {
  return (
    <div className="flex items-center justify-center gap-2 text-sm font-semibold">
      <PlugZap className="size-4" /> Playwright Reporter
    </div>
  );
}

/** A connection that cannot go ahead: an invalid request, or an account that may not connect. */
export function ConnectNotice({ title, description, icon = true }: { title: string; description: React.ReactNode; icon?: boolean }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        {icon ? (
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-muted">
            <ShieldAlert className="size-5 text-muted-foreground" />
          </div>
        ) : null}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
