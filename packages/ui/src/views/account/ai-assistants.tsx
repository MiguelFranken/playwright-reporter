'use client';

import { ExternalLink, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/badge';
import { buttonVariants } from '../../components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/tabs';
import { MCP_TOKEN_PLACEHOLDER, mcpClientSetups, mcpUrl, type McpClientId, type McpClientSetup } from '../../lib/mcp-setup';
import { CopyButton } from '../../patterns/copy-button';
import { Link } from '../../provider';

export interface AiAssistantProjectOption {
  /** `team/project`, the ref the server resolves. */
  value: string;
  label: string;
}

export interface AiAssistantsProps {
  /** Public origin of this instance; every snippet is pre-filled with it. */
  baseUrl: string;
  /** Projects the viewer can read. Empty is fine: the assistant then asks, or finds none. */
  projects: AiAssistantProjectOption[];
  /** Project pre-selected in the picker; `null` means "any project". */
  defaultProject?: string | null;
  defaultClient?: McpClientId;
  /** A freshly minted token to embed; otherwise snippets carry the placeholder. */
  token?: string | null;
  /** Where the viewer creates tokens. The link is omitted when absent. */
  tokensHref?: string;
  /**
   * The app's "Test connection" control. A slot rather than a callback: it
   * calls a Server Action, which the design system must not know about.
   */
  testConnection?: React.ReactNode;
}

/** Select sentinel for "no pinned project" — Base UI treats `null` as "nothing selected". */
const ANY_PROJECT = '__any__';

const CAPABILITIES = [
  'Find recent runs of a project or branch, and what failed in them.',
  'Explain a failed or flaky result: the error, the steps, every retry and its artifacts.',
  'Look up a test’s history and how flaky it has been.',
  'Rank the least healthy tests in a project.',
];

/**
 * Account → AI assistants: ready-to-copy MCP setup for each client, pre-filled
 * with this instance's URL and the chosen project. Picking a project rewrites
 * every snippet and install link at once, because they are all derived from the
 * same three inputs by `lib/mcp-setup`.
 */
export function AiAssistants({
  baseUrl,
  projects,
  defaultProject = null,
  defaultClient = 'claude-code',
  token,
  tokensHref,
  testConnection,
}: AiAssistantsProps) {
  const [project, setProject] = useState<string>(defaultProject ?? ANY_PROJECT);
  const [client, setClient] = useState<McpClientId>(defaultClient);
  const projectRef = project === ANY_PROJECT ? null : project;
  const setups = mcpClientSetups({ baseUrl, projectRef, token });
  const items = [{ value: ANY_PROJECT, label: 'Any project (ask each time)' }, ...projects];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>What your assistant can do</CardTitle>
          <CardDescription>
            Connected over MCP, an assistant reads test results as you: never more than you can see, and never changes anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body-s">
            {CAPABILITIES.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-col gap-1.5">
            <p className="text-label-s text-muted-foreground">Server URL</p>
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 py-1 pr-1 pl-3">
              <code className="min-w-0 flex-1 truncate text-code-s">{mcpUrl({ baseUrl, projectRef })}</code>
              <CopyButton value={mcpUrl({ baseUrl, projectRef })} label="Copy server URL" successMessage="Server URL copied" />
            </div>
          </div>
          {testConnection ? <div className="flex flex-wrap items-center gap-3">{testConnection}</div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connect a client</CardTitle>
          <CardDescription>Pick a default project, then copy the configuration for your assistant.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span id="ai-assistants-project" className="text-label-m">
              Default project
            </span>
            <Select items={items} value={project} onValueChange={(next) => setProject(next == null ? ANY_PROJECT : String(next))}>
              <SelectTrigger className="w-full sm:w-80" aria-labelledby="ai-assistants-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-body-xs text-muted-foreground">
              {projects.length === 0
                ? 'You cannot see any project yet. Once a team adds you, the assistant finds its projects on its own.'
                : 'Pinning one saves the assistant a question. It can still reach every project you can see.'}
            </p>
          </div>

          {token ? null : (
            <p className="flex items-start gap-2 text-body-s text-muted-foreground">
              <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Replace <code className="rounded bg-muted px-1 py-0.5 text-code-s">{MCP_TOKEN_PLACEHOLDER}</code> with a personal access token
                {tokensHref ? (
                  <>
                    {' '}
                    from{' '}
                    <Link href={tokensHref} className="text-accent-text underline underline-offset-2">
                      Access tokens
                    </Link>
                  </>
                ) : null}
                . Keep it out of version control.
              </span>
            </p>
          )}

          <Tabs value={client} onValueChange={(next) => setClient(next as McpClientId)}>
            <TabsList variant="line" aria-label="Client" className="overflow-x-auto">
              {setups.map((s) => (
                <TabsTrigger key={s.id} value={s.id}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {setups.map((s) => (
              <TabsContent key={s.id} value={s.id} className="pt-3">
                <ClientSetup setup={s} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ClientSetup({ setup }: { setup: McpClientSetup }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {setup.status === 'coming-soon' ? <Badge variant="secondary">Coming soon</Badge> : null}
        <p className="text-body-s text-muted-foreground">{setup.note}</p>
      </div>
      {setup.installLink ? (
        // A plain anchor, not a Button: it navigates (to the client's URL scheme), so it must read as a link.
        <a href={setup.installLink.href} className={buttonVariants({ size: 'sm', variant: 'outline', className: 'self-start' })}>
          <ExternalLink data-icon="inline-start" />
          {setup.installLink.label}
        </a>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-code-s text-muted-foreground">{setup.location}</p>
          <CopyButton value={setup.snippet} label={`Copy ${setup.label} configuration`} successMessage="Configuration copied" />
        </div>
        <pre
          tabIndex={0}
          className="overflow-x-auto rounded-md border bg-muted/50 p-3 text-code-s focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <code>{setup.snippet}</code>
        </pre>
      </div>
    </div>
  );
}
