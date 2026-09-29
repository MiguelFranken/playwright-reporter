'use client';

import { Bot, CircleCheck, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/dropdown-menu';
import { cn } from '../lib/cn';
import { formatDateTime, formatRelative } from '../lib/format';
import type { ReviewCommentView } from '../lib/review-threads';
import { CommentComposer } from './comment-composer';
import { ProfileAvatar } from './profile-avatar';

const SOURCE_LABELS = { mcp: 'via AI assistant', api: 'via API' } as const;

/** Who wrote it, or who the tool acted for. */
function authorName(comment: ReviewCommentView) {
  return comment.author?.name ?? (comment.source === 'mcp' ? 'AI assistant' : 'Someone');
}

/**
 * One comment of a thread: who, when, where from (an AI assistant, the API),
 * and what. The author may edit it and anyone allowed may delete it; both
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
  const name = authorName(comment);
  const when = formatRelative(comment.at, { now });

  if (comment.kind !== 'comment') {
    const Icon = comment.kind === 'resolved' ? CircleCheck : RotateCcw;
    return (
      <p className={cn('flex items-center gap-1.5 text-label-xs text-muted-foreground', className)}>
        <Icon aria-hidden className="size-3.5" />
        <span>
          {name} {comment.kind === 'resolved' ? 'resolved this' : 'reopened this'} ·{' '}
          <time dateTime={comment.at} title={formatDateTime(comment.at)}>
            {when}
          </time>
        </span>
      </p>
    );
  }

  const actions = (canEdit && onEdit) || (canDelete && onDelete);
  return (
    <article className={cn('group/comment flex animate-rise-in gap-2.5', comment.pending && 'opacity-70', className)} aria-label={`Comment by ${name}`}>
      {comment.author ? (
        <ProfileAvatar name={comment.author.name} image={comment.author.image} size="sm" className="mt-0.5" />
      ) : (
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Bot className="size-3.5" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate text-label-s">{name}</span>
          {comment.source !== 'app' ? (
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
