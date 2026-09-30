'use client';

import { Check, ListFilter, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/dropdown-menu';
import { Input } from '../../components/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/popover';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { LIBRARY_STATE_ICONS } from '../../patterns/library-state-chip';
import { cn } from '../../lib/cn';
import {
  activeFilterCount,
  LIBRARY_GROUPING_LABELS,
  LIBRARY_GROUPINGS,
  LIBRARY_SORT_LABELS,
  LIBRARY_SORTS,
  LIBRARY_STATE_LABELS,
  LIBRARY_STATE_TONES,
  LIBRARY_STATES,
  LIBRARY_VIEW_NAME_MAX,
  type LibraryCounts,
  type LibraryGrouping,
  type LibrarySort,
  type LibraryState,
  type LibraryViewConfig,
} from '../../lib/library-views';
import { CASE_PRIORITIES, CASE_PRIORITY_LABELS, type CasePriority } from '../../lib/test-cases';
import { toneText } from '../../lib/tone';
import { PriorityIcon } from '../test-cases/case-badges';

const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

/** The filter menu: review states and priorities, each with how many flows it would show. */
export function LibraryFilterMenu({ config, onChange, counts }: { config: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void; counts: LibraryCounts }) {
  const set = (filters: Partial<LibraryViewConfig['filters']>) => onChange({ ...config, filters: { ...config.filters, ...filters } });
  const active = activeFilterCount(config.filters);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <ListFilter /> Filter
        {active ? <span className="rounded-full bg-accent-subtle px-1.5 text-label-xs text-accent-text tabular-nums">{active}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Review state</DropdownMenuLabel>
          {LIBRARY_STATES.map((s) => {
            const Icon = LIBRARY_STATE_ICONS[s];
            return (
              <DropdownMenuCheckboxItem key={s} checked={config.filters.states.includes(s)} onCheckedChange={() => set({ states: toggle(config.filters.states, s) })} closeOnClick={false}>
                <Icon className={cn('size-4', toneText[LIBRARY_STATE_TONES[s]])} />
                <span className="flex-1">{LIBRARY_STATE_LABELS[s]}</span>
                <span className="text-label-xs text-muted-foreground tabular-nums">{counts.states[s]}</span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Test case priority</DropdownMenuLabel>
          {CASE_PRIORITIES.map((p) => (
            <DropdownMenuCheckboxItem key={p} checked={config.filters.priorities.includes(p)} onCheckedChange={() => set({ priorities: toggle(config.filters.priorities, p) })} closeOnClick={false}>
              <PriorityIcon priority={p} />
              <span className="flex-1">{p === 'none' ? 'No priority' : CASE_PRIORITY_LABELS[p]}</span>
              <span className="text-label-xs text-muted-foreground tabular-nums">{counts.priorities[p]}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {active ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => set({ states: [], priorities: [] })}>
              <X /> Clear filters
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The active filters as removable chips: `State: Ready to verify, Waiting for changes ×`. */
export function LibraryFilterChips({ config, onChange }: { config: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void }) {
  const set = (filters: Partial<LibraryViewConfig['filters']>) => onChange({ ...config, filters: { ...config.filters, ...filters } });
  const chip = (key: string, label: string, values: string, onRemove: () => void) => (
    <span key={key} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface pl-2 text-label-s shadow-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-72 truncate" title={values}>
        {values}
      </span>
      <button type="button" aria-label={`Remove the ${label.toLowerCase()} filter`} onClick={onRemove} className="ml-0.5 flex h-full items-center rounded-r-lg px-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40">
        <X className="size-3.5" />
      </button>
    </span>
  );
  return (
    <>
      {config.filters.states.length ? chip('states', 'State', config.filters.states.map((s: LibraryState) => LIBRARY_STATE_LABELS[s]).join(', '), () => set({ states: [] })) : null}
      {config.filters.priorities.length
        ? chip('priorities', 'Priority', config.filters.priorities.map((p: CasePriority) => (p === 'none' ? 'None' : CASE_PRIORITY_LABELS[p])).join(', '), () => set({ priorities: [] }))
        : null}
    </>
  );
}

/** Grouping and order. */
export function LibraryDisplayMenu({ config, onChange }: { config: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void }) {
  const changed = config.group !== 'suite' || config.sort !== 'journey';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" aria-label={`Display: grouped by ${LIBRARY_GROUPING_LABELS[config.group].toLowerCase()}, ${LIBRARY_SORT_LABELS[config.sort].toLowerCase()}`} />}>
        <SlidersHorizontal /> Display
        {changed ? <span aria-hidden className="size-1.5 rounded-full bg-accent-solid" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup value={config.group} onValueChange={(v) => onChange({ ...config, group: v as LibraryGrouping })}>
          <DropdownMenuLabel>Group by</DropdownMenuLabel>
          {LIBRARY_GROUPINGS.map((g) => (
            <DropdownMenuRadioItem key={g} value={g} closeOnClick={false}>
              {LIBRARY_GROUPING_LABELS[g]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={config.sort} onValueChange={(v) => onChange({ ...config, sort: v as LibrarySort })}>
          <DropdownMenuLabel>Order</DropdownMenuLabel>
          {LIBRARY_SORTS.map((s) => (
            <DropdownMenuRadioItem key={s} value={s} closeOnClick={false}>
              {LIBRARY_SORT_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Every variant side by side, or one. */
export function LibraryVariantToggle({ variants, value, onChange }: { variants: readonly string[]; value: string | null; onChange: (next: string | null) => void }) {
  if (variants.length < 2) return null;
  return (
    <ToggleGroup variant="segment" size="sm" value={[value ?? 'all']} onValueChange={(v) => v[0] && onChange(v[0] === 'all' ? null : String(v[0]))} aria-label="Variant">
      <ToggleGroupItem value="all">All variants</ToggleGroupItem>
      {variants.map((v) => (
        <ToggleGroupItem key={v} value={v} className="capitalize">
          {v}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A name for a view, in a popover: saving a new view, or renaming one. */
export function ViewNamePopover({
  trigger,
  title,
  initial = '',
  submitLabel,
  pending = false,
  error,
  onSubmit,
}: {
  trigger: React.ReactElement;
  title: string;
  initial?: string;
  submitLabel: string;
  pending?: boolean;
  error?: string | null;
  onSubmit: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setName(initial);
      }}
    >
      <PopoverTrigger render={trigger} />
      <PopoverContent align="end" className="w-72" aria-label={title}>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit(name.trim());
            setOpen(false);
          }}
        >
          <label className="text-label-s" htmlFor="library-view-name">
            {title}
          </label>
          <Input id="library-view-name" value={name} maxLength={LIBRARY_VIEW_NAME_MAX} autoFocus placeholder="High priority fixes" onChange={(e) => setName(e.target.value)} />
          {error ? <p className="text-label-xs text-danger-text">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || pending}>
              <Check /> {submitLabel}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * What can happen to the settings on screen: nothing when they are a view's
 * own; once changed, back to the view (Reset), into the saved view it came
 * from (Save) or into a new one.
 */
export function ViewSaveControls({
  modified,
  savedViewName,
  canSave,
  pending,
  onReset,
  onSave,
  onSaveAs,
}: {
  modified: boolean;
  /** The saved view on screen; a built-in one cannot be overwritten. */
  savedViewName: string | null;
  canSave: boolean;
  pending?: boolean;
  onReset: () => void;
  onSave?: () => void;
  onSaveAs?: (name: string) => void;
}) {
  if (!modified) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw /> Reset
      </Button>
      {canSave && savedViewName && onSave ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={onSave}>
          <Save /> Save to “{savedViewName}”
        </Button>
      ) : null}
      {canSave && onSaveAs ? (
        <ViewNamePopover
          trigger={
            <Button variant={savedViewName ? 'ghost' : 'outline'} size="sm" disabled={pending}>
              <Save /> {savedViewName ? 'Save as new' : 'Save view'}
            </Button>
          }
          title="Save these filters as a view"
          submitLabel="Save view"
          pending={pending}
          onSubmit={onSaveAs}
        />
      ) : null}
    </span>
  );
}
