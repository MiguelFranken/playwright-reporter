/**
 * The runtime switch a superadmin flips in Administration → MCP, stored in
 * `instance_settings` like the retention policy. `MCP_ENABLED=false` in the
 * environment always wins; the setting can only switch the server off.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { instanceSettings } from '@/lib/db/schema';

export const MCP_SETTING_KEY = 'mcp';

export interface McpSetting {
  enabled: boolean;
}

export async function getMcpSetting(): Promise<McpSetting & { updatedAt: Date | null }> {
  const [row] = await db.select().from(instanceSettings).where(eq(instanceSettings.key, MCP_SETTING_KEY));
  return { enabled: row?.value.enabled !== false, updatedAt: row?.updatedAt ?? null };
}

export async function saveMcpSetting(setting: McpSetting, actorId: string) {
  const value = { enabled: setting.enabled };
  await db
    .insert(instanceSettings)
    .values({ key: MCP_SETTING_KEY, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: instanceSettings.key, set: { value, updatedBy: actorId, updatedAt: sql`now()` } });
}
