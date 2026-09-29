/**
 * The case editor's value shape and a blank case. Plain data, outside the
 * client component, so a server page can build the editor's starting values.
 */
import type {
  CaseAutomation,
  CaseBehavior,
  CasePriority,
  CaseSeverity,
  CaseStatus,
  CaseStep,
  CaseType,
  CustomFieldValue,
  StepFormat,
} from './test-cases';

export interface CaseEditorValues {
  title: string;
  suiteId: string | null;
  description: string;
  preconditions: string;
  postconditions: string;
  stepsFormat: StepFormat;
  steps: CaseStep[];
  status: CaseStatus;
  priority: CasePriority;
  severity: CaseSeverity;
  type: CaseType;
  behavior: CaseBehavior;
  automation: CaseAutomation;
  muted: boolean;
  tags: string[];
  customFields: Record<string, CustomFieldValue>;
}

export const EMPTY_CASE: CaseEditorValues = {
  title: '',
  suiteId: null,
  description: '',
  preconditions: '',
  postconditions: '',
  stepsFormat: 'classic',
  steps: [],
  status: 'active',
  priority: 'none',
  severity: 'normal',
  type: 'functional',
  behavior: 'none',
  automation: 'manual',
  muted: false,
  tags: [],
  customFields: {},
};

