'use client';

import { errorGroups } from '../../fixtures/results';
import { RunErrors } from '../../views/run/run-errors';
import { DemoShell, deadHrefs } from './shell';

export function RunErrorsDemo() {
  return (
    <DemoShell>
      <RunErrors hrefs={deadHrefs} groups={errorGroups} />
    </DemoShell>
  );
}
