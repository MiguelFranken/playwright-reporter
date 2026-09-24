'use client';

import { explorerRows } from '../../fixtures/tests';
import { ExplorerTable } from '../../views/explorer/explorer-table';
import { DemoShell, deadHrefs, noop } from './shell';

export function ExplorerTableDemo() {
  return (
    <DemoShell>
      <ExplorerTable
        hrefs={deadHrefs}
        rows={explorerRows}
        sort="lastRun"
        dir="desc"
        onSortChange={noop}
        onSelectTest={noop}
      />
    </DemoShell>
  );
}
