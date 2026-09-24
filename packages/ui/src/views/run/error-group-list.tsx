'use client';

import * as React from 'react';
import { ArrowRight, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { Link } from '../../provider';
import { Badge } from '../../components/badge';
import { Button } from '../../components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/collapsible';
import { ErrorBlock } from '../../patterns/error-block';
import { MetaChip } from '../../patterns/meta-chip';
import { errorCategory, ERROR_CATEGORIES, type ErrorCategoryKey } from '../../lib/error-category';
import { firstLine } from '../../lib/ansi';
import { cn } from '../../lib/cn';
import { toneBadge, toneSolid } from '../../lib/tone';

/**
 * The interactive half of the errors tab: grouping, the expand-all switch and
 * the collapsibles.
 *
 * Its own client module because folding is state, while `RunErrors` above it
 * renders on the server. Each group therefore arrives with its two links
 * already resolved — a function cannot cross that boundary, a string can.
 */

export interface ErrorGroupItem {
  signature: string;
  message: string;
  count: number;
  failed: number;
  flaky: number;
  files: string[];
  /** A sample failing result of this group. */
  sampleHref: string;
  /** The run, filtered to this group. */
  groupHref: string;
}

export function ErrorGroupList({ groups }: { groups: ErrorGroupItem[] }) {
  // Undefined until the user asks, so each group keeps its own default.
  const [expandAll, setExpandAll] = React.useState<boolean | undefined>(undefined);

  const buckets = React.useMemo(() => {
    const byKey = new Map<ErrorCategoryKey, ErrorGroupItem[]>();
    for (const group of groups) {
      const key = errorCategory(group.message).key;
      const bucket = byKey.get(key);
      if (bucket) bucket.push(group);
      else byKey.set(key, [group]);
    }
    return ERROR_CATEGORIES.filter((c) => byKey.has(c.key)).map((category) => ({
      category,
      groups: [...(byKey.get(category.key) ?? [])].sort((a, b) => b.count - a.count),
    }));
  }, [groups]);

  const affected = groups.reduce((n, g) => n + g.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-body-s text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{groups.length}</span>{' '}
          {groups.length === 1 ? 'distinct error' : 'distinct errors'} across{' '}
          <span className="font-medium text-foreground">{affected}</span> {affected === 1 ? 'test' : 'tests'}, in{' '}
          {buckets.length} {buckets.length === 1 ? 'category' : 'categories'}
        </p>
        <Button variant="outline" size="sm" className="ms-auto" onClick={() => setExpandAll((v) => !v)} aria-pressed={expandAll === true}>
          {expandAll ? <ChevronsDownUp data-icon="inline-start" /> : <ChevronsUpDown data-icon="inline-start" />}
          {expandAll ? 'Collapse all' : 'Expand all'}
        </Button>
      </div>

      {buckets.map(({ category, groups: inCategory }) => {
        const tests = inCategory.reduce((n, g) => n + g.count, 0);
        return (
          <section key={category.key} className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full', toneSolid[category.tone])} aria-hidden />
              <span className="text-label-m">{category.groupLabel}</span>
              <span className="text-body-xs text-muted-foreground tabular-nums">
                {inCategory.length} {inCategory.length === 1 ? 'group' : 'groups'} · {tests} {tests === 1 ? 'test' : 'tests'}
              </span>
            </h2>
            <div className="flex flex-col gap-2">
              {inCategory.map((group) => (
                <ErrorGroupRow key={group.signature} group={group} tone={toneBadge[category.tone]} expandAll={expandAll} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ErrorGroupRow({ group, tone, expandAll }: { group: ErrorGroupItem; tone: string; expandAll?: boolean }) {
  const [open, setOpen] = React.useState(false);
  // A group follows the expand-all switch whenever it flips, and is free again
  // as soon as the user toggles this one group.
  React.useEffect(() => {
    if (expandAll !== undefined) setOpen(expandAll);
  }, [expandAll]);

  const headline = firstLine(group.message, 200) || '(no message)';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="panel overflow-hidden">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-start transition-colors duration-150 hover:bg-muted/50">
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', !open && '-rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-code-s" title={headline}>
          {headline}
        </span>
        {group.failed > 0 ? (
          <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-label-xs tabular-nums', tone)}>
            {group.failed} failed
          </Badge>
        ) : null}
        {group.flaky > 0 ? (
          <Badge variant="outline" className="h-5 shrink-0 border-warning-border bg-warning-subtle px-1.5 text-label-xs text-warning-text tabular-nums">
            {group.flaky} flaky
          </Badge>
        ) : null}
        <span className="shrink-0 text-body-xs text-muted-foreground tabular-nums">
          {group.count}× {group.count === 1 ? 'test' : 'tests'}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t border-separator p-3">
          <ErrorBlock message={group.message} lines={6} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-body-xs text-muted-foreground">Seen in</span>
            {group.files.slice(0, 3).map((f) => (
              <MetaChip key={f} title={f}>
                {f.split('/').pop() ?? f}
              </MetaChip>
            ))}
            {group.files.length > 3 ? <MetaChip>+{group.files.length - 3} more</MetaChip> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs">
            <Link href={group.sampleHref} className="text-muted-foreground hover:text-foreground hover:underline">
              Open a sample failure
            </Link>
            <Link href={group.groupHref} className="inline-flex items-center gap-1 font-medium hover:underline">
              Show the {group.count} affected {group.count === 1 ? 'test' : 'tests'}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
