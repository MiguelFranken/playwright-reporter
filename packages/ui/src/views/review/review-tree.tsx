'use client';

import { Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, FileCode2, Filter, Folder, FolderOpen, Layers, MessageSquare, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '../../components/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/dialog';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '../../components/dropdown-menu';
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

/** A folder of the tree, or everything (`id: null`), as its context menu is asked about it. */
export interface FolderMenuTarget {
  id: string | null;
  name: string;
}

/** Something to do with every screen in a folder, offered when the folder is right-clicked. */
export interface FolderAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Asked before `onSelect`: a bulk decision is not undone with a click. */
  confirm?: { title: string; description: string; action: string };
}

/** What a folder's approval covers: the screens that still need review, and how many flows they are in. */
export interface FolderApproval {
  captureIds: readonly string[];
  flows: number;
}

/**
 * Approving what in a folder still needs review, asked first; disabled while
 * any of it is being decided. Counted in flows, as the tree counts: the
 * screens and variants inside them are the detail, not the size of the task.
 */
export function approveFolderAction(target: FolderMenuTarget, approval: FolderApproval, onApprove: (ids: string[]) => void, pending: ReadonlySet<string>): FolderAction {
  const n = approval.captureIds.length ? Math.max(1, approval.flows) : 0;
  const flows = `${n} ${n === 1 ? 'flow' : 'flows'}`;
  return {
    key: 'approve',
    label: n ? `Approve ${flows}` : 'Nothing to approve',
    icon: Check,
    disabled: n === 0 || approval.captureIds.some((id) => pending.has(id)),
    onSelect: () => onApprove([...approval.captureIds]),
    confirm: {
      title: `Approve ${flows}?`,
      description: `Every screen that still needs review in ${target.id === null ? `the ${flows} shown` : `the ${flows} in “${target.name}”`} becomes the approved baseline, as it is now.`,
      action: `Approve ${flows}`,
    },
  };
}

