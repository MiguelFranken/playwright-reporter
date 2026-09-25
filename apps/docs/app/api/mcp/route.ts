import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { registerSearchTool, registerSourceTools } from 'fumadocs-core/mcp';
import { createFromSource } from 'fumadocs-core/search/server';
import { docsLlms, source } from '@/lib/source';

/**
 * These docs as an MCP server, so an assistant can search and read them while
 * it helps somebody set up or use Playwright Reporter:
 * `claude mcp add --transport http playwright-reporter-docs https://<docs>/api/mcp`.
 * Public and read-only, like the pages themselves.
 */
const handler = createMcpHandler(
  () => {
    const mcp = new McpServer({ name: 'playwright-reporter-docs', version: '1.0.0' });
    registerSourceTools(mcp, source, docsLlms);
    registerSearchTool(mcp, createFromSource(source, { language: 'english' }));
    return mcp;
  },
  { legacy: 'stateless', responseMode: 'json' },
);

export const GET = (request: Request) => handler.fetch(request);
export const POST = (request: Request) => handler.fetch(request);
export const DELETE = (request: Request) => handler.fetch(request);
