'use client';

import { Bot, History, MessageSquare, MessagesSquare } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/button';
import { SegmentedControl } from '../../components/segmented-control';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../components/sheet';
import { LibraryStateChip } from '../../patterns/library-state-chip';
import { ProfileAvatar } from '../../patterns/profile-avatar';
import { cn } from '../../lib/cn';
import { formatRelative } from '../../lib/format';
import { flowPriority } from '../../lib/library-views';
import { checkpointLabel, type ReviewFlowView } from '../../lib/review';
import { commentAuthorName, isAgentComment, openingComment, replies, type ReviewThreadView } from '../../lib/review-threads';
import type { CasePriority } from '../../lib/test-cases';
import { PriorityIcon } from '../test-cases/case-badges';

/** An open thread and where it is: what the inbox lists, and what opening it needs. */
export interface InboxItem {
  thread: ReviewThreadView;
  flow: ReviewFlowView;
  checkpointId: string;
  checkpointLabel: string;
  variant: string;
  priority: CasePriority;
}

const PRIORITY_RANK: Record<CasePriority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

/** Every open thread of the flows, most recently active first within each priority. */
export function inboxItems(flows: readonly ReviewFlowView[]): InboxItem[] {
  const seen = new Set<string>();
  const out: InboxItem[] = [];
  for (const flow of flows) {
    const priority = flowPriority(flow);
    for (const cp of flow.checkpoints)
      for (const cap of cp.captures)
        for (const thread of cap.threads ?? []) {
          if (thread.status !== 'open' || seen.has(thread.id)) continue;
          seen.add(thread.id);
          out.push({ thread, flow, checkpointId: cp.id, checkpointLabel: checkpointLabel(cp.name, cp.title), variant: cap.variant, priority });
        }
  }
  const lastActivity = (t: ReviewThreadView) => t.comments.at(-1)?.at ?? t.createdAt;
  return out.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || lastActivity(b.thread).localeCompare(lastActivity(a.thread)));
}

type InboxFilter = 'all' | 'waiting' | 'verify';

/**
 * Every open comment of the flows on screen in one list, so nobody has to
 * find them screen by screen: what still waits for a change, and what was
 * made on an earlier version and is ready to verify. A row opens the viewer
 * at its pin.
 */
export function FeedbackInbox({
  open,
  onOpenChange,
  flows,
  now,
  onOpenThread,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flows: readonly ReviewFlowView[];
  now?: Date;
  onOpenThread: (item: InboxItem) => void;
}) {
  const items = useMemo(() => inboxItems(flows), [flows]);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const waiting = items.filter((i) => i.thread.placement === 'exact').length;
  const verify = items.length - waiting;
  const shown = items.filter((i) => filter === 'all' || (filter === 'waiting' ? i.thread.placement === 'exact' : i.thread.placement === 'outdated'));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="gap-3 border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2">
            <MessagesSquare className="size-4" /> Open feedback
          </SheetTitle>
          <SheetDescription>
            {items.length ? `${items.length} open ${items.length === 1 ? 'comment' : 'comments'} on the flows shown. Nothing resolves on its own: resolve each once it is done.` : 'No open comments on the flows shown.'}
          </SheetDescription>
          {items.length ? (
            <SegmentedControl
              aria-label="Show"
              value={filter}
              onValueChange={(v) => setFilter(v as InboxFilter)}
              className="w-full [&>button]:flex-1"
              items={[
                { value: 'all', label: `All ${items.length}`, 'aria-label': `All, ${items.length}` },
                { value: 'waiting', label: `Waiting ${waiting}`, 'aria-label': `Waiting for changes, ${waiting}` },
                { value: 'verify', label: `To verify ${verify}`, 'aria-label': `Ready to verify, ${verify}` },
              ]}
            />
          ) : null}
        </SheetHeader>
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Open comments">
          {shown.map((item) => {
            const first = openingComment(item.thread);
            const answers = replies(item.thread).length;
            const outdated = item.thread.placement === 'outdated';
            return (
              <li key={item.thread.id}>
                <button
                  type="button"
                  onClick={() => onOpenThread(item)}
                  className="flex w-full gap-2.5 rounded-lg p-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full rounded-bl-[3px] px-1 text-label-xs tabular-nums',
                      outdated ? 'bg-surface text-accent-text outline-2 outline-dashed outline-accent-solid -outline-offset-2' : 'bg-accent-solid text-accent-on-solid',
                    )}
                  >
                    {item.thread.number}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-label-xs text-muted-foreground">
                      {first && isAgentComment(first) ? (
                        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-on-solid">
                          <Bot className="size-2.5" />
                        </span>
                      ) : (
                        <ProfileAvatar name={commentAuthorName(first)} image={first?.author?.image} size="sm" className="size-4" fallbackClassName="text-[8px]" />
                      )}
                      <span className="truncate text-label-s text-foreground">{commentAuthorName(first)}</span>
                      {first && isAgentComment(first) ? <span className="shrink-0">agent</span> : null}
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{formatRelative(first?.at ?? item.thread.createdAt, { now })}</span>
                    </span>
                    <span className="line-clamp-2 text-sm text-pretty break-words">{first?.body ?? ''}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-xs text-muted-foreground">
                      {item.priority !== 'none' ? <PriorityIcon priority={item.priority} className="[&_svg]:size-3.5" /> : null}
                      <span className="min-w-0 truncate">
                        {item.flow.title} › {item.checkpointLabel} · <span className="capitalize">{item.variant}</span>
                      </span>
                      {outdated ? (
                        <span className="inline-flex items-center gap-1 text-info-text">
                          <History aria-hidden className="size-3" /> Changed since {item.thread.originRunNumber ? `#${item.thread.originRunNumber}` : 'the comment'}
                        </span>
                      ) : null}
                      {answers ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare aria-hidden className="size-3" /> {answers}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {items.length && !shown.length ? <li className="p-4 text-center text-label-s text-muted-foreground">Nothing here.</li> : null}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

/** The button that opens the inbox, with what is in it. */
export function FeedbackInboxButton({ flows, onClick }: { flows: readonly ReviewFlowView[]; onClick: () => void }) {
  const items = useMemo(() => inboxItems(flows), [flows]);
  const verify = items.filter((i) => i.thread.placement === 'outdated').length;
  return (
    <Button variant="outline" size="sm" onClick={onClick} aria-label={`Open feedback: ${items.length} open ${items.length === 1 ? 'comment' : 'comments'}${verify ? `, ${verify} to verify` : ''}`}>
      <MessagesSquare /> Feedback
      <span className="rounded-full bg-muted px-1.5 text-label-xs tabular-nums">{items.length}</span>
      {verify ? <LibraryStateChip state="verify" iconOnly className="[&_svg]:size-3.5" /> : null}
    </Button>
  );
}