/**
 * The folders a storyboard is browsed by: the test case suites the flows'
 * tests are linked to, or their spec files. Folders open and close like the
 * Test Cases tree. Each folder counts the flows below it — in review, how many
 * of them still need review, so the tree is also the to-do list. In the
 * library the counts follow the filters (`counts`), and a folder they leave
 * empty stays in place, quieter, so the tree keeps its shape. Without
 * `onGroupingChange` the grouping is fixed (the library's view decides it)
 * and the tree names it instead of offering the switch.
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
  title,
  attention,
  counts,
  folderActions,
  className,
}: {
  folders: readonly ReviewFolder[];
  /** The selected folder's id, or `null` for everything. */
  selected: string | null;
  onSelect: (id: string | null) => void;
  grouping: ReviewGrouping;
  /** Absent when something else decides the grouping: the tree then shows `title`. */
  onGroupingChange?: (next: ReviewGrouping) => void;
  /** The heading shown instead of the switch. */
  title?: string;
  total: number;
  needsReview: number;
  /** Off in the library, where nothing waits for a decision. */
  showNeedsReview?: boolean;
  allLabel?: string;
  /** In the library: open comments below each folder by id (`''` for all), shown beside the flow count. */
  attention?: ReadonlyMap<string, number>;
  /**
   * Flows below each folder by id (`''` for all) that pass the filters on
   * screen, in place of each folder's own count; a folder without any is
   * quieter.
   */
  counts?: ReadonlyMap<string, number>;
  /**
   * What a right-click on a folder (or on everything) offers, besides showing
   * it and opening or closing what is below it. Absent, the rows have no menu.
   */
  folderActions?: (target: FolderMenuTarget) => readonly FolderAction[];
  className?: string;
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
  const [confirming, setConfirming] = useState<FolderAction | null>(null);
  const menu: MenuFor | undefined = folderActions
    ? (target, below) => (
        <FolderMenu
          target={target}
          actions={folderActions(target)}
          onShow={() => onSelect(target.id)}
          below={below}
          onOpenBelow={(openBelow) =>
            setOpen((prev) => {
              const next = new Set(prev);
              for (const id of below) if (openBelow) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          allOpen={below.length > 0 && below.every((id) => open.has(id))}
          onRun={(a) => (a.confirm ? setConfirming(a) : a.onSelect())}
        />
      )
    : undefined;

  return (
    <nav aria-label="Folders" className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-center gap-1">
        {onGroupingChange ? (
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
        ) : (
          <h2 className="min-w-0 flex-1 truncate px-2 text-label-xs text-muted-foreground uppercase">{title ?? REVIEW_GROUPING_LABELS[grouping]}</h2>
        )}
        {expandable.length ? (
          <Button
            variant="ghost"
            size={onGroupingChange ? 'icon-sm' : 'icon-xs'}
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
          <WithMenu menu={menu?.({ id: null, name: allLabel }, expandable)}>
            <RowButton depth={0} active={selected === null} onClick={() => onSelect(null)} title={allLabel}>
              <span className="size-6 shrink-0" />
              <Layers className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{allLabel}</span>
              <Count total={counts?.get('') ?? total} needsReview={showNeedsReview ? needsReview : 0} comments={attention?.get('') ?? 0} />
            </RowButton>
          </WithMenu>
        </li>
        {folders.map((f) => (
          <Branch key={f.id} folder={f} depth={0} selected={selected} onSelect={onSelect} grouping={grouping} open={open} onToggle={toggle} showNeedsReview={showNeedsReview} attention={attention} counts={counts} menu={menu} />
        ))}
      </ul>
      <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirming?.confirm?.title}</DialogTitle>
            <DialogDescription>{confirming?.confirm?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                confirming?.onSelect();
                setConfirming(null);
              }}
            >
              {confirming?.confirm?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  attention,
  counts,
  menu,
}: {
  folder: ReviewFolder;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
  grouping: ReviewGrouping;
  open: ReadonlySet<string>;
  onToggle: (id: string) => void;
  showNeedsReview: boolean;
  attention?: ReadonlyMap<string, number>;
  counts?: ReadonlyMap<string, number>;
  menu?: MenuFor;
}) {
  const active = selected === folder.id;
  const hasChildren = folder.children.length > 0;
  const isOpen = hasChildren && open.has(folder.id);
  const isFile = grouping === 'file' ? !hasChildren : folder.path[0] === UNLINKED_FOLDER && folder.path.length > 1;
  const Icon = isFile ? FileCode2 : isOpen ? FolderOpen : Folder;
  const muted = folder.name === UNLINKED_FOLDER;
  const total = counts ? (counts.get(folder.id) ?? 0) : folder.total;
  return (
    <li>
      <WithMenu menu={menu?.({ id: folder.id, name: folder.name }, hasChildren ? [folder.id, ...allIds(folder.children)] : [])}>
      <div
        className={cn(
          'flex h-8 items-center gap-1 rounded-md pe-2 text-body-m transition-colors',
          active ? 'bg-accent-subtle font-medium text-accent-text' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground in-data-popup-open:bg-muted/60 in-data-popup-open:text-foreground',
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
          {/* Nothing below passes the filters: the folder stays where it is, its icon faded (the text keeps its contrast). */}
          <Icon className={cn('size-4 shrink-0', total === 0 && 'opacity-40')} />
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <Count total={total} needsReview={showNeedsReview ? folder.needsReview : 0} comments={attention?.get(folder.id) ?? 0} />
        </button>
      </div>
      </WithMenu>
      {isOpen ? (
        <ul className="flex flex-col gap-px">
          {folder.children.map((c) => (
            <Branch key={c.id} folder={c} depth={depth + 1} selected={selected} onSelect={onSelect} grouping={grouping} open={open} onToggle={onToggle} showNeedsReview={showNeedsReview} attention={attention} counts={counts} menu={menu} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The menu of a row, given the ids of the folders below it (with its own) that can open. */
type MenuFor = (target: FolderMenuTarget, below: readonly string[]) => React.ReactNode;

function WithMenu({ menu, children }: { menu: React.ReactNode; children: React.ReactNode }) {
  if (!menu) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger className="rounded-md">{children}</ContextMenuTrigger>
      {menu}
    </ContextMenu>
  );
}

function FolderMenu({
  target,
  actions,
  onShow,
  below,
  allOpen,
  onOpenBelow,
  onRun,
}: {
  target: FolderMenuTarget;
  actions: readonly FolderAction[];
  onShow: () => void;
  below: readonly string[];
  allOpen: boolean;
  onOpenBelow: (open: boolean) => void;
  onRun: (action: FolderAction) => void;
}) {
  return (
    <ContextMenuContent aria-label={`Actions for ${target.name}`}>
      <DropdownMenuLabel className="max-w-64 truncate">{target.name}</DropdownMenuLabel>
      {actions.map((a) => (
        <DropdownMenuItem key={a.key} disabled={a.disabled} onClick={() => onRun(a)}>
          {a.icon ? <a.icon /> : null}
          {a.label}
        </DropdownMenuItem>
      ))}
      {actions.length ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem onClick={onShow}>
        <Filter /> {target.id === null ? 'Show everything' : 'Show only this folder'}
      </DropdownMenuItem>
      {below.length ? (
        <DropdownMenuItem onClick={() => onOpenBelow(!allOpen)}>
          {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />} {allOpen ? 'Collapse everything below' : 'Expand everything below'}
        </DropdownMenuItem>
      ) : null}
    </ContextMenuContent>
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

const flowsLabel = (n: number) => `${formatNumber(n)} ${n === 1 ? 'flow' : 'flows'}`;

/** A folder's flows, and beside them what waits: open comments in the library, flows to review in a run. */
function Count({ total, needsReview, comments = 0 }: { total: number; needsReview: number; comments?: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {comments ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-1.5 text-label-xs text-accent-text tabular-nums" title={`${comments} open ${comments === 1 ? 'comment' : 'comments'}`}>
          <MessageSquare aria-hidden className="size-3" />
          {formatNumber(comments)}
        </span>
      ) : null}
      {needsReview ? (
        <span className="rounded-full bg-warning-subtle px-1.5 text-label-xs text-warning-text tabular-nums" title={`${needsReview} of ${flowsLabel(total)} need review`}>
          {formatNumber(needsReview)}
        </span>
      ) : (
        <span className="text-code-s tabular-nums" title={flowsLabel(total)}>
          {formatNumber(total)}
        </span>
      )}
    </span>
  );
}
