/**
 * MCP resources. The guide is static; the templates resolve through the same
 * access checks as the tools, on every read.
 */
import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/server';
import { searchRuns } from '@/lib/db/queries/mcp';
import { getAttachmentInProject } from '@/lib/db/queries/mcp-analysis';
import { getStorage } from '@/lib/storage';
import type { ToolContext } from './context';
import { ToolError } from './errors';
import { GUIDE_FULL } from './guide';
import { runTool } from './registry';
import { getRun } from './tools/get-run';

export function registerResources(server: McpServer, ctx: ToolContext) {
  server.registerResource(
    'guide',
    'pwr://guide',
    {
      title: 'How to use the Playwright Reporter tools',
      description: 'Which tool to start with, identifier forms, what the verdicts mean, and safety rules.',
      mimeType: 'text/markdown',
      // Only changes on deploy.
      cacheHint: { ttlMs: 3_600_000, cacheScope: 'public' },
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE_FULL }] }),
  );

  server.registerResource(
    'run',
    new ResourceTemplate('pwr://projects/{team}/{project}/runs/{number}', {
      // The latest runs of the default project, for clients with a resource picker.
      list: async () => {
        const project = await ctx.defaultProject();
        if (!project) return { resources: [] };
        const { rows } = await searchRuns(project.project.id, {}, { limit: 20, offset: 0 });
        return {
          resources: rows.map((r) => ({
            uri: `pwr://projects/${project.team.slug}/${project.project.slug}/runs/${r.number}`,
            name: `#${r.number} ${r.status}${r.gitBranch ? ` · ${r.gitBranch}` : ''}`,
            mimeType: 'text/markdown',
          })),
        };
      },
    }),
    { title: 'Run summary', description: 'A run’s header, counts and failure groups, as markdown.', mimeType: 'text/markdown' },
    async (uri, vars) => {
      const result = await runTool(getRun as never, { project: `${vars.team}/${vars.project}`, run: Number(vars.number) }, ctx);
      const text = result.content.map((c) => ('text' in c ? c.text : '')).join('\n');
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );

  server.registerResource(
    'artifact',
    new ResourceTemplate('pwr://artifacts/{attachmentId}', { list: undefined }),
    { title: 'Test artifact', description: 'The bytes of a screenshot, trace, video or text attachment.' },
    async (uri, vars) => {
      const id = String(vars.attachmentId).toLowerCase();
      // An attachment belongs to exactly one project; find it among the ones the caller may read.
      for (const p of await ctx.accessibleProjects()) {
        const row = await getAttachmentInProject(p.project.id, id);
        if (!row) continue;
        await ctx.project(p.project.id, { artifact: ['read'] });
        if (row.attachment.status !== 'uploaded') throw new ToolError('ARTIFACT_UNAVAILABLE', `The attachment is ${row.attachment.status}.`);
        const object = await getStorage().get(row.attachment.storageKey);
        if (!object) throw new ToolError('ARTIFACT_UNAVAILABLE', 'The attachment is missing from storage.');
        const bytes = Buffer.from(await new Response(object.stream).arrayBuffer());
        return { contents: [{ uri: uri.href, mimeType: row.attachment.contentType, blob: bytes.toString('base64') }] };
      }
      throw new ToolError('NOT_FOUND', 'Attachment not found, or you cannot read it.');
    },
  );
}
