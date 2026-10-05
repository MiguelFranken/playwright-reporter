'use client';

import { useSearchParams } from 'next/navigation';
import { investigateRunVisualDiffsPrompt } from '@miguelfranken/ui/lib/ai-handoff';
import { compareRuleRun, parseCompareRule } from '@miguelfranken/ui/lib/review';
import { DebugWithAiMenu } from '@miguelfranken/ui/patterns/debug-with-ai-menu';

/**
 * "Visual changes with AI" on a run's review: the agent compares with what the
 * reviewer compares with — the run before, or the run `?against=run:38` names.
 * Read on the client, because "Compare with" changes the URL without a request.
 */
export function RunVisualAiMenu({ runUrl }: { runUrl: string }) {
  const baseRun = compareRuleRun(parseCompareRule(useSearchParams().get('against')));
  return <DebugWithAiMenu prompt={investigateRunVisualDiffsPrompt({ runUrl, baseRun })} setupHref="/account/ai" label="Visual changes with AI" />;
}
