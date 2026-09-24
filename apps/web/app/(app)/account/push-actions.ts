'use server';

import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { actionError, getCurrentUser, type Denied } from '@/lib/auth/access';
import { db } from '@/lib/db/drizzle';
import { pushSubscriptions } from '@/lib/db/schema';
import { isPushServiceEndpoint } from '@/lib/push/endpoint';
import { sendPush } from '@/lib/push/notify';

export interface PushPreferences {
  notifyStarted: boolean;
  notifyFinished: boolean;
}

const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isPushServiceEndpoint),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
  notifyStarted: z.boolean(),
  notifyFinished: z.boolean(),
});

/**
 * Stores this browser's subscription for the caller. An endpoint belongs to
 * one browser profile, so one that is already known (someone else signed in
 * here before) moves to the caller.
 */
export async function savePushSubscription(input: z.input<typeof subscriptionSchema>): Promise<{ ok: true } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return actionError('This browser returned an invalid push subscription.');
  const { endpoint, keys, notifyStarted, notifyFinished } = parsed.data;
  const userAgent = (await headers()).get('user-agent')?.slice(0, 512) ?? null;
  const values = { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, notifyStarted, notifyFinished, updatedAt: new Date() };
  await db
    .insert(pushSubscriptions)
    .values({ endpoint, ...values })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
  return { ok: true };
}

export async function deletePushSubscription(endpoint: string): Promise<{ ok: true } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  return { ok: true };
}

/** This browser's settings, or null when the caller has no subscription for it. */
export async function getPushPreferences(endpoint: string): Promise<PushPreferences | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [row] = await db
    .select({ notifyStarted: pushSubscriptions.notifyStarted, notifyFinished: pushSubscriptions.notifyFinished })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  return row ?? null;
}

/** Pushes a sample notification to this browser, through the push service like a real one. */
export async function sendTestPush(endpoint: string): Promise<{ ok: true } | Denied> {
  const user = await getCurrentUser();
  if (!user) return actionError('Sign in first.');
  const targets = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  if (!targets.length) return actionError('Notifications are not on in this browser.');
  const { sent } = await sendPush(targets, { title: 'Test notification', body: 'Run notifications will look like this.', url: '/account', tag: 'test' });
  return sent ? { ok: true } : actionError('The push service did not accept the notification.');
}
