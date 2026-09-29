import type { CaseDetail } from '@miguelfranken/ui/lib/test-case-models';
import type { CaseEditorValues } from '@miguelfranken/ui/views/test-cases/case-editor';

/** The editor's starting values for an existing case. */
export function editorValues(detail: CaseDetail): CaseEditorValues {
  return {
    title: detail.title,
    suiteId: detail.suiteId,
    description: detail.description,
    preconditions: detail.preconditions,
    postconditions: detail.postconditions,
    stepsFormat: detail.stepsFormat,
    steps: detail.steps,
    status: detail.status,
    priority: detail.priority,
    severity: detail.severity,
    type: detail.type,
    behavior: detail.behavior,
    automation: detail.automation,
    muted: detail.muted,
    tags: detail.tags,
    customFields: detail.customFields,
  };
}

/** A case number from the URL, or null for anything else (`/cases/abc` is a 404, not a crash). */
export function caseNumberParam(value: string): number | null {
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}
