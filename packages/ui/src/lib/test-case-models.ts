/**
 * The view models of the test case views. The app's queries produce these;
 * the views in `views/test-cases` only ever render them.
 */
import type {
  CaseAutomation,
  CaseBehavior,
  CaseFieldDef,
  CasePriority,
  CaseSeverity,
  CaseStatus,
  CaseStep,
  CaseType,
  CaseVerdict,
  CustomFieldValue,
  LinkSource,
  StepFormat,
} from './test-cases';

/** A suite in the tree. `caseCount` counts its own cases, `totalCount` those of its whole subtree. */
export interface SuiteNode {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  depth: number;
  caseCount: number;
  totalCount: number;
  children: SuiteNode[];
}

export interface CaseRow {
  id: string;
  number: number;
  title: string;
  suiteId: string | null;
  /** Names from the root suite down to the case's own. Empty when unassigned. */
  suitePath: string[];
  status: CaseStatus;
  priority: CasePriority;
  severity: CaseSeverity;
  type: CaseType;
  automation: CaseAutomation;
  muted: boolean;
  tags: string[];
  linkCount: number;
  verdict: CaseVerdict;
  lastRunAt: Date | null;
  updatedAt: Date;
}

/** A Playwright test linked to a case, with what its runs say. */
export interface LinkedTest {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  source: LinkSource;
  lastOutcome: string | null;
  lastRunAt: Date | null;
  lastRunNumber: number | null;
  /** Counts over the health window (30 days). */
  runs: number;
  passed: number;
  failed: number;
  flaky: number;
}

export interface CaseDetail extends CaseRow {
  description: string;
  preconditions: string;
  postconditions: string;
  stepsFormat: StepFormat;
  steps: CaseStep[];
  behavior: CaseBehavior;
  customFields: Record<string, CustomFieldValue>;
  version: number;
  createdAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  links: LinkedTest[];
}

/** One saved version of a case. `snapshot` is the case as that version left it. */
export interface CaseVersionRow {
  version: number;
  changed: string[];
  author: string | null;
  createdAt: Date;
  snapshot: CaseSnapshotView;
}

export interface CaseSnapshotView {
  title: string;
  suite: string | null;
  status: CaseStatus;
  priority: CasePriority;
  severity: CaseSeverity;
  type: CaseType;
  behavior: CaseBehavior;
  automation: CaseAutomation;
  muted: boolean;
  tags: string[];
  description: string;
  preconditions: string;
  postconditions: string;
  stepsFormat: StepFormat;
  steps: CaseStep[];
  customFields: Record<string, CustomFieldValue>;
}

export interface CoverageSummary {
  total: number;
  byStatus: Record<CaseStatus, number>;
  byAutomation: Record<CaseAutomation, number>;
  /** Marked automated with no linked test to back it. */
  unverified: number;
  failing: number;
  flaky: number;
  stale: number;
  /** Playwright tests seen in the last 30 days that no case covers. */
  uncoveredTests: number;
}

/** A Playwright test as the link and adopt pickers list it. */
export interface AutomatedTestOption {
  testId: string;
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  lastRunAt: Date | null;
  lastOutcome: string | null;
  /** Keys (`TC-n`) of the cases already linked to it. */
  linkedCases: string[];
}

export type { CaseFieldDef };

/** A suite as a picker lists it: indented by depth, in tree order. */
export interface SuiteOption {
  value: string;
  label: string;
  depth: number;
}

export function flattenSuites(roots: readonly SuiteNode[]): SuiteOption[] {
  const out: SuiteOption[] = [];
  const walk = (nodes: readonly SuiteNode[]) => {
    for (const n of nodes) {
      out.push({ value: n.id, label: n.name, depth: n.depth });
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** The suite and every suite below it, so a move can leave them out. */
export function suiteSubtree(roots: readonly SuiteNode[], id: string): Set<string> {
  const out = new Set<string>();
  const find = (nodes: readonly SuiteNode[]): SuiteNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const collect = (n: SuiteNode) => {
    out.add(n.id);
    n.children.forEach(collect);
  };
  const root = find(roots);
  if (root) collect(root);
  return out;
}
