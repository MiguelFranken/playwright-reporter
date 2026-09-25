import { CircleAlert, CircleCheck, PlugZap } from 'lucide-react';
import { Button } from '../../components/button';

/** What "Test connection" found, as the app's server action reports it. */
export type McpConnectionResult =
  | { ok: false; message: string }
  | {
      ok: true;
      /** The environment kill switch and the admin switch both allow the server. */
      enabled: boolean;
      disabledBy: 'environment' | 'admin' | null;
      /** `team/project` refs an assistant signed in as the viewer can reach. */
      projects: string[];
    };

const PREVIEW = 5;

export interface McpConnectionTestProps {
  pending?: boolean;
  /** `null` until the first test has run. */
  result: McpConnectionResult | null;
  onTest: () => void;
}

/**
 * The "Test connection" button and its verdict: whether the server is on, and
 * which projects an assistant signed in as the viewer would reach. Rendered
 * into the `testConnection` slot of `AiAssistants`.
 */
export function McpConnectionTest({ pending = false, result, onTest }: McpConnectionTestProps) {
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={onTest}>
        <PlugZap data-icon="inline-start" />
        {pending ? 'Testing…' : 'Test connection'}
      </Button>
      <p role="status" className="flex min-w-0 items-start gap-1.5 text-body-s">
        {result ? <ResultText result={result} /> : null}
      </p>
    </>
  );
}

function ResultText({ result }: { result: McpConnectionResult }) {
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
