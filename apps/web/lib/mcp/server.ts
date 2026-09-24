/**
 * The only module that constructs SDK server objects. `buildServer` is the
 * per-request factory `createMcpHandler` calls: a fresh `McpServer` every time
 * (a reused instance leaks — SDK issue #2607), with only the tools this
 * connection may see.
 */
import { McpServer, type McpRequestContext } from '@modelcontextprotocol/server';
import { credentialFrom, principalFrom } from './auth';
import { connectionOptions, createToolContext, type ToolContext } from './context';
import { GUIDE_INSTRUCTIONS } from './guide';
import { registerTool, type ToolDef } from './registry';
import { registerPrompts } from './prompts';
import { registerResources } from './resources';
import { TOOLS } from './tools';
import { baseUrl } from '@/lib/auth/config';

export const SERVER_INFO = {
  name: 'playwright-reporter',
  title: 'Playwright Reporter',
  version: '1.0.0',
  description: 'Test runs, failures, flakiness and trends of your Playwright suites.',
};

export function isToolEnabled(tool: ToolDef, ctx: Pick<ToolContext, 'connection' | 'principal'>): boolean {
  if (tool.toolset === 'write') return ctx.principal.grant?.scopes.includes('write') ?? false;
  return ctx.connection.toolsets.includes(tool.toolset);
}

export function buildServer({ era, authInfo, requestInfo }: McpRequestContext): McpServer {
  const ctx = createToolContext({
    principal: principalFrom(authInfo),
    credential: credentialFrom(authInfo),
    connection: connectionOptions(requestInfo),
    era,
  });
  const server = new McpServer(
    { ...SERVER_INFO, websiteUrl: baseUrl() },
    {
      instructions: GUIDE_INSTRUCTIONS,
      // v2 advertises listChanged: true by default; our lists never change
      // during a connection, and an idle listen stream would keep a
      // serverless function alive (SDK issue #2650).
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false },
      },
    },
  );
  for (const tool of TOOLS) if (isToolEnabled(tool, ctx)) registerTool(server, tool, ctx);
  registerPrompts(server, ctx);
  registerResources(server, ctx);
  return server;
}
