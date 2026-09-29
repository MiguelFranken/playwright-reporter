'use client';

import { useState } from 'react';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Skeleton } from '../../components/skeleton';
import { SearchField } from '../../patterns/filter-controls';
import { StatusIcon } from '../../patterns/status-badge';
import { formatNumber, formatRelative } from '../../lib/format';
import type { AutomatedTestOption, SuiteOption } from '../../lib/test-case-models';
import { FieldSelect } from './field-select';

export interface TestPickerResult {
  testIds: string[];
  /** Adopting only: where the new cases go. */
  placement: { mode: 'mirror' } | { mode: 'target'; suiteId: string | null };
}

export interface TestPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `link` ties the tests to one case; `adopt` creates a case per test. */
  mode: 'link' | 'adopt';
  title: string;
  description: React.ReactNode;
  query: string;
  onQueryChange: (query: string) => void;
  options: AutomatedTestOption[];
  total: number;
  loading?: boolean;
  error?: string | null;
  /** Adopting: the suites a target can be picked from. */
  suites?: SuiteOption[];
  onConfirm: (result: TestPickerResult) => void;
  pending?: boolean;
  now?: Date;
}

const MIRROR = '__mirror__';
const UNASSIGNED = '__unassigned__';

/**
 * Picks Playwright tests from the project, searchable by title and file.
 * Selection survives a new search, so tests can be gathered across several.
 */
export function TestPickerDialog({
  open,
  onOpenChange,
  mode,
  title,
  description,
  query,
  onQueryChange,
  options,
  total,
  loading = false,
  error,
  suites = [],
  onConfirm,
  pending = false,
  now,
}: TestPickerDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [placement, setPlacement] = useState(MIRROR);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setSelected(new Set());
  }
  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectable = mode === 'adopt' ? options.filter((o) => o.linkedCases.length === 0) : options;
  const allShown = selectable.length > 0 && selectable.every((o) => selected.has(o.testId));
  const verb = mode === 'adopt' ? 'Adopt' : 'Link';
  const count = selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <SearchField value={query} onValueChange={(q) => onQueryChange(q ?? '')} placeholder="Search tests by title or file" fill />
          <div className="flex items-center justify-between gap-2 text-body-s text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              <Checkbox
                checked={allShown}
                disabled={selectable.length === 0}
                onCheckedChange={(on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const o of selectable) {
                      if (on === true) next.add(o.testId);
                      else next.delete(o.testId);
                    }
                    return next;
                  })
                }
              />
              Select every test shown
            </label>
            <span>
              {formatNumber(options.length)} of {formatNumber(total)} shown
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {error ? (
              <p className="px-4 py-6 text-center text-body-s text-danger-text">{error}</p>
            ) : loading && options.length === 0 ? (
              <div role="status" className="flex flex-col gap-2 p-3" aria-label="Loading tests">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : options.length === 0 ? (
              <p className="px-4 py-6 text-center text-body-s text-muted-foreground">
                {query ? `No tests match "${query}".` : mode === 'adopt' ? 'Every Playwright test already has a case.' : 'This project has no Playwright tests yet.'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {options.map((o) => {
                  const taken = mode === 'adopt' && o.linkedCases.length > 0;
                  const id = `pick-${o.testId}`;
                  return (
                    <li key={o.testId} className="flex items-start gap-3 px-3 py-2.5">
                      <Checkbox id={id} className="mt-0.5" checked={selected.has(o.testId)} disabled={taken} onCheckedChange={(on) => toggle(o.testId, on === true)} />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                        <span className="block truncate font-medium">{o.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-s text-muted-foreground">
                          <span className="truncate text-code-s">{o.file}</span>
                          {o.pwProject ? <Badge variant="secondary">{o.pwProject}</Badge> : null}
                          {o.linkedCases.length ? <span>Covered by {o.linkedCases.join(', ')}</span> : null}
                        </span>
                      </label>
                      <div className="flex shrink-0 items-center gap-2 text-body-s text-muted-foreground">
                        {o.lastOutcome ? <StatusIcon status={o.lastOutcome} /> : null}
                        {o.lastRunAt ? formatRelative(o.lastRunAt, { now }) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {mode === 'adopt' ? (
            <FieldSelect
              id="adopt-placement"
              label="Put the new cases in"
              value={placement}
              onValueChange={setPlacement}
              items={[
                { value: MIRROR, label: 'Suites named after each test’s file and describe blocks' },
                { value: UNASSIGNED, label: 'Unassigned' },
                ...suites,
              ]}
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={count === 0 || pending}
            onClick={() =>
              onConfirm({
                testIds: [...selected],
                placement: placement === MIRROR ? { mode: 'mirror' } : { mode: 'target', suiteId: placement === UNASSIGNED ? null : placement },
              })
            }
          >
            {pending ? (mode === 'adopt' ? 'Adopting…' : 'Linking…') : count ? `${verb} ${count} ${count === 1 ? 'test' : 'tests'}` : verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
