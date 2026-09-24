'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/button';

/**
 * Controlled pager. It knows how to describe a window of rows and nothing about
 * where the page number lives — the app binds `onPageChange` to the query
 * string in a thin wrapper.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  isPending,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isPending?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
      aria-label="Pagination"
      data-pending={isPending ? '' : undefined}
    >
      <span className="tabular-nums">
        <span className="font-medium text-foreground">
          {from}–{to}
        </span>{' '}
        of {total}
      </span>
      <div className="flex items-center gap-2">
        <span className="hidden tabular-nums sm:inline">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}
