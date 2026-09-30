'use client';

import { ListFilter, RotateCcw, Save, SlidersHorizontal, X } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/dropdown-menu';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../../components/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/select';
import { Separator } from '../../components/separator';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { LIBRARY_STATE_ICONS } from '../../patterns/library-state-chip';
import { cn } from '../../lib/cn';
import {
  activeFilterCount,
  DEFAULT_LIBRARY_VIEW,
  LIBRARY_FOLDER_LABELS,
  LIBRARY_FOLDERS,
  LIBRARY_FOLDERS_LABELS,
  LIBRARY_GROUPING_LABELS,
  LIBRARY_GROUPINGS,
  LIBRARY_SORT_LABELS,
  LIBRARY_SORTS,
  LIBRARY_STATE_LABELS,
  LIBRARY_STATE_TONES,
  LIBRARY_STATES,
  type LibraryCounts,
  type LibraryFolders,
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
    <span key={key} className="inline-flex h-8 min-w-0 items-center gap-1 rounded-lg border border-border bg-surface pl-2 text-label-s shadow-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 max-w-64 truncate" title={values}>
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

/** One setting of a view: its name on the left, its control on the right, as Linear's display options lay them out. */
function SettingRow({ label, htmlFor, id, children }: { label: string; htmlFor?: string; id?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      {htmlFor ? (
        <label htmlFor={htmlFor} id={id} className="text-label-s text-muted-foreground">
          {label}
        </label>
      ) : (
        <span id={id} className="text-label-s text-muted-foreground">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function SettingSelect<T extends string>({ id, value, items, onChange }: { id: string; value: T; items: readonly { value: T; label: string }[]; onChange: (next: T) => void }) {
  return (
    <Select items={items as { value: T; label: string }[]} value={value} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger id={id} size="sm" className="w-44 text-label-s">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * How a view lays its flows out: which folders it browses by (test case
 * suites or spec files), how it sections and orders them, and which variant
 * it shows. The Display panel and the view builder both edit these.
 */
export function ViewLayoutFields({ config, onChange, variants }: { config: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void; variants: readonly string[] }) {
  const id = useId();
  const groupItems = LIBRARY_GROUPINGS.map((g) => ({ value: g, label: g === 'folder' ? `${LIBRARY_FOLDER_LABELS[config.folders]}` : LIBRARY_GROUPING_LABELS[g] }));
  const sortItems = LIBRARY_SORTS.map((s) => ({ value: s, label: LIBRARY_SORT_LABELS[s] }));
  return (
    <div className="flex flex-col gap-2">
      <SettingRow label="Folders" id={`${id}-folders`}>
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[config.folders]}
          onValueChange={(v) => v[0] && onChange({ ...config, folders: v[0] as LibraryFolders })}
          aria-labelledby={`${id}-folders`}
        >
          {LIBRARY_FOLDERS.map((f) => (
            <ToggleGroupItem key={f} value={f}>
              {f === 'suite' ? 'Test cases' : 'Files'}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </SettingRow>
      <SettingRow label="Grouping" htmlFor={`${id}-group`}>
        <SettingSelect<LibraryGrouping> id={`${id}-group`} value={config.group} items={groupItems} onChange={(group) => onChange({ ...config, group })} />
      </SettingRow>
      <SettingRow label="Ordering" htmlFor={`${id}-sort`}>
        <SettingSelect<LibrarySort> id={`${id}-sort`} value={config.sort} items={sortItems} onChange={(sort) => onChange({ ...config, sort })} />
      </SettingRow>
      {variants.length > 1 ? (
        <SettingRow label="Variant" id={`${id}-variant`}>
          <LibraryVariantToggle variants={variants} value={config.variant} onChange={(variant) => onChange({ ...config, variant })} labelledBy={`${id}-variant`} />
        </SettingRow>
      ) : null}
    </div>
  );
}

/** Whether a view lays its flows out differently from the library's default. */
const layoutChanged = (c: LibraryViewConfig) => c.folders !== DEFAULT_LIBRARY_VIEW.folders || c.group !== DEFAULT_LIBRARY_VIEW.group || c.sort !== DEFAULT_LIBRARY_VIEW.sort || c.variant !== null;

/**
 * The Display panel: the view's folders, grouping, order and variant, and
 * (as `children`) how large the screens are — everything about how the flows
 * look, behind one button, so the toolbar stays one line.
 */
export function LibraryDisplayMenu({ config, onChange, variants = [], children }: { config: LibraryViewConfig; onChange: (next: LibraryViewConfig) => void; variants?: readonly string[]; children?: React.ReactNode }) {
  const summary = [LIBRARY_FOLDERS_LABELS[config.folders], config.group === 'folder' ? null : `grouped by ${LIBRARY_GROUPING_LABELS[config.group]}`, LIBRARY_SORT_LABELS[config.sort], config.variant]
    .filter(Boolean)
    .join(', ')
    .toLowerCase();
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={`Display: ${summary}`} />}>
        <SlidersHorizontal /> Display
        {layoutChanged(config) ? <span aria-hidden className="size-1.5 rounded-full bg-accent-solid" /> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[22rem] flex-col gap-3">
        {/* The Display button right beside the panel already names it. */}
        <PopoverTitle className="sr-only">Display</PopoverTitle>
        <ViewLayoutFields config={config} onChange={onChange} variants={variants} />
        {children ? (
          <>
            <Separator />
            <SettingRow label="Screen size">{children}</SettingRow>
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** Every variant side by side, or one. */
export function LibraryVariantToggle({ variants, value, onChange, labelledBy }: { variants: readonly string[]; value: string | null; onChange: (next: string | null) => void; labelledBy?: string }) {
  if (variants.length < 2) return null;
  return (
    <ToggleGroup
      variant="segment"
      size="sm"
      value={[value ?? 'all']}
      onValueChange={(v) => v[0] && onChange(v[0] === 'all' ? null : String(v[0]))}
      {...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': 'Variant' })}
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      {variants.map((v) => (
        <ToggleGroupItem key={v} value={v} className="capitalize">
          {v}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * What can happen to the settings on screen: nothing when they are a view's
 * own; once changed, back to the view (Reset), into the saved view it came
 * from (Save) or into a new one (which opens the view builder).
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
  onSaveAs?: () => void;
}) {
  if (!modified) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw /> Reset
      </Button>
      {canSave && savedViewName && onSave ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={onSave}>
          <Save /> Save to “{savedViewName}”
        </Button>
      ) : null}
      {canSave && onSaveAs ? (
        <Button variant={savedViewName ? 'ghost' : 'outline'} size="sm" disabled={pending} onClick={onSaveAs}>
          <Save /> {savedViewName ? 'Save as new' : 'Save view'}
        </Button>
      ) : null}
    </span>
  );
}
