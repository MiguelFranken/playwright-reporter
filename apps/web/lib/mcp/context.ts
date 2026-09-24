/**
 * Everything a tool handler may use about the caller: who they are, what the
 * connection asked for, and helpers that resolve references *through the
 * access layer*. A handler never touches a project id it did not get from
 * `ctx.project()`.
 */
import { randomUUID } from 'node:crypto';
import type { Permission } from '@/lib/auth/permissions';
import {
  listAccessibleProjects,
  resolveProjectByIdFor,
  resolveProjectFor,
  type AccessibleProject,
  type Principal,
  type ProjectAccess,
} from '@/lib/auth/principal';
import { signArtifactPath } from '@/lib/auth/artifact-url';
import { baseUrl } from '@/lib/auth/config';
import { latestRunPerRepo } from '@/lib/db/queries/mcp';
import { artifactUrlTtlSeconds, defaultToolsets, parseToolsets, responseBudgetChars, type Toolset } from './config';
import { ToolError, invalid, notFound } from './errors';
import { isUuid, parseAppUrl } from './params';
import { projectLinks, type ProjectLinks } from './render/links';

export interface ConnectionOptions {
  /** `team/project` from `?project=` or `X-PW-Reporter-Project`. */
  defaultProject: string | null;
  toolsets: Toolset[];
  /** Git remote of the caller's checkout (`X-PW-Reporter-Repo`, sent by the stdio bridge). */
  repo: string | null;
}

export function connectionOptions(request: Request | undefined): ConnectionOptions {
  const url = request ? new URL(request.url) : null;
  const header = (name: string) => request?.headers.get(name)?.trim() || null;
  const requested = url?.searchParams.get('toolsets') ?? header('x-pw-reporter-toolsets');
  const allowed = defaultToolsets();
  const toolsets = requested ? parseToolsets(requested).filter((t) => allowed.includes(t)) : allowed;
  return {
    defaultProject: url?.searchParams.get('project')?.trim() || header('x-pw-reporter-project'),
    toolsets: toolsets.length ? toolsets : allowed,
    repo: header('x-pw-reporter-repo'),
  };
}

export type ProjectResolvedBy = 'argument' | 'token' | 'connection' | 'repository' | 'only-project';

export interface ResolvedProject extends ProjectAccess {
  links: ProjectLinks;
  /** "team/project", the form every answer uses. */
  ref: string;
  resolvedBy: ProjectResolvedBy;
}

export interface Credential {
  name: string | null;
  prefix: string | null;
  expiresAt: Date | null;
}

export interface ToolContext {
  principal: Principal;
  credential: Credential;
  connection: ConnectionOptions;
  era: 'legacy' | 'modern';
  requestId: string;
  budget: number;
  signal?: AbortSignal;
  /** Resolves (and authorizes) the project a call is about. Throws a ToolError. */
  project(ref: string | undefined, permission?: Permission): Promise<ResolvedProject>;
  /** The connection's default project without failing, for discovery. */
  defaultProject(): Promise<ResolvedProject | null>;
  accessibleProjects(): Promise<AccessibleProject[]>;
  /** An absolute, short-lived link to an attachment. Only for callers with `artifact:read`. */
  artifactUrl(attachmentId: string): string;
}

