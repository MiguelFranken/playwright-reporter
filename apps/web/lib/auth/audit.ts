import 'server-only';
import { headers } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { auditLogs } from '@/lib/db/schema';

export type AuditAction =
  | 'team.create'
  | 'team.update'
  | 'team.delete'
  | 'team.avatar.update'
  | 'team.avatar.remove'
  | 'member.invite'
  | 'member.invite.regenerate'
  | 'member.invite.revoke'
  | 'member.join'
  | 'member.add'
  | 'member.remove'
  | 'member.role'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'token.create'
  | 'token.revoke'
  | 'pat.create'
  | 'pat.revoke'
  | 'oauth.grant'
  | 'oauth.revoke'
  | 'user.role'
  | 'user.ban'
  | 'user.unban'
  | 'user.password'
  | 'user.delete'
  | 'storage.retention.update'
  | 'storage.retention.sweep'
  | 'storage.evict'
  | 'mcp.settings.update';

/**
 * Audit writes are best effort: a failure here must never fail the mutation
 * that triggered it.
 */
export async function audit(
  action: AuditAction,
  entry: {
    actorId?: string | null;
    teamId?: string | null;
    projectId?: string | null;
    target?: Record<string, unknown>;
  } = {},
) {
  try {
    const ip = await clientIp();
    await db.insert(auditLogs).values({
      action,
      actorId: entry.actorId ?? null,
      teamId: entry.teamId ?? null,
      projectId: entry.projectId ?? null,
      target: entry.target ?? {},
      ipAddress: ip,
    });
  } catch (error) {
    console.error('[audit] failed to write', action, error);
  }
}

async function clientIp() {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  } catch {
    return null;
  }
}
