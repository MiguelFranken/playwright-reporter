'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { McpServerSwitch } from '@miguelfranken/ui/views/admin/mcp-server-switch';
import { setMcpEnabled } from '@/app/(app)/admin/mcp/actions';

/** The instance switch, saved optimistically. */
export function McpSettingsCard({ enabled, forcedOffByEnv }: { enabled: boolean; forcedOffByEnv: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  const toggle = (next: boolean) =>
    startTransition(async () => {
      setOptimistic(next);
      const res = await setMcpEnabled(next);
      if (res.ok) toast.success(next ? 'MCP server switched on' : 'MCP server switched off');
      else toast.error(res.message);
    });

  return <McpServerSwitch checked={optimistic} forcedOffByEnv={forcedOffByEnv} pending={pending} onCheckedChange={toggle} />;
}
