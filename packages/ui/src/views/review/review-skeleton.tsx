import { Skeleton } from '../../components/skeleton';

/** The storyboard's placeholder: a toolbar and two rows of frames. */
export function ReviewStoryboardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-full max-w-xl rounded-xl" />
        <Skeleton className="h-8 w-72" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Skeleton className="size-5 rounded-full" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="flex gap-4 p-4">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="flex gap-2">
                <Skeleton className="h-35 w-62" />
                <Skeleton className="h-35 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
