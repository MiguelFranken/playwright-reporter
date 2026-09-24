import { z } from 'zod';
import { defineTool, output } from '../registry';
import { link, when } from '../render/markdown';
import { projectLinks } from '../render/links';

const input = z.object({});

const outputSchema = output({
  user: z.object({ name: z.string(), email: z.string(), superadmin: z.boolean() }),
  credential: z.object({
    kind: z.enum(['pat', 'oauth', 'session']),
    name: z.string().nullable(),
    prefix: z.string().nullable(),
    scopes: z.array(z.string()),
    expiresAt: z.string().nullable(),
    restrictions: z.object({ teams: z.array(z.string()).nullable(), project: z.string().nullable(), allTeams: z.boolean() }),
  }),
  defaultProject: z.object({ ref: z.string(), resolvedBy: z.string() }).nullable(),
  teams: z.array(
    z.object({
      slug: z.string(),
      name: z.string(),
      role: z.string(),
      projects: z.array(z.object({ ref: z.string(), name: z.string(), lastRunAt: z.string().nullable(), url: z.string() })),
    }),
  ),
  toolsets: z.array(z.string()),
});

const MAX_PROJECTS = 50;

export const whoami = defineTool({
  name: 'whoami',
  title: 'Who am I',
  toolset: 'core',
  description:
    'Call first when you do not know the project. Shows who this connection acts as, the teams and projects it can read (as "team/project" refs), roles, token expiry and the default project.',
  input,
  output: outputSchema,
  async handler(_args, ctx) {
    const [projects, fallback] = await Promise.all([ctx.accessibleProjects(), ctx.defaultProject()]);
    const grant = ctx.principal.grant;
    const teams = new Map<string, z.infer<typeof outputSchema>['teams'][number]>();
    for (const p of projects.slice(0, MAX_PROJECTS)) {
      const team = teams.get(p.team.id) ?? { slug: p.team.slug, name: p.team.name, role: p.role, projects: [] };
      team.projects.push({
        ref: `${p.team.slug}/${p.project.slug}`,
        name: p.project.name,
        lastRunAt: p.lastRunAt?.toISOString() ?? null,
        url: projectLinks(p.team.slug, p.project.slug).base,
      });
      teams.set(p.team.id, team);
    }
    const data: z.infer<typeof outputSchema> = {
      user: { name: ctx.principal.user.name, email: ctx.principal.user.email, superadmin: ctx.principal.user.isSuperadmin },
      credential: {
        kind: grant?.kind ?? 'session',
        name: ctx.credential.name,
        prefix: ctx.credential.prefix,
        scopes: grant ? [...grant.scopes] : ['read'],
        expiresAt: ctx.credential.expiresAt?.toISOString() ?? null,
        restrictions: { teams: grant?.teamIds ? [...grant.teamIds] : null, project: grant?.projectId ?? null, allTeams: grant?.allTeams ?? false },
      },
      defaultProject: fallback ? { ref: fallback.ref, resolvedBy: fallback.resolvedBy } : null,
      teams: [...teams.values()],
      toolsets: ctx.connection.toolsets,
    };
    return {
      data,
      render(md, d) {
        md.heading('Connection', 2);
        md.kv([
          ['User', `${d.user.name} <${d.user.email}>${d.user.superadmin ? ' (superadmin)' : ''}`],
          ['Credential', d.credential.kind === 'pat' ? `personal access token "${d.credential.name}" (${d.credential.prefix}…)` : d.credential.kind],
          ['Scopes', d.credential.scopes.join(', ')],
          ['Expires', d.credential.expiresAt ? when(d.credential.expiresAt) : null],
          ['Restricted to', d.credential.restrictions.project ? 'one project' : d.credential.restrictions.teams ? `${d.credential.restrictions.teams.length} team(s)` : null],
          ['Default project', d.defaultProject ? `${d.defaultProject.ref} (from ${d.defaultProject.resolvedBy})` : 'none — pass "project" to each tool'],
          ['Toolsets', d.toolsets.join(', ')],
        ]);
        if (d.teams.length === 0) {
          md.line('This connection cannot read any project. A team admin has to add the user to a team.');
          return;
        }
        md.heading('Projects you can read', 2);
        md.table(
          ['Project', 'Name', 'Role', 'Last run'],
          d.teams.flatMap((t) => t.projects.map((p) => [link(p.ref, p.url), p.name, t.role, p.lastRunAt ? when(p.lastRunAt) : 'never'])),
        );
        if (projects.length > MAX_PROJECTS) md.notice(`Showing ${MAX_PROJECTS} of ${projects.length} projects, most recently active first.`);
      },
    };
  },
});
