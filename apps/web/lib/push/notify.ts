import { and, eq, inArray, sql } from 'drizzle-orm';
import webpush, { WebPushError } from 'web-push';
import { db } from '@/lib/db/drizzle';
import { projects, pushSubscriptions, runs, teamMembers, teams, testResults, users, type PushSubscriptionRow } from '@/lib/db/schema';
import { pushConfig } from './config';
import { runMessage, type PushMessage, type RunCounts, type RunNotificationKind } from './message';

/** A notification nobody could deliver within an hour is no longer news. */
const TTL_SECONDS = 60 * 60;

/**
 * Tells every member of the run's team who turned notifications on for this
 * kind of event, on each of their browsers. Never throws: a failed push must
 * not fail the ingest call or the watchdog step that caused it.
 */
export async function notifyRun(runId: string, kind: RunNotificationKind): Promise<void> {
  const config = pushConfig();
  if (!config) return;
  try {
    const [row] = await db
      .select({
        run: runs,
        project: { slug: projects.slug, name: projects.name },
        team: { id: teams.id, slug: teams.slug },
      })
      .from(runs)
      .innerJoin(projects, eq(projects.id, runs.projectId))
      .innerJoin(teams, eq(teams.id, projects.teamId))
      .where(eq(runs.id, runId));
    if (!row) return;

    const wants = kind === 'started' ? pushSubscriptions.notifyStarted : pushSubscriptions.notifyFinished;
    const targets = await db
      .select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
      .from(pushSubscriptions)
      .innerJoin(teamMembers, and(eq(teamMembers.userId, pushSubscriptions.userId), eq(teamMembers.teamId, row.team.id)))
      .innerJoin(users, eq(users.id, pushSubscriptions.userId))
      .where(and(eq(wants, true), eq(users.banned, false)));
    if (!targets.length) return;

    const counts = kind === 'finished' ? await runCounts(runId) : undefined;
    await sendPush(targets, runMessage(kind, { ...row.run, project: row.project, team: row.team }, counts), {
      // A queued "started" that was never delivered is replaced by the result.
      topic: runId.replace(/-/g, ''),
    });
  } catch (err) {
    console.error('[push] notify failed', err);
  }
}

type Target = Pick<PushSubscriptionRow, 'id' | 'endpoint' | 'p256dh' | 'auth'>;

/**
 * Sends one message to each target. A subscription the push service reports
 * gone (the user revoked the permission, or the browser dropped it) is deleted.
 */
export async function sendPush(targets: Target[], message: PushMessage, extra: { topic?: string } = {}): Promise<{ sent: number }> {
  const config = pushConfig();
  if (!config || !targets.length) return { sent: 0 };
  const payload = JSON.stringify(message);
  const options = { vapidDetails: config, TTL: TTL_SECONDS, urgency: 'normal' as const, ...extra };
  const gone: string[] = [];
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, options);
        sent++;
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) gone.push(t.id);
        else console.error('[push] send failed', err);
      }
    }),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return { sent };
}

async function runCounts(runId: string): Promise<RunCounts> {
  const [c] = await db
    .select({
      passed: sql<number>`count(*) filter (where ${testResults.outcome} = 'passed')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${testResults.outcome} in ('failed','timedout','interrupted'))`.mapWith(Number),
      flaky: sql<number>`count(*) filter (where ${testResults.outcome} = 'flaky')`.mapWith(Number),
      skipped: sql<number>`count(*) filter (where ${testResults.outcome} = 'skipped')`.mapWith(Number),
    })
    .from(testResults)
    .where(eq(testResults.runId, runId));
  return c ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
}
