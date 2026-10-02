/**
 * The money an AI analysis may spend, enforced: a job reserves its cost
 * ceiling in a transaction against the team's and the project's monthly
 * limits before any provider is called, settles the actual cost afterwards,
 * and keeps the reservation when the provider's answer (and so its bill) is
 * unknown. Amounts are micro-dollars; periods are calendar months in UTC.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiBudgetPeriods, aiUsageLedger } from '@/lib/db/schema';

export class BudgetExceeded extends Error {
  constructor(
    readonly scope: 'team' | 'project',
    readonly limitMicroUsd: number,
    readonly committedMicroUsd: number,
    readonly requestedMicroUsd: number,
  ) {
    super(`The ${scope}'s monthly AI budget would be exceeded: ${fmt(committedMicroUsd)} spent or reserved, ${fmt(requestedMicroUsd)} asked for, ${fmt(limitMicroUsd)} allowed.`);
  }
}

const fmt = (micro: number) => `$${(micro / 1_000_000).toFixed(4)}`;

/** `2026-10`: the current period, UTC. */
export const periodOf = (at = new Date()) => `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;

/** `VISUAL_AI_TEAM_MONTHLY_USD`: the default team limit, micro-dollars (default $10). */
export function teamMonthlyLimit(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.VISUAL_AI_TEAM_MONTHLY_USD);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000) : 10_000_000;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The period row of a scope, created on first use and locked for the transaction. */
async function lockPeriod(tx: Tx, teamId: string, projectId: string | null, period: string) {
  await tx
    .insert(aiBudgetPeriods)
    .values({ id: randomUUID(), teamId, projectId, period })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(aiBudgetPeriods)
    .where(and(eq(aiBudgetPeriods.teamId, teamId), projectId ? eq(aiBudgetPeriods.projectId, projectId) : isNull(aiBudgetPeriods.projectId), eq(aiBudgetPeriods.period, period)))
    .for('update');
  return row;
}

export interface ReserveInput {
  teamId: string;
  projectId: string;
  jobId: string;
  microUsd: number;
  limits: { teamMicroUsd: number; projectMicroUsd: number | null };
  at?: Date;
}

/**
 * Reserves `microUsd` for a job, or throws `BudgetExceeded`. Team first, then
 * project, both locked, so two jobs racing cannot both fit into the last
 * cent. Idempotent per job: a second reservation for the same job is a no-op.
 */
export async function reserve(input: ReserveInput): Promise<{ period: string }> {
  const period = periodOf(input.at);
  return db.transaction(async (tx) => {
    const [already] = await tx.select({ id: aiUsageLedger.id }).from(aiUsageLedger).where(and(eq(aiUsageLedger.jobId, input.jobId), eq(aiUsageLedger.kind, 'reserve')));
    if (already) return { period };
    const team = await lockPeriod(tx, input.teamId, null, period);
    const project = await lockPeriod(tx, input.teamId, input.projectId, period);
    const committed = (row: typeof team) => row.spentMicroUsd + row.reservedMicroUsd;
    if (committed(team) + input.microUsd > input.limits.teamMicroUsd) throw new BudgetExceeded('team', input.limits.teamMicroUsd, committed(team), input.microUsd);
    if (input.limits.projectMicroUsd !== null && committed(project) + input.microUsd > input.limits.projectMicroUsd) throw new BudgetExceeded('project', input.limits.projectMicroUsd, committed(project), input.microUsd);
    for (const row of [team, project]) await tx.update(aiBudgetPeriods).set({ reservedMicroUsd: sql`${aiBudgetPeriods.reservedMicroUsd} + ${input.microUsd}`, updatedAt: new Date() }).where(eq(aiBudgetPeriods.id, row.id));
    await tx.insert(aiUsageLedger).values({ id: randomUUID(), teamId: input.teamId, projectId: input.projectId, jobId: input.jobId, period, kind: 'reserve', microUsd: input.microUsd });
    return { period };
  });
}

/**
 * Settles a job: the reservation becomes `actualMicroUsd` spent, the rest is
 * released. With `actualMicroUsd` unknown (a timeout: the provider may have
 * billed), the whole reservation is counted as spent — conservatively.
 */
export async function settle(input: { teamId: string; projectId: string; jobId: string; actualMicroUsd: number | null }): Promise<void> {
  await db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(aiUsageLedger).where(and(eq(aiUsageLedger.jobId, input.jobId), eq(aiUsageLedger.kind, 'reserve')));
    if (!reservation) return;
    const [settled] = await tx.select({ id: aiUsageLedger.id }).from(aiUsageLedger).where(and(eq(aiUsageLedger.jobId, input.jobId), eq(aiUsageLedger.kind, 'settle')));
    if (settled) return;
    const reserved = reservation.microUsd;
    const spent = Math.min(reserved, input.actualMicroUsd ?? reserved);
    const team = await lockPeriod(tx, input.teamId, null, reservation.period);
    const project = await lockPeriod(tx, input.teamId, input.projectId, reservation.period);
    for (const row of [team, project])
      await tx
        .update(aiBudgetPeriods)
        .set({ reservedMicroUsd: sql`greatest(0, ${aiBudgetPeriods.reservedMicroUsd} - ${reserved})`, spentMicroUsd: sql`${aiBudgetPeriods.spentMicroUsd} + ${spent}`, updatedAt: new Date() })
        .where(eq(aiBudgetPeriods.id, row.id));
    await tx.insert(aiUsageLedger).values({ id: randomUUID(), teamId: input.teamId, projectId: input.projectId, jobId: input.jobId, period: reservation.period, kind: 'settle', microUsd: spent });
    if (reserved > spent) await tx.insert(aiUsageLedger).values({ id: randomUUID(), teamId: input.teamId, projectId: input.projectId, jobId: input.jobId, period: reservation.period, kind: 'release', microUsd: reserved - spent });
  });
}

/** Spent plus reserved this month, for the team or one project, micro-dollars. */
export async function spentThisMonth(teamId: string, projectId: string | null, at = new Date()): Promise<number> {
  const [row] = await db
    .select({ spent: aiBudgetPeriods.spentMicroUsd, reserved: aiBudgetPeriods.reservedMicroUsd })
    .from(aiBudgetPeriods)
    .where(and(eq(aiBudgetPeriods.teamId, teamId), projectId ? eq(aiBudgetPeriods.projectId, projectId) : isNull(aiBudgetPeriods.projectId), eq(aiBudgetPeriods.period, periodOf(at))));
  return row ? row.spent + row.reserved : 0;
}
