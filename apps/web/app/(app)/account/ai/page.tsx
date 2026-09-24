import type { Metadata } from 'next';
import { TriangleAlert } from 'lucide-react';
import { Suspense } from 'react';
import { TestMcpConnection } from '@/components/account/test-mcp-connection';
import { Alert, AlertDescription, AlertTitle } from '@miguelfranken/ui/components/alert';
import { Skeleton } from '@miguelfranken/ui/components/skeleton';
import { PageHeader } from '@miguelfranken/ui/patterns/page-header';
import { AiAssistants } from '@miguelfranken/ui/views/account/ai-assistants';
import { requireUser } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { listAccessibleProjects } from '@/lib/auth/principal';
import { mcpEnabledByEnv } from '@/lib/mcp/config';
import { getMcpSetting } from '@/lib/mcp/instance';

export const metadata: Metadata = { title: 'AI assistants' };

export default function AiAssistantsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="AI assistants"
        description="Let Claude, Cursor, Copilot and other assistants read your test results over MCP, so they can debug failures with you."
      />
      <Suspense fallback={<AiAssistantsSkeleton />}>
        <AiAssistantsContent />
      </Suspense>
    </div>
  );
}

function AiAssistantsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      {[220, 420].map((h, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ height: h }} />
      ))}
    </div>
  );
}

async function AiAssistantsContent() {
  const user = await requireUser();
  const [projects, setting] = await Promise.all([listAccessibleProjects({ user, grant: null }), getMcpSetting()]);
  const byEnv = mcpEnabledByEnv();

  return (
    <>
      {!byEnv || !setting.enabled ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>The MCP server is switched off</AlertTitle>
          <AlertDescription>
            {byEnv
              ? 'An administrator turned it off for this instance. You can prepare the setup now; assistants connect once it is back on.'
              : 'MCP_ENABLED=false is set in the server environment. Assistants cannot connect until it is removed.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <AiAssistants
        baseUrl={baseUrl()}
        projects={projects.map((p) => {
          const ref = `${p.team.slug}/${p.project.slug}`;
          return { value: ref, label: p.project.name === p.project.slug ? ref : `${ref} · ${p.project.name}` };
        })}
        tokensHref="/account"
        testConnection={<TestMcpConnection />}
      />
    </>
  );
}
