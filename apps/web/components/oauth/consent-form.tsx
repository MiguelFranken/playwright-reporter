'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { ConsentCard } from '@miguelfranken/ui/views/connect/consent-card';
import { approveConnection, denyConnection } from '@/app/connect/mcp/actions';

interface Option {
  value: string;
  label: string;
}

/** Binds the consent card to the approve and deny actions, which redirect back to the client. */
export function ConsentForm(props: {
  request: string;
  clientName: string;
  verified: boolean;
  redirectHost: string;
  userLabel: string;
  teams: Option[];
  projects: Option[];
  isSuperadmin: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const submit = (action: typeof approveConnection) => (access: string) => {
    const form = new FormData();
    form.set('request', props.request);
    form.set('access', access);
    startTransition(async () => {
      const result = await action(form);
      if (result && !result.ok) toast.error(result.message);
    });
  };

  return (
    <ConsentCard
      clientName={props.clientName}
      verified={props.verified}
      redirectHost={props.redirectHost}
      userLabel={props.userLabel}
      teams={props.teams}
      projects={props.projects}
      isSuperadmin={props.isSuperadmin}
      pending={pending}
      onAllow={submit(approveConnection)}
      onDeny={submit(denyConnection)}
    />
  );
}
