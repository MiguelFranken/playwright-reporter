'use client';

import { useEffect, useState } from 'react';
import { ActiveRuns, type ActiveRun } from '../views/runs/active-runs';
import { runningRun } from '../fixtures/runs';

/** Where the scripted run ends: the same numbers the `failedRun` fixture carries. */
const FINAL = { passed: 213, failed: 14, flaky: 9, skipped: 4 };
const EXPECTED = 240;
const STEPS = 48;
const TICK_MS = 140;
const PAUSE_TICKS = 14;

const hrefs = { run: () => '#' };

/** Which shards have finished by a given point in the run. */
function shardsAt(progress: number): ActiveRun['shards'] {
  return [1, 2, 3, 4].map((shardIndex) => ({
    shardIndex,
    status: progress >= shardIndex / 4 ? 'passed' : 'running',
  }));
}

function frame(step: number): ActiveRun {
  const progress = Math.min(step / STEPS, 1);
  const passed = Math.round(FINAL.passed * progress);
  const failed = Math.round(FINAL.failed * progress);
  const flaky = Math.round(FINAL.flaky * progress);
  const skipped = Math.round(FINAL.skipped * progress);
  const finished = passed + failed + flaky + skipped;
  const running = Math.max(EXPECTED - finished, 0);

  return {
    ...runningRun,
    status: progress >= 1 ? 'failed' : 'running',
    counts: {
      total: EXPECTED,
      passed,
      failed,
      flaky,
      skipped,
      interrupted: 0,
      running: progress >= 1 ? 0 : running,
    },
    shards: shardsAt(progress),
  };
}

/**
 * A run filling up, on a timer.
 *
 * This is the hero's whole argument: the thing on the right is the app's own
 * `ActiveRuns` view, driven by the same fixture Storybook uses, so it is not a
 * mock-up of the product — it is the product with a script attached.
 *
 * Under `prefers-reduced-motion` it renders the finished frame immediately and
 * starts no timer at all; the information is identical either way.
 */
export function LiveRunDemo({ speed = 1 }: { speed?: number }) {
  // Server render and first paint are the final frame, so a reader who never
  // hydrates (or who asked for no motion) still sees a complete, sensible run.
  const [step, setStep] = useState(STEPS);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    setStep(0);
    let current = 0;
    const id = window.setInterval(() => {
      // Hold on the finished run for a beat before starting over.
      current = current >= STEPS + PAUSE_TICKS ? 0 : current + 1;
      setStep(Math.min(current, STEPS));
    }, TICK_MS / speed);

    return () => window.clearInterval(id);
  }, [speed]);

  return <ActiveRuns hrefs={hrefs} runs={[frame(step)]} />;
}