export function createToolContext(init: {
  principal: Principal;
  credential?: Credential;
  connection: ConnectionOptions;
  era: 'legacy' | 'modern';
  signal?: AbortSignal;
}): ToolContext {
  let accessible: Promise<AccessibleProject[]> | null = null;
  const accessibleProjects = () => (accessible ??= listAccessibleProjects(init.principal));

  const finish = (access: ProjectAccess, resolvedBy: ProjectResolvedBy): ResolvedProject => ({
    ...access,
    links: projectLinks(access.team.slug, access.project.slug),
    ref: `${access.team.slug}/${access.project.slug}`,
    resolvedBy,
  });

  async function byRef(ref: string): Promise<ProjectAccess | null> {
    const value = ref.trim();
    if (isUuid(value)) return resolveProjectByIdFor(init.principal, value.toLowerCase());
    const url = parseAppUrl(value);
    if (url) return resolveProjectFor(init.principal, url.teamSlug, url.projectSlug);
    const parts = value.split('/').filter(Boolean);
    if (parts.length !== 2) {
      throw invalid(`"${ref}" is not a project reference. Use "team/project" (e.g. "acme/web"), a project id or a project URL.`, 'Call whoami for the projects you can read.');
    }
    return resolveProjectFor(init.principal, parts[0], parts[1]);
  }

  async function fallback(): Promise<ResolvedProject | null> {
    const grant = init.principal.grant;
    if (grant?.projectId) {
      const access = await resolveProjectByIdFor(init.principal, grant.projectId);
      if (access) return finish(access, 'token');
    }
    if (init.connection.defaultProject) {
      const access = await byRef(init.connection.defaultProject);
      if (access) return finish(access, 'connection');
    }
    const projects = await accessibleProjects();
    if (init.connection.repo && projects.length) {
      const match = await matchRepository(init.connection.repo, projects);
      if (match) {
        const access = await resolveProjectByIdFor(init.principal, match);
        if (access) return finish(access, 'repository');
      }
    }
    if (projects.length === 1) {
      const access = await resolveProjectByIdFor(init.principal, projects[0].project.id);
      if (access) return finish(access, 'only-project');
    }
    return null;
  }

  return {
    principal: init.principal,
    credential: init.credential ?? { name: null, prefix: null, expiresAt: null },
    connection: init.connection,
    era: init.era,
    requestId: randomUUID(),
    budget: responseBudgetChars(),
    signal: init.signal,
    accessibleProjects,
    defaultProject: fallback,
    async project(ref, permission = { run: ['read'] }) {
      let resolved: ResolvedProject | null;
      if (ref && ref.trim()) {
        const access = await byRef(ref);
        resolved = access ? finish(access, 'argument') : null;
        if (!resolved) throw notFound(`Project "${ref}" not found, or you cannot read it.`, 'Call whoami for the projects you can read.');
      } else {
        resolved = await fallback();
        if (!resolved) {
          const projects = await accessibleProjects();
          const listed = projects.slice(0, 20).map((p) => `${p.team.slug}/${p.project.slug}`);
          throw new ToolError(
            'PROJECT_REQUIRED',
            projects.length ? 'Which project? Pass "project" as "team/project".' : 'This token cannot read any project.',
            projects.length ? `Projects you can read: ${listed.join(', ')}${projects.length > 20 ? ', …' : ''}.` : 'Ask a team admin to add you to a team.',
            { projects: listed },
          );
        }
      }
      if (!resolved.can(permission)) throw notFound(`Project "${resolved.ref}" not found, or you cannot read it.`);
      return resolved;
    },
    artifactUrl(attachmentId) {
      return `${baseUrl()}${signArtifactPath(attachmentId, artifactUrlTtlSeconds())}`;
    },
  };
}

/** `git@github.com:Acme/App.git`, `https://github.com/acme/app` → `github.com/acme/app`. */
export function normalizeRepoUrl(url: string): string {
  return url
    .trim()
    .replace(/^git\+/, '')
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^[^@/]+@/, '')
    .replace(/^([^/:]+):(?!\d)/, '$1/')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

/** The accessible project whose latest run came from this repository. */
async function matchRepository(repo: string, projects: AccessibleProject[]): Promise<string | null> {
  const wanted = normalizeRepoUrl(repo);
  const rows = await latestRunPerRepo(projects.map((p) => p.project.id));
  const match = rows.filter((r) => r.repoUrl && normalizeRepoUrl(r.repoUrl) === wanted).sort((a, b) => b.lastRunAt.getTime() - a.lastRunAt.getTime())[0];
  return match?.projectId ?? null;
}

export function newRequestId() {
  return randomUUID();
}
