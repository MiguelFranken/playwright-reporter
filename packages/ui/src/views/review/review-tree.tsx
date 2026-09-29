'use client';

import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FileCode2, Folder, FolderOpen, Layers } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { ToggleGroup, ToggleGroupItem } from '../../components/toggle-group';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { REVIEW_GROUPING_LABELS, REVIEW_GROUPINGS, UNLINKED_FOLDER, type ReviewFolder, type ReviewGrouping } from '../../lib/review';

function allIds(folders: readonly ReviewFolder[]): string[] {
  return folders.flatMap((f) => (f.children.length ? [f.id, ...allIds(f.children)] : []));
}

/** Opens the first level and the path to the selected folder, as the Test Cases tree does. */
function initiallyOpen(folders: readonly ReviewFolder[], selected: string | null): Set<string> {
  const open = new Set(folders.filter((f) => f.children.length).map((f) => f.id));
  if (selected) {
    const parts = selected.split(' / ');
    for (let i = 1; i <= parts.length; i++) open.add(parts.slice(0, i).join(' / '));
  }
  return open;
}

/**
 * The folders a storyboard is browsed by: the test case suites the flows'
 * tests are linked to, or their spec files. Folders open and close like the
 * Test Cases tree. In review, each folder says how many images below it still
 * need review, so the tree is also the to-do list; in the library it counts
 * the screens.
 */
export function ReviewTree({
  folders,
  selected,
  onSelect,
  grouping,
  onGroupingChange,
  total,
  needsReview,
  showNeedsReview = true,
  allLabel = 'All flows',
}: {
  folders: readonly ReviewFolder[];
  /** The selected folder's id, or `null` for everything. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  grouping: ReviewGrouping;
  onGroupingChange: (next: ReviewGrouping) => void;
  total: number;
  needsReview: number;
  /** Off in the library, where nothing waits for a decision. */
  showNeedsReview?: boolean;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(() => initiallyOpen(folders, selected));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandable = allIds(folders);
  const allOpen = expandable.length > 0 && expandable.every((id) => open.has(id));

  return (
    <nav aria-label="Folders" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[grouping]}
          onValueChange={(v) => {
            if (!v[0]) return;
            onGroupingChange(v[0] as ReviewGrouping);
            setOpen(new Set());
          }}
          aria-label="Group by"
          className="min-w-0 flex-1"
        >
          {REVIEW_GROUPINGS.map((g) => (
            <ToggleGroupItem key={g} value={g} className="flex-1" title={g === 'suite' ? 'Group by test case suite' : 'Group by spec file'}>
              {REVIEW_GROUPING_LABELS[g]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {expandable.length ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={allOpen ? 'Collapse all folders' : 'Expand all folders'}
            title={allOpen ? 'Collapse all' : 'Expand all'}
            onClick={() => setOpen(allOpen ? new Set() : new Set(expandable))}
          >
            {allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-px">
        <li>
          <RowButton depth={0} active={selected === null} onClick={() => onSelect(null)} title={allLabel}>
            <span className="size-6 shrink-0" />
            <Layers className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{allLabel}</span>
            <Count total={total} needsReview={showNeedsReview ? needsReview : 0} />
          </RowButton>
        </li>
        {folders.map((f) => (
          <Branch key={f.id} folder={f} depth={0} selected={selected} onSelect={onSelect} grouping={grouping} open={open} onToggle={toggle} showNeedsReview={showNeedsReview} />
        ))}
      </ul>
    </nav>
  );
}

function Branch({
  folder,
  depth,
  selected,
  onSelect,
  grouping,
  open,
  onToggle,
  showNeedsReview,
}: {
  folder: ReviewFolder;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
  grouping: ReviewGrouping;
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  showNeedsReview: boolean;
}) {
  const active = selected === folder.id;
  const hasChildren = folder.children.length > 0;
  const isOpen = hasChildren && open.has(folder.id);
  const isFile = grouping === 'file' ? !hasChildren : folder.path[0] === UNLINKED_FOLDER && folder.path.length > 1;
  const Icon = isFile ? FileCode2 : isOpen ? FolderOpen : Folder;
  const muted = folder.name === UNLINKED_FOLDER;
  return (
    <li>
      <div
        className={cn(
          'flex h-8 items-center gap-1 rounded-md pe-2 text-body-m transition-colors',
          active ? 'bg-accent-subtle font-medium text-accent-text' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        )}
        style={{ paddingInlineStart: depth * 14 + 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${folder.name}`}
            aria-expanded={isOpen}
            onClick={() => onToggle(folder.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          aria-current={active ? 'true' : undefined}
          title={folder.name}
          className={cn('flex h-full min-w-0 flex-1 items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40', muted && !active && 'italic')}
        >
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <Count total={folder.total} needsReview={showNeedsReview ? folder.needsReview : 0} />
        </button>
      </div>
      {isOpen ? (
        <ul className="flex flex-col gap-px">
          {folder.children.map((c) => (
            <Branch key={c.id} folder={c} depth={depth + 1} selected={selected} onSelect={onSelect} grouping={grouping} open={open} onToggle={onToggle} showNeedsReview={showNeedsReview} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RowButton({ depth, active, onClick, title, children }: { depth: number; active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      title={title}
      className={cn(
        'flex h-8 w-full items-center gap-1 rounded-md pe-2 text-left text-body-m outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 [&>svg]:me-1',
        active ? 'bg-accent-subtle font-medium text-accent-text' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      style={{ paddingInlineStart: depth * 14 + 4 }}
    >
      {children}
    </button>
  );
}

function Count({ total, needsReview }: { total: number; needsReview: number }) {
  return needsReview ? (
    <span className="rounded-full bg-warning-subtle px-1.5 text-label-xs text-warning-text tabular-nums" title={`${needsReview} of ${total} images need review`}>
      {formatNumber(needsReview)}
    </span>
  ) : (
    <span className="text-code-s text-muted-foreground tabular-nums" title={`${total} images`}>
      {formatNumber(total)}
    </span>
  );
}
