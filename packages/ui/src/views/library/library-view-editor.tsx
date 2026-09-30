'use client';

import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { Input } from '../../components/input';
import { Label } from '../../components/label';
import { LIBRARY_STATE_ICONS } from '../../patterns/library-state-chip';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { describeViewConfig, LIBRARY_STATE_HINTS, LIBRARY_STATE_LABELS, LIBRARY_STATE_TONES, LIBRARY_STATES, LIBRARY_VIEW_NAME_MAX, type LibraryViewConfig } from '../../lib/library-views';
import { CASE_PRIORITIES, CASE_PRIORITY_LABELS } from '../../lib/test-cases';
import { toneText } from '../../lib/tone';
import { PriorityIcon } from '../test-cases/case-badges';
import { ViewLayoutFields } from './library-toolbar';

const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** A filter value as a toggle chip: pressed when the view asks for it, with how many flows it alone would show. */
function FilterChip({ pressed, onClick, count, title, children }: { pressed: boolean; onClick: () => void; count: number; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-label-s outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/25',
        pressed ? 'border-accent-border bg-accent-subtle text-accent-text' : 'border-border bg-surface text-foreground hover:bg-muted/60',
      )}
    >
      {children}
      <span className={cn('tabular-nums', pressed ? 'text-accent-text' : 'text-muted-foreground')}>{formatNumber(count)}</span>
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-label-xs text-muted-foreground uppercase">{title}</h3>
        {hint ? <span className="text-label-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

export interface LibraryViewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A new view, or changes to a saved one. */
  mode: 'create' | 'edit';
  initialName?: string;
  initialConfig: LibraryViewConfig;
  /** The variants the library has, for the variant setting. */
  variants: readonly string[];
  /** How many flows a view with these settings would show; the builder previews it as you go. */
  countFor: (config: LibraryViewConfig) => number;
  /** Every flow, for "12 of 138". */
  total: number;
  onSubmit: (input: { name: string; config: LibraryViewConfig }) => void;
  pending?: boolean;
  error?: string | null;
}

/**
 * The view builder, as Notion and Linear build a view: a name, which flows
 * it shows (review states, test case priorities), how it lays them out
 * (folders, grouping, order, variant), and — while you choose — how many
 * flows it would show, so an empty view is caught before it is saved.
 */
export function LibraryViewEditor({ open, onOpenChange, mode, initialName = '', initialConfig, variants, countFor, total, onSubmit, pending = false, error }: LibraryViewEditorProps) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [config, setConfig] = useState(initialConfig);
  // A new opening starts from what the host passes now, not from what was left last time.
  const [seen, setSeen] = useState({ open, initialName, initialConfig });
  if (seen.open !== open || seen.initialName !== initialName || seen.initialConfig !== initialConfig) {
    setSeen({ open, initialName, initialConfig });
    if (open) {
      setName(initialName);
      setConfig(initialConfig);
    }
  }
  const setFilters = (filters: Partial<LibraryViewConfig['filters']>) => setConfig({ ...config, filters: { ...config.filters, ...filters } });
  const only = (filters: Partial<LibraryViewConfig['filters']>) => countFor({ ...config, filters: { states: [], priorities: [], ...filters } });
  const shows = countFor(config);
  const title = mode === 'create' ? 'New view' : 'Edit view';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({ name: name.trim(), config });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>A view keeps which flows you see and how they are laid out. Only you see your views.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} value={name} maxLength={LIBRARY_VIEW_NAME_MAX} autoFocus placeholder="High priority fixes" disabled={pending} onChange={(e) => setName(e.target.value)} />
          </div>

          <Section title="Review state" hint="Any of these">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Review state">
              {LIBRARY_STATES.map((s) => {
                const Icon = LIBRARY_STATE_ICONS[s];
                return (
                  <FilterChip key={s} pressed={config.filters.states.includes(s)} onClick={() => setFilters({ states: toggle(config.filters.states, s) })} count={only({ states: [s] })} title={LIBRARY_STATE_HINTS[s]}>
                    <Icon className={cn('size-3.5', toneText[LIBRARY_STATE_TONES[s]])} />
                    {LIBRARY_STATE_LABELS[s]}
                  </FilterChip>
                );
              })}
            </div>
          </Section>

          <Section title="Test case priority" hint="Any of these">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Test case priority">
              {CASE_PRIORITIES.map((p) => (
                <FilterChip key={p} pressed={config.filters.priorities.includes(p)} onClick={() => setFilters({ priorities: toggle(config.filters.priorities, p) })} count={only({ priorities: [p] })}>
                  <PriorityIcon priority={p} />
                  {p === 'none' ? 'No priority' : CASE_PRIORITY_LABELS[p]}
                </FilterChip>
              ))}
            </div>
          </Section>

          <Section title="Layout">
            <div className="rounded-lg border border-border bg-surface-sunken/60 px-3 py-2">
              <ViewLayoutFields config={config} onChange={setConfig} variants={variants} />
            </div>
          </Section>

          {error ? <p className="text-body-s text-danger-text">{error}</p> : null}
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-body-s text-muted-foreground" aria-live="polite">
              Shows <span className={cn('font-medium tabular-nums', shows ? 'text-foreground' : 'text-warning-text')}>{formatNumber(shows)}</span> of {formatNumber(total)} flows
              <span className="sr-only"> — {describeViewConfig(config)}</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || pending}>
                <Check /> {mode === 'create' ? 'Create view' : 'Save view'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
