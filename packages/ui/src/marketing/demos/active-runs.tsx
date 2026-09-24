'use client';

import { LiveRunDemo } from '../live-run-demo';
import { DemoShell } from './shell';

/** The hero demo: a run filling up on a timer. */
export function ActiveRunsDemo() {
  return (
    <DemoShell>
      <LiveRunDemo />
    </DemoShell>
  );
}
