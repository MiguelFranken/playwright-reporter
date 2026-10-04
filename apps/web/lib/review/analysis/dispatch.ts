/**
 * Runs a created analysis by the configured driver. Kept apart from the job
 * service because `after()` belongs to Next.js request handling: the
 * workflow steps import the job service, and their bundle must not carry
 * `next/server`.
 */
import { after } from 'next/server';
import { analysisDriver, runAnalysis } from './jobs';

export async function dispatchAnalysis(jobId: string) {
  const driver = analysisDriver();
  if (driver === 'inline') await runAnalysis(jobId);
  else if (driver === 'after') {
    after(async () => {
      try {
        await runAnalysis(jobId);
      } catch (err) {
        console.error('[visual-ai] running an analysis failed', err);
      }
    });
  }
}
