'use client';

import { useRef } from 'react';
import { Pagination } from '@miguelfranken/ui/patterns/pagination';
import { useUrlParams } from './url-filters';

/**
 * Binds the presentational pager to the `page` search param.
 *
 * The pager sits under the list it pages, so a page change brings the top of
 * that list back into view: the next page — and its skeleton while it loads —
 * starts there, not where the pager was. The list is taken to be whatever is
 * rendered just before the pager (or before the nearest box wrapping it).
 */
export function UrlPagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set, isPending } = useUrlParams();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="contents">
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        isPending={isPending}
        onPageChange={(next) => {
          let at: Element | null = ref.current;
          while (at && !at.previousElementSibling) at = at.parentElement;
          const list = at?.previousElementSibling;
          if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' });
          set({ page: String(next) }, { keepPage: true });
        }}
      />
    </div>
  );
}

export { UrlPagination as Pagination };
