/**
 * MCP prompts: slash commands in clients that support them. A prompt carries
 * scope only — which project, run or test — never data, so a saved one never
 * goes stale; the tools fetch the data when it runs.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { ToolContext } from './context';

export interface PromptDef<A extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  args: A;
  text(args: z.infer<A>): string;
}

export const PROMPTS: PromptDef[] = [];

export function registerPrompts(server: McpServer, _ctx: ToolContext) {
  for (const prompt of PROMPTS) {
    server.registerPrompt(prompt.name, { title: prompt.title, description: prompt.description, argsSchema: prompt.args }, ((args: Record<string, unknown>) => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.text(args as never) } }],
    })) as never);
  }
}
