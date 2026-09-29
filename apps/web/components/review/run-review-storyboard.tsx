'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Button } from '@miguelfranken/ui/components/button';
import type { ReviewDecisionInput } from '@miguelfranken/ui/lib/review';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { ReviewStoryboardSkeleton } from '@miguelfranken/ui/views/review/review-skeleton';
import { ImageOff } from 'lucide-react';
import { UrlReviewStoryboard } from '@/components/review/url-review-storyboard';
import { applyDecision } from '@/lib/review/patch-flows';
import type { RunReviewData } from '@/lib/review/run-flows';
import { orpc } from '@/lib/rpc/client';
import { runReviewQuery } from '@/lib/rpc/queries';

/**
 * A run's storyboard, read from its query: the page renders the answer on the
 * server into the cache, so the first rows arrive with the HTML, and the
 * cache keeps it while the reviewer moves to a result and back.
 *
 * A decision changes the cache at once and is sent beside any others still
 * on their way, never behind them; the server's answer adds who made it. The
 * page is not rendered again for it. When one fails the run is read again,
 * which puts back what the server holds.
 */
export function RunReviewStoryboard({ team, project, runNumber, canDecide }: { team: string; project: string; runNumber: number; canDecide: boolean }) {
  const queryClient = useQueryClient();
  const options = useMemo(() => runReviewQuery({ team, project, runNumber }), [team, project, runNumber]);
  const query = useQuery(options);
  const patch = (update: (data: RunReviewData) => RunReviewData) => queryClient.setQueryData(options.queryKey, (data) => (data ? update(data) : data));

  const mutation = useMutation(
    orpc.review.decide.mutationOptions({
      onMutate: async (input) => {
        // An answer read before this decision must not put the old status back.
        await queryClient.cancelQueries({ queryKey: options.queryKey });
        patch((data) => ({ ...data, flows: applyDecision(data.flows, input) }));
      },
      onSuccess: (res, input) => {
        if (res.by) patch((data) => ({ ...data, flows: applyDecision(data.flows, input, res.by ?? undefined) }));
      },
      onError: () => queryClient.invalidateQueries({ queryKey: options.queryKey }),
    }),
  );

  const decide = async (input: ReviewDecisionInput) => {
    try {
      const { decided } = await mutation.mutateAsync({ team, project, ...input });
      return { ok: true as const, decided };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error && error.message ? error.message : 'The decision could not be saved.' };
    }
  };

  if (query.data) return <UrlReviewStoryboard team={team} project={project} flows={query.data.flows} canDecide={canDecide} decide={decide} />;
  if (query.isError)
    return (
      <EmptyState icon={ImageOff} title="The review could not be loaded" description="Something went wrong while reading this run's checkpoints.">
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          Try again
        </Button>
      </EmptyState>
    );
  return <ReviewStoryboardSkeleton />;
}
