/**
 * MCP resources. The guide is static; the rest are templates resolved through
 * the same access checks as the tools.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from './context';
import { GUIDE_FULL } from './guide';

export function registerResources(server: McpServer, _ctx: ToolContext) {
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
}
