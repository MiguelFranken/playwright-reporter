'use client';

import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';
import { setMcpEnabled } from '@/app/(app)/admin/mcp/actions';
import { cn } from '@miguelfranken/ui/lib/cn';

/**
 * The instance switch. When `MCP_ENABLED=false` forces the server off, the
 * switch shows "off" and is disabled — the saved setting is irrelevant until
 * the environment allows the server again, so letting it flip would only
 * mislead.
 */
export function McpSettingsCard({ enabled, forcedOffByEnv }: { enabled: boolean; forcedOffByEnv: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const checked = forcedOffByEnv ? false : optimistic;

  const toggle = () =>
    startTransition(async () => {
      const next = !optimistic;
      setOptimistic(next);
      const res = await setMcpEnabled(next);
      if (res.ok) toast.success(next ? 'MCP server switched on' : 'MCP server switched off');
      else toast.error(res.message);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span id="mcp-enabled-label" className="text-label-m">
            Allow AI assistants to connect
          </span>
          <span id="mcp-enabled-description" className="text-body-s text-muted-foreground">
            {forcedOffByEnv
              ? 'MCP_ENABLED=false is set in the server environment, which overrides this switch.'
              : 'Switching off rejects every MCP request at once. Tokens stay valid for when it is back on.'}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="mcp-enabled-label"
          aria-describedby="mcp-enabled-description"
          disabled={forcedOffByEnv || pending}
          onClick={toggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors duration-150 outline-none',
            'focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-primary' : 'bg-input',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'inline-block size-5 rounded-full bg-background shadow-xs transition-[translate] duration-150',
              checked ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
    </div>
  );
}
