'use client';

import { KeyRound } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@miguelfranken/ui/components/alert';
import { Button } from '@miguelfranken/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@miguelfranken/ui/components/card';
import { Label } from '@miguelfranken/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@miguelfranken/ui/components/select';
import { approveConnection, denyConnection } from '@/app/connect/mcp/actions';

interface Option {
  value: string;
  label: string;
}

/**
 * What the user sees before an assistant gets access: who is asking, where
 * the browser goes back to, and a choice of how much it may read.
 */
export function ConsentForm(props: {
  request: string;
  clientName: string;
  clientUri: string | null;
  verified: boolean;
  redirectHost: string;
  userLabel: string;
  scopes: string[];
  teams: Option[];
  projects: Option[];
  isSuperadmin: boolean;
}) {
  const [access, setAccess] = useState('all');
  const [pending, startTransition] = useTransition();
  const items = [
    { value: 'all', label: 'All teams I belong to' },
    ...(props.isSuperadmin ? [{ value: 'superadmin', label: 'Every team (superadmin)' }] : []),
    ...props.teams.map((t) => ({ value: `team:${t.value}`, label: `Team: ${t.label}` })),
    ...props.projects.map((p) => ({ value: `project:${p.value}`, label: `Project: ${p.label}` })),
  ];

  const submit = (action: typeof approveConnection) => {
    const form = new FormData();
    form.set('request', props.request);
    form.set('access', access);
    startTransition(async () => {
      const result = await action(form);
      if (result && !result.ok) toast.error(result.message);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allow {props.clientName} to read your test results?</CardTitle>
        <CardDescription>
          Signed in as {props.userLabel}. After you allow it, your browser returns to <span className="font-medium text-foreground">{props.redirectHost}</span>.
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
        {!props.verified ? (
          <Alert>
            <KeyRound />
            <AlertDescription>
              {props.clientName} registered itself with this server. Only continue if you started this connection from that application.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" disabled={pending} onClick={() => submit(denyConnection)}>
          Deny
        </Button>
        <Button disabled={pending} onClick={() => submit(approveConnection)}>
          {pending ? 'Connecting…' : 'Allow'}
        </Button>
      </CardFooter>
    </Card>
  );
}
