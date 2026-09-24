/**
 * Self-hosted on the Workflow SDK's Postgres world, each server instance runs
 * the worker that delivers the run watchdog's steps and wake-ups. On Vercel
 * (and with the local world in dev) the platform does this; nothing to start.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.WORKFLOW_TARGET_WORLD !== '@workflow/world-postgres') return;
  const { getWorld } = await import('workflow/runtime');
  await (await getWorld()).start?.();
}
