'use client';

import { CircleCheck, CircleAlert, PlugZap } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@miguelfranken/ui/components/button';
import { testMcpConnection, type McpConnectionSummary } from '@/app/(app)/account/ai/actions';

const PREVIEW = 5;

/**
 * The "Test connection" slot of the AI assistants view. It reports what an
 * assistant signed in as this user would find — whether the server is on, and
 * which projects it reaches — without the user having to paste a token first.
 */
export function TestMcpConnection() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<McpConnectionSummary | { ok: false; message: string } | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => setResult(await testMcpConnection()))}>
        <PlugZap data-icon="inline-start" />
        {pending ? 'Testing…' : 'Test connection'}
      </Button>
      <p role="status" className="flex min-w-0 items-start gap-1.5 text-body-s">
        {result ? <ResultText result={result} /> : null}
      </p>
    </>
  );
}

function ResultText({ result }: { result: McpConnectionSummary | { ok: false; message: string } }) {
  if (!result.ok) {
    return (
      <>
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span>{result.message}</span>
      </>
    );
  }
  if (!result.enabled) {
    return (
      <>
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span>
          The MCP server is switched off {result.disabledBy === 'environment' ? 'by the MCP_ENABLED environment variable' : 'by an administrator'}.
          Assistants cannot connect until it is back on.
        </span>
      </>
    );
  }
  const shown = result.projects.slice(0, PREVIEW).join(', ');
  const more = result.projects.length - PREVIEW;
  return (
    <>
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
      <span>
        The server is on.{' '}
        {result.projects.length === 0
          ? 'Your assistant will not see any project yet.'
          : `Your assistant can reach ${result.projects.length} project${result.projects.length === 1 ? '' : 's'}: ${shown}${more > 0 ? ` and ${more} more` : ''}.`}
      </span>
    </>
  );
}
