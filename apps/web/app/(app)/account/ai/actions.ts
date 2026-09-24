'use server';

import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { baseUrl } from '@/lib/auth/config';
import { listAccessibleProjects } from '@/lib/auth/principal';
import { mcpEnabledByEnv } from '@/lib/mcp/config';
import { getMcpSetting } from '@/lib/mcp/instance';

export interface McpConnectionSummary {
  ok: true;
  /** Whether the server answers at all: the environment kill switch and the admin switch both have to allow it. */
  enabled: boolean;
  /** Why it does not, when it does not. */
  disabledBy: 'environment' | 'admin' | null;
  /** `team/project` refs an assistant signed in as this user can reach, newest activity first. */
  projects: string[];
  url: string;
}

/**
 * "Test connection" on Account → AI assistants. It answers from the session
 * rather than calling `/api/mcp` over HTTP: the page has no token to send, and
 * what the user needs to know — is the server on, and which projects will the
 * assistant see — is decided by the same switch and the same access query the
 * MCP server's `whoami` uses. A token restriction can only narrow this list.
 */
export async function testMcpConnection(): Promise<McpConnectionSummary | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');

  const [setting, projects] = await Promise.all([getMcpSetting(), listAccessibleProjects({ user, grant: null })]);
  const byEnv = mcpEnabledByEnv();
  return {
    ok: true,
    enabled: byEnv && setting.enabled,
    disabledBy: !byEnv ? 'environment' : !setting.enabled ? 'admin' : null,
    projects: projects.map((p) => `${p.team.slug}/${p.project.slug}`),
    url: `${baseUrl()}/api/mcp`,
  };
}
