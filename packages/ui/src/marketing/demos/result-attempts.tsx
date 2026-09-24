'use client';

import { attempts } from '../../fixtures/attempts';
import { ResultAttempts } from '../../views/run/result-attempts';
import { DemoShell } from './shell';

export function ResultAttemptsDemo() {
  return (
    <DemoShell>
      <ResultAttempts attempts={attempts} />
    </DemoShell>
  );
}
