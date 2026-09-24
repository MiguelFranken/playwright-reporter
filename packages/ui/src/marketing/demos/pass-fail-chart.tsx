'use client';

import { trend } from '../../fixtures/dashboard';
import { PassFailChart } from '../../views/dashboard/pass-fail-chart';
import { DemoShell } from './shell';

export function PassFailChartDemo() {
  return (
    <DemoShell>
      {/* Recharts measures its container, so the height has to be real. */}
      <div className="h-[28rem] w-full">
        <PassFailChart data={trend} />
      </div>
    </DemoShell>
  );
}
