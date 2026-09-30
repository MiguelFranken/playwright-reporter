'use client';

import { Bot, CircleCheck, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/dropdown-menu';
import { cn } from '../lib/cn';
import { formatDateTime, formatRelative } from '../lib/format';
import { commentAuthorName, DEFAULT_AGENT_NAME, isAgentComment, type ReviewCommentView } from '../lib/review-threads';
import { CommentComposer } from './comment-composer';
import { ProfileAvatar } from './profile-avatar';

const SOURCE_LABELS = { mcp: 'via AI assistant', api: 'via API' } as const;

/** An agent's avatar: a robot, with the person it acted for tucked in at its corner. */
function AgentAvatar({ person }: { person: ReviewCommentView['author'] | null }) {
  return (
    <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-on-solid" aria-hidden>
      <Bot className="size-3.5" />
      {person ? (
        <ProfileAvatar name={person.name} image={person.image} size="sm" className="absolute -right-1.5 -bottom-1.5 size-3.5! ring-2 ring-surface after:hidden" fallbackClassName="text-[6px]" />
      ) : null}
    </span>
  );
}

/**
 * One comment of a thread: who, when, where from (an AI assistant, the API),
 * and what. A comment an AI agent wrote is the agent's — its name, a robot
 * for an avatar and an "Agent" badge — with the person whose access it used
 * beside it, so nobody mistakes it for that person's own words. The author may edit it and anyone allowed may delete it; both
 * come in as callbacks. A resolve or reopen event renders as a quiet line.
 */
export function CommentItem({
  comment,
  now,
  canEdit = false,
  canDelete = false,
  onEdit,
  onDelete,
  className,
}: {
  comment: ReviewCommentView;
  /** The reference instant for relative times (stories pin it). */
  now?: Date;
  canEdit?: boolean;
  canDelete?: boolean;
  onEdit?: (body: string) => void;
  onDelete?: () => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const name = commentAuthorName(comment);
  const agent = isAgentComment(comment);
  // The person an agent acted for, when it is not simply the agent itself.
  const onBehalfOf = agent && comment.author ? comment.author : null;
  const when = formatRelative(comment.at, { now });

  if (comment.kind !== 'comment') {
    const Icon = comment.kind === 'resolved' ? CircleCheck : RotateCcw;
    return (
      <p className={cn('flex items-center gap-1.5 text-label-xs text-muted-foreground', className)}>
        <Icon aria-hidden className="size-3.5" />
        <span>
          {name}
          {agent ? ' (agent)' : ''} {comment.kind === 'resolved' ? 'resolved this' : 'reopened this'} ·{' '}
          <time dateTime={comment.at} title={formatDateTime(comment.at)}>
            {when}
          </time>
        </span>
      </p>
    );
  }

  const actions = (canEdit && onEdit) || (canDelete && onDelete);
  return (
    <article
      data-agent={agent || undefined}
      className={cn('group/comment flex animate-rise-in gap-2.5', agent && '-mx-1.5 rounded-lg bg-accent-subtle/60 px-1.5 py-1.5', comment.pending && 'opacity-70', className)}
      aria-label={agent ? `Comment by ${name}${name === DEFAULT_AGENT_NAME ? '' : ', an AI agent'}${onBehalfOf ? `, for ${onBehalfOf.name}` : ''}` : `Comment by ${name}`}
    >
      {agent ? (
        <AgentAvatar person={onBehalfOf} />
      ) : comment.author ? (
        <ProfileAvatar name={comment.author.name} image={comment.author.image} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Bot className="size-3.5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate text-label-s">{name}</span>
          {agent ? (
            <>
              <Badge variant="outline" className="h-4 gap-1 border-accent-border bg-surface px-1.5 text-label-xs text-accent-text">
                <Bot aria-hidden className="size-3" />
                Agent
              </Badge>
              {onBehalfOf ? <span className="truncate text-label-xs text-muted-foreground">for {onBehalfOf.name}</span> : null}
            </>
          ) : comment.source !== 'app' ? (
            <Badge variant="outline" className="h-4 gap-1 px-1.5 text-label-xs">
              {comment.source === 'mcp' ? <Bot aria-hidden className="size-3" /> : null}
              {SOURCE_LABELS[comment.source]}
            </Badge>
          ) : null}
          <time className="text-label-xs text-muted-foreground" dateTime={comment.at} title={formatDateTime(comment.at)}>
            {comment.pending ? 'Posting…' : when}
          </time>
          {comment.editedAt ? <span className="text-label-xs text-muted-foreground">· edited</span> : null}
          {actions && !comment.pending ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Comment actions, ${name}`}
                    className="ml-auto opacity-0 group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && onEdit ? <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem> : null}
                {canDelete && onDelete ? (
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </header>
        {editing ? (
          <CommentComposer
            label="Edit comment"
            initialValue={comment.body}
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={(body) => {
              setEditing(false);
              if (body !== comment.body) onEdit?.(body);
            }}
          />
        ) : (
          <p className="text-sm text-pretty break-words whitespace-pre-wrap">{comment.body}</p>
        )}
      </div>
    </article>
  );
}
