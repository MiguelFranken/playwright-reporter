'use client';

import { Bookmark, Layers, MessageSquareWarning, MoreHorizontal, Pencil, RefreshCw, ScanEye, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/dropdown-menu';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import { describeViewConfig, LIBRARY_VIEW_NAME_MAX, type LibraryViewDef } from '../../lib/library-views';

const BUILT_IN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  all: Layers,
  feedback: MessageSquareWarning,
  'to-fix': Wrench,
  'to-verify': RefreshCw,
  'to-review': ScanEye,
};

/**
 * The library's views, as Linear lists them: the built-in ones every member
 * has — one per step of the review loop — and the person's own, each with
 * how many flows it shows. The one on screen is marked; a saved one can be
 * renamed in place or deleted from its menu.
 */
export function LibraryViewList({
  views,
  activeId,
  modified = false,
  counts,
  onSelect,
  onRename,
  onDelete,
  pendingId,
}: {
  views: readonly LibraryViewDef[];
  /** The view the settings on screen came from. */
  activeId: string | null;
  /** The settings on screen differ from that view's. */
  modified?: boolean;
  /** Flows each view shows, by id. */
  counts: Readonly<Record<string, number>>;
  onSelect: (view: LibraryViewDef) => void;
  onRename?: (view: LibraryViewDef, name: string) => void;
  onDelete?: (view: LibraryViewDef) => void;
  pendingId?: string | null;
}) {
  const builtIn = views.filter((v) => v.builtIn);
  const saved = views.filter((v) => !v.builtIn);
  const [renaming, setRenaming] = useState<string | null>(null);
  const row = (v: LibraryViewDef) => {
    if (renaming === v.id && onRename) {
      return (
        <li key={v.id}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
              if (name && name !== v.name) onRename(v, name);
              setRenaming(null);
            }}
          >
            <Input
              name="name"
              defaultValue={v.name}
              maxLength={LIBRARY_VIEW_NAME_MAX}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => setRenaming(null)}
              onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), setRenaming(null))}
              aria-label={`Rename the view ${v.name}`}
              className="h-8"
            />
          </form>
        </li>
      );
    }
    const Icon = v.builtIn ? (BUILT_IN_ICONS[v.id] ?? Layers) : Bookmark;
    const active = v.id === activeId;
    return (
      <li key={v.id} className="group/view relative">
        <button
          type="button"
          onClick={() => onSelect(v)}
          aria-current={active ? 'true' : undefined}
          title={v.description ?? describeViewConfig(v.config)}
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-body-m outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40',
            active ? 'bg-accent-subtle font-medium text-accent-text' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            pendingId === v.id && 'opacity-60',
            !v.builtIn && (onRename || onDelete) && 'pe-8',
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{v.name}</span>
          {active && modified ? <span className="size-1.5 shrink-0 rounded-full bg-accent-solid" title="Changed since it was saved" aria-label="changed" role="img" /> : null}
          <span className="text-code-s tabular-nums">{formatNumber(counts[v.id] ?? 0)}</span>
        </button>
        {!v.builtIn && (onRename || onDelete) ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for the view ${v.name}`}
                  className="absolute top-1.5 right-1 opacity-0 group-focus-within/view:opacity-100 group-hover/view:opacity-100 data-popup-open:opacity-100 pointer-coarse:opacity-100"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onRename ? (
                <DropdownMenuItem onClick={() => setRenaming(v.id)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
              ) : null}
              {onDelete ? (
                <DropdownMenuItem variant="destructive" onClick={() => onDelete(v)}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </li>
    );
  };
  return (
    <nav aria-label="Views" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="px-2 text-label-xs text-muted-foreground uppercase">Views</h2>
        <ul className="flex flex-col gap-px">{builtIn.map(row)}</ul>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="px-2 text-label-xs text-muted-foreground uppercase">Your views</h2>
        {saved.length ? (
          <ul className="flex flex-col gap-px">{saved.map(row)}</ul>
        ) : (
          <p className="px-2 text-label-xs text-pretty text-muted-foreground">Filter or regroup the flows, then save the result as a view of your own.</p>
        )}
      </div>
    </nav>
  );
}
