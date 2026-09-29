import { Skeleton } from '@miguelfranken/ui/components/skeleton';

/** What a case page shows while its data streams in. */
export function CaseSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}
