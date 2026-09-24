'use client';

import { chronicFailures, flakyTests } from '../../fixtures/dashboard';
import { ChronicFailuresList, FlakyTestsList } from '../../views/dashboard/test-health-lists';
import { DemoShell, deadHrefs } from './shell';

export function FlakyTestsDemo() {
  return (
    <DemoShell>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel">
          <p className="border-b border-separator px-5 py-3 text-headline-m">Flakiest tests</p>
          <FlakyTestsList hrefs={deadHrefs} rows={flakyTests} />
        </div>
        <div className="panel">
          <p className="border-b border-separator px-5 py-3 text-headline-m">Chronic failures</p>
          <ChronicFailuresList hrefs={deadHrefs} rows={chronicFailures} />
        </div>
      </div>
    </DemoShell>
  );
}
