'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { mcpEnabledByEnv } from '@/lib/mcp/config';
import { saveMcpSetting } from '@/lib/mcp/instance';

/**
 * The instance-wide MCP switch in Administration → MCP. Saving `true` while
 * `MCP_ENABLED=false` is allowed and stored, but the environment still wins —
 * the result says so, so the card can explain why nothing changed.
 */
export async function setMcpEnabled(enabled: boolean): Promise<{ ok: true; enabled: boolean; effective: boolean } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  if (!user.isSuperadmin) return actionError('Superadmins only.');
  const parsed = z.boolean().safeParse(enabled);
  if (!parsed.success) return actionError('Invalid value.');

  await saveMcpSetting({ enabled: parsed.data }, user.id);
  await audit('mcp.settings.update', { actorId: user.id, target: { enabled: parsed.data } });
  revalidatePath('/admin/mcp');
  revalidatePath('/account/ai');
  return { ok: true, enabled: parsed.data, effective: parsed.data && mcpEnabledByEnv() };
}
