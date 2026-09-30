'use client';

import { ArrowDown, ArrowUp, ChevronRight, ChevronsDownUp, ChevronsUpDown, Folder, FolderOpen, FolderPlus, Inbox, Layers, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/dropdown-menu';
import { cn } from '../../lib/cn';
import { formatNumber } from '../../lib/format';
import type { SuiteNode } from '../../lib/test-case-models';
import { MAX_SUITE_DEPTH } from '../../lib/test-cases';
import { Link } from '../../provider';

export interface SuiteTreeHrefs {
  all: string;
  unassigned: string;
  suite: (id: string) => string;
}

export interface SuiteTreeProps {
  roots: SuiteNode[];
  total: number;
  unassigned: number;
  /** `null` for every case, `'unassigned'`, or a suite id. */
  selected: string | null;
  hrefs: SuiteTreeHrefs;
  /** Shows the edit menus. The server checks again. */
  canEdit?: boolean;
  onNewSuite?: (parentId: string | null) => void;
  onEditSuite?: (suite: SuiteNode) => void;
  onDeleteSuite?: (suite: SuiteNode) => void;
  onMoveSuite?: (suite: SuiteNode, direction: 'up' | 'down') => void;
  /**
   * Takes a plain click on a row instead of following its link — for a host
   * that switches the list in place. `null` is every case. A modified click
   * (a new tab, a new window) still follows the link.
   */
  onSelect?: (selected: string | null) => void;
  /** The pointer rests on a row, or it takes focus: a host can load that list ahead of the click. */
  onIntent?: (selected: string | null) => void;
  className?: string;
}

type RowEvents = Pick<SuiteTreeProps, 'onSelect' | 'onIntent'>;

function rowEvents(value: string | null, { onSelect, onIntent }: RowEvents) {
  return {
    onClick: onSelect
      ? (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          onSelect(value);
        }
      : undefined,
    onPointerEnter: onIntent ? () => onIntent(value) : undefined,
    onFocus: onIntent ? () => onIntent(value) : undefined,
  };
}

function allIds(nodes: readonly SuiteNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...allIds(n.children)]);
}

/** Opens the first level, the path to the selected suite, and the selected suite itself. */
function initiallyOpen(roots: readonly SuiteNode[], selected: string | null): Set<string> {
  const open = new Set(roots.map((r) => r.id));
  const path = (nodes: readonly SuiteNode[], trail: string[]): string[] | null => {
    for (const n of nodes) {
      if (n.id === selected) return trail;
      const hit = path(n.children, [...trail, n.id]);
      if (hit) return hit;
    }
    return null;
  };
  for (const id of path(roots, []) ?? []) open.add(id);
  if (selected) open.add(selected);
  return open;
}

/**
 * The suite hierarchy as navigation: every row is a link to the cases of
 * that suite and all suites below it, with the count of that whole subtree.
 */
export function SuiteTree({
  roots,
  total,
  unassigned,
  selected,
  hrefs,
  canEdit = false,
  onNewSuite,
  onEditSuite,
  onDeleteSuite,
  onMoveSuite,
  onSelect,
  onIntent,
  className,
}: SuiteTreeProps) {
  const events = { onSelect, onIntent };
  const [open, setOpen] = useState(() => initiallyOpen(roots, selected));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const everything = allIds(roots);
  const allOpen = everything.every((id) => open.has(id));

  return (
    <nav aria-label="Suites" className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <span className="text-eyebrow text-muted-foreground">Suites</span>
        <div className="flex items-center gap-0.5">
          {everything.length ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={allOpen ? 'Collapse all suites' : 'Expand all suites'}
              title={allOpen ? 'Collapse all' : 'Expand all'}
              onClick={() => setOpen(allOpen ? new Set() : new Set(everything))}
            >
              {allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
            </Button>
          ) : null}
          {canEdit && onNewSuite ? (
            <Button variant="ghost" size="icon-sm" aria-label="New suite" title="New suite" onClick={() => onNewSuite(null)}>
              <FolderPlus className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="flex flex-col gap-px">
        <TreeLink href={hrefs.all} active={selected === null} icon={Layers} label="All test cases" count={total} depth={0} {...rowEvents(null, events)} />
        {roots.map((node, i) => (
          <SuiteItem
            key={node.id}
            node={node}
            first={i === 0}
            last={i === roots.length - 1}
            open={open}
            onToggle={toggle}
            selected={selected}
            hrefs={hrefs}
            canEdit={canEdit}
            onNewSuite={onNewSuite}
            onEditSuite={onEditSuite}
            onDeleteSuite={onDeleteSuite}
            onMoveSuite={onMoveSuite}
            events={events}
          />
        ))}
        <TreeLink href={hrefs.unassigned} active={selected === 'unassigned'} icon={Inbox} label="Unassigned" count={unassigned} depth={0} {...rowEvents('unassigned', events)} />
      </ul>

      {roots.length === 0 ? (
        <p className="px-2 pt-2 text-body-s text-muted-foreground">
          No suites yet. Suites group cases the way your product is built, up to {MAX_SUITE_DEPTH} levels deep.
        </p>
      ) : null}
    </nav>
  );
}

function TreeLink({
  href,
  active,
  icon: Icon,
  label,
  count,
  depth,
  ...events
}: ReturnType<typeof rowEvents> & {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  depth: number;
}) {
  return (
    <li>
      <Link
        href={href}
        {...events}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-8 items-center gap-2 rounded-md pe-2 text-body-m text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
          active && 'bg-accent-subtle font-medium text-accent-text hover:bg-accent-subtle hover:text-accent-text',
        )}
        style={{ paddingInlineStart: `${depth * 14 + 30}px` }}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-code-s tabular-nums text-muted-foreground">{formatNumber(count)}</span>
      </Link>
    </li>
  );
}

