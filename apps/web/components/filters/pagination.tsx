'use client';

import { Pagination } from '@miguelfranken/ui/patterns/pagination';
import { useUrlParams } from './url-filters';

/** Binds the presentational pager to the `page` search param. */
export function UrlPagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set, isPending } = useUrlParams();
  return (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      isPending={isPending}
      onPageChange={(next) => set({ page: String(next) }, { keepPage: true })}
    />
  );
}

export { UrlPagination as Pagination };
