import { after } from 'next/server';
import { pushConfig } from './config';
import type { RunNotificationKind } from './message';
import { notifyRun } from './notify';

export type PushEffect = { runId: string; kind: RunNotificationKind } | null;

/** Sends an ingest call's notification once the response is out, like `afterIngest`. */
export function afterPush(effect: PushEffect) {
  if (!effect || !pushConfig()) return;
  after(() => notifyRun(effect.runId, effect.kind));
}
