'use client';

import { mixedResults } from '../../fixtures/results';
import { counts } from '../../fixtures/runs';
import { RunSummary } from '../../views/run/run-summary';
import { DemoShell, deadHrefs, noop } from './shell';

export function RunSummaryDemo() {
  return (
    <DemoShell>
      <RunSummary
        hrefs={deadHrefs}
        counts={counts({ total: 240, passed: 213, flaky: 9, failed: 14, skipped: 4 })}
        rows={mixedResults}
        filters={{}}
        onFilterChange={noop}
      />
    </DemoShell>
  );
}
