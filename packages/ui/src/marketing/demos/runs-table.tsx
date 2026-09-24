'use client';

import { runs } from '../../fixtures/runs';
import { RunsTable } from '../../views/runs/runs-table';
import { DemoShell, deadHrefs } from './shell';

export function RunsTableDemo() {
  return (
    <DemoShell>
      <RunsTable hrefs={deadHrefs} runs={runs.slice(0, 4)} />
    </DemoShell>
  );
}
