'use client';

import { useActionState } from 'react';
import { VisualPolicyForm as VisualPolicyFormView, type PolicyChoices, type VisualAiValues } from '@miguelfranken/ui/views/settings/visual-policy-form';
import type { PolicyRule } from '@miguelfranken/ui/lib/visual-diff';
import { updateVisualPolicies, type VisualDiffState } from '@/app/(app)/teams/[team]/projects/[project]/settings/actions';

/** Project settings → where rules and AI analyses are allowed, bound to its server action. */
export function VisualPolicyForm({ teamSlug, projectSlug, rules, ai, choices, disabled, aiUnavailableReason, spentThisMonthMicroUsd }: { teamSlug: string; projectSlug: string; rules: PolicyRule[]; ai: VisualAiValues; choices: PolicyChoices; disabled: boolean; aiUnavailableReason: string | null; spentThisMonthMicroUsd: number | null }) {
  const [state, action, pending] = useActionState<VisualDiffState, FormData>(updateVisualPolicies, null);
  return (
    <VisualPolicyFormView rules={rules} ai={ai} choices={choices} action={action} pending={pending} disabled={disabled} aiUnavailableReason={aiUnavailableReason} spentThisMonthMicroUsd={spentThisMonthMicroUsd} error={state && !state.ok ? state.message : null}>
      <input type="hidden" name="team" value={teamSlug} />
      <input type="hidden" name="project" value={projectSlug} />
    </VisualPolicyFormView>
  );
}
