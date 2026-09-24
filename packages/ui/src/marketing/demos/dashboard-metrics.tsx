'use client';

import { Activity, Clock, Repeat2, ShieldCheck } from 'lucide-react';
import { Badge } from '../../components/badge';
import { MetricCard, toneClass } from '../../patterns/metric-card';
import { DemoShell } from './shell';

export function DashboardMetricsDemo() {
  return (
    <DemoShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Runs" value="1,204" icon={Activity} subtext="Last 30 days" />
        <MetricCard label="Pass rate" value="98.4%" icon={ShieldCheck} subtext="1,185 of 1,204 runs" />
        <MetricCard
          label="Reliability"
          value="82"
          icon={Repeat2}
          badge={
            <Badge variant="outline" className={toneClass.good}>
              Healthy
            </Badge>
          }
        />
        <MetricCard label="Median duration" value="4m 12s" icon={Clock} subtext="p95 11m 40s" />
      </div>
    </DemoShell>
  );
}