interface SuiteItemProps extends Pick<SuiteTreeProps, 'selected' | 'hrefs' | 'canEdit' | 'onNewSuite' | 'onEditSuite' | 'onDeleteSuite' | 'onMoveSuite'> {
  node: SuiteNode;
  first: boolean;
  last: boolean;
  open: Set<string>;
  onToggle: (id: string) => void;
  events: RowEvents;
}

function SuiteItem({ node, first, last, open, onToggle, selected, hrefs, canEdit, onNewSuite, onEditSuite, onDeleteSuite, onMoveSuite, events }: SuiteItemProps) {
  const isOpen = open.has(node.id);
  const active = selected === node.id;
  const hasChildren = node.children.length > 0;
  const Icon = isOpen && hasChildren ? FolderOpen : Folder;
  return (
    <li>
      <div
        className={cn(
          'group/suite flex h-8 items-center gap-1 rounded-md pe-1 text-body-m text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
          active && 'bg-accent-subtle font-medium text-accent-text hover:bg-accent-subtle hover:text-accent-text',
        )}
        style={{ paddingInlineStart: `${node.depth * 14 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
            aria-expanded={isOpen}
            onClick={() => onToggle(node.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <Link
          href={hrefs.suite(node.id)}
          {...rowEvents(node.id, events)}
          aria-current={active ? 'page' : undefined}
          title={node.description || node.name}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <Icon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="text-code-s tabular-nums text-muted-foreground">{formatNumber(node.totalCount)}</span>
        </Link>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${node.name}`}
                  className="opacity-0 group-hover/suite:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {onNewSuite ? (
                <DropdownMenuItem disabled={node.depth + 1 >= MAX_SUITE_DEPTH} onClick={() => onNewSuite(node.id)}>
                  <FolderPlus />
                  New sub-suite
                </DropdownMenuItem>
              ) : null}
              {onEditSuite ? (
                <DropdownMenuItem onClick={() => onEditSuite(node)}>
                  <Pencil />
                  Edit suite
                </DropdownMenuItem>
              ) : null}
              {onMoveSuite ? (
                <>
                  <DropdownMenuItem disabled={first} onClick={() => onMoveSuite(node, 'up')}>
                    <ArrowUp />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={last} onClick={() => onMoveSuite(node, 'down')}>
                    <ArrowDown />
                    Move down
                  </DropdownMenuItem>
                </>
              ) : null}
              {onDeleteSuite ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onDeleteSuite(node)}>
                    <Trash2 />
                    Delete suite
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {hasChildren && isOpen ? (
        <ul className="flex flex-col gap-px">
          {node.children.map((child, i) => (
            <SuiteItem
              key={child.id}
              node={child}
              first={i === 0}
              last={i === node.children.length - 1}
              open={open}
              onToggle={onToggle}
              selected={selected}
              hrefs={hrefs}
              canEdit={canEdit}
              onNewSuite={onNewSuite}
              onEditSuite={onEditSuite}
              onDeleteSuite={onDeleteSuite}
              onMoveSuite={onMoveSuite}
              events={events}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
