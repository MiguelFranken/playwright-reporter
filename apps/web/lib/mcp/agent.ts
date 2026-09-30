/**
 * The name an assistant's comments go under. Whatever an agent writes on a
 * review image is shown as the agent's — never as the person whose token it
 * uses — so a reviewer can tell a report of a fix from a colleague's word.
 */
import { DEFAULT_AGENT_NAME } from '@miguelfranken/ui/lib/review-threads';
import type { ToolContext } from './context';

/** The name given, else the OAuth app's own ("Claude", "ChatGPT"), else a generic one; a token's name is the person's label, not the agent's. */
export function agentNameFor(given: string | undefined, ctx: Pick<ToolContext, 'principal' | 'credential'>): string {
  const name = given?.trim();
  if (name) return name.slice(0, 60);
  if (ctx.principal.grant?.kind === 'oauth' && ctx.credential.name?.trim()) return ctx.credential.name.trim().slice(0, 60);
  return DEFAULT_AGENT_NAME;
}
