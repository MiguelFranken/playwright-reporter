import type {
  AutomatedTestOption,
  CaseDetail,
  CaseRow,
  CaseVersionRow,
  CoverageSummary,
  LinkedTest,
  SuiteNode,
  SuiteOption,
} from '../lib/test-case-models';
import type { CaseFieldDef, CaseStep } from '../lib/test-cases';
import { ago } from './now';

function suite(id: string, name: string, parentId: string | null, depth: number, caseCount: number, children: SuiteNode[] = []): SuiteNode {
  return {
    id,
    name,
    description: '',
    parentId,
    depth,
    caseCount,
    totalCount: caseCount + children.reduce((a, c) => a + c.totalCount, 0),
    children,
  };
}

export const suiteTree: SuiteNode[] = [
  suite('s-auth', 'Authentication', null, 0, 1, [suite('s-login', 'Login', 's-auth', 1, 4), suite('s-signup', 'Registration', 's-auth', 1, 2)]),
  suite('s-checkout', 'Checkout', null, 0, 6, [suite('s-payment', 'Payment', 's-checkout', 1, 3, [suite('s-cards', 'Cards', 's-payment', 2, 2)])]),
  suite('s-search', 'Search', null, 0, 3),
];

export const longSuiteTree: SuiteNode[] = [
  suite('s-long', 'Customer account management including addresses, payment methods and notification preferences', null, 0, 12),
  ...suiteTree,
];

export function caseRow(over: Partial<CaseRow> & Pick<CaseRow, 'id' | 'number' | 'title'>): CaseRow {
  return {
    suiteId: 's-login',
    suitePath: ['Authentication', 'Login'],
    status: 'active',
    priority: 'medium',
    severity: 'normal',
    type: 'functional',
    automation: 'manual',
    muted: false,
    tags: [],
    linkCount: 0,
    verdict: 'none',
    lastRunAt: null,
    updatedAt: ago(60 * 26),
    ...over,
  };
}

export const caseRows: CaseRow[] = [
  caseRow({ id: 'c1', number: 1, title: 'Log in with valid credentials', priority: 'critical', automation: 'automated', linkCount: 2, verdict: 'passing', lastRunAt: ago(40), tags: ['smoke'] }),
  caseRow({ id: 'c2', number: 2, title: 'Log in with a wrong password', priority: 'high', automation: 'automated', linkCount: 1, verdict: 'failing', lastRunAt: ago(40) }),
  caseRow({ id: 'c3', number: 3, title: 'Reset a forgotten password', automation: 'planned' }),
  caseRow({ id: 'c4', number: 4, title: 'Sign in with Google', priority: 'high', automation: 'automated', linkCount: 1, verdict: 'flaky', lastRunAt: ago(90) }),
  caseRow({ id: 'c5', number: 5, title: 'Remember me keeps the session for 30 days', priority: 'low', status: 'draft', automation: 'automated', linkCount: 0 }),
  caseRow({ id: 'c6', number: 6, title: 'Lock the account after five failed attempts', status: 'deprecated', priority: 'none', automation: 'automated', linkCount: 1, verdict: 'stale', lastRunAt: ago(60 * 24 * 20), muted: true }),
];

export const longCaseRow = caseRow({
  id: 'c-long',
  number: 12_345,
  title:
    'A returning customer who signed up with a social login, then set a password, can still log in with either method after changing their primary e-mail address',
  suitePath: ['Customer account management including addresses', 'Login', 'Social', 'Google', 'Edge cases', 'Very deep'],
  tags: ['smoke', 'regression', 'accounts', 'sso', 'long-running'],
});

export const steps: CaseStep[] = [
  { action: 'Open the login page', data: '', expected: 'The form shows e-mail and password fields', keyword: 'given' },
  { action: 'Enter a registered e-mail and its password', data: 'kim@example.test / correct-horse', expected: 'The password is masked', keyword: 'when' },
  { action: 'Press "Log in"', data: '', expected: 'The dashboard opens and shows the user name', keyword: 'then' },
];

export const linkedTests: LinkedTest[] = [
  {
    testId: 't1',
    title: 'logs in with a password',
    titlePath: ['auth', 'logs in with a password'],
    file: 'tests/auth/login.spec.ts',
    pwProject: 'chromium',
    source: 'code',
    lastOutcome: 'passed',
    lastRunAt: ago(40),
    lastRunNumber: 482,
    runs: 42,
    passed: 41,
    failed: 0,
    flaky: 1,
  },
  {
    testId: 't2',
    title: 'logs in with a password',
    titlePath: ['auth', 'logs in with a password'],
    file: 'tests/auth/login.spec.ts',
    pwProject: 'firefox',
    source: 'manual',
    lastOutcome: 'passed',
    lastRunAt: ago(42),
    lastRunNumber: 482,
    runs: 42,
    passed: 42,
    failed: 0,
    flaky: 0,
  },
];

export const fieldDefs: CaseFieldDef[] = [
  { key: 'owner', label: 'Owner', kind: 'text', options: [], required: true },
  { key: 'area', label: 'Product area', kind: 'select', options: ['Accounts', 'Checkout', 'Search'], required: false },
  { key: 'points', label: 'Estimate (points)', kind: 'number', options: [], required: false },
  { key: 'due', label: 'Automate by', kind: 'date', options: [], required: false },
  { key: 'legacy', label: 'Legacy flow', kind: 'checkbox', options: [], required: false },
  { key: 'notes', label: 'Notes', kind: 'textarea', options: [], required: false },
];

export const caseDetail: CaseDetail = {
  ...caseRows[0],
  description: 'A registered user logs in with their e-mail and password and lands on the dashboard.',
  preconditions: 'A user account exists with a known password.\nThe application is reachable.',
  postconditions: 'The session is active and the user can reach authorised pages.',
  stepsFormat: 'classic',
  steps,
  behavior: 'positive',
  customFields: { owner: 'Kim Nguyen', area: 'Accounts', points: 3, due: '2026-10-15', legacy: false },
  version: 4,
  createdAt: ago(60 * 24 * 12),
  createdBy: 'Kim Nguyen',
  updatedBy: 'Alex Rivera',
  links: linkedTests,
};

export const gherkinDetail: CaseDetail = {
  ...caseDetail,
  id: 'c7',
  number: 7,
  title: 'Checkout with a saved card',
  stepsFormat: 'gherkin',
  steps: [
    { action: 'a signed-in customer with a saved card', data: '', expected: '', keyword: 'given' },
    { action: 'they place an order', data: '', expected: '', keyword: 'when' },
    { action: 'the order is confirmed', data: '', expected: '', keyword: 'then' },
    { action: 'a receipt is e-mailed', data: '', expected: '', keyword: 'and' },
  ],
};

export const emptyDetail: CaseDetail = {
  ...caseRows[2],
  description: '',
  preconditions: '',
  postconditions: '',
  stepsFormat: 'classic',
  steps: [],
  behavior: 'none',
  customFields: {},
  version: 1,
  createdAt: ago(60),
  createdBy: null,
  updatedBy: null,
  links: [],
};

const snapshot = {
  title: 'Log in',
  suite: 'Authentication / Login',
  status: 'draft' as const,
  priority: 'none' as const,
  severity: 'normal' as const,
  type: 'functional' as const,
  behavior: 'none' as const,
  automation: 'manual' as const,
  muted: false,
  tags: [] as string[],
  description: '',
  preconditions: '',
  postconditions: '',
  stepsFormat: 'classic' as const,
  steps: [] as CaseStep[],
  customFields: {},
};

export const caseVersions: CaseVersionRow[] = [
  {
    version: 4,
    changed: ['automation'],
    author: null,
    createdAt: ago(60 * 5),
    snapshot: { ...snapshot, title: 'Log in with valid credentials', status: 'active', priority: 'critical', automation: 'automated', tags: ['smoke'], steps, description: caseDetail.description },
  },
  {
    version: 3,
    changed: ['steps', 'description'],
    author: 'Alex Rivera',
    createdAt: ago(60 * 24),
    snapshot: { ...snapshot, title: 'Log in with valid credentials', status: 'active', priority: 'critical', tags: ['smoke'], steps, description: caseDetail.description },
  },
  {
    version: 2,
    changed: ['title', 'status', 'priority', 'tags'],
    author: 'Kim Nguyen',
    createdAt: ago(60 * 24 * 3),
    snapshot: { ...snapshot, title: 'Log in with valid credentials', status: 'active', priority: 'critical', tags: ['smoke'] },
  },
  { version: 1, changed: [], author: 'Kim Nguyen', createdAt: ago(60 * 24 * 12), snapshot },
];

export const coverage: CoverageSummary = {
  total: 42,
  byStatus: { active: 36, draft: 4, deprecated: 2 },
  byAutomation: { manual: 12, planned: 8, automated: 20 },
  unverified: 2,
  failing: 3,
  flaky: 2,
  stale: 1,
  uncoveredTests: 17,
};

export const emptyCoverage: CoverageSummary = {
  total: 0,
  byStatus: { active: 0, draft: 0, deprecated: 0 },
  byAutomation: { manual: 0, planned: 0, automated: 0 },
  unverified: 0,
  failing: 0,
  flaky: 0,
  stale: 0,
  uncoveredTests: 9,
};

export const automatedTests: AutomatedTestOption[] = [
  { testId: 'a1', title: 'adds an item to the cart', titlePath: ['cart', 'adds an item to the cart'], file: 'tests/checkout/cart.spec.ts', pwProject: 'chromium', lastRunAt: ago(40), lastOutcome: 'passed', linkedCases: [] },
  { testId: 'a2', title: 'adds an item to the cart', titlePath: ['cart', 'adds an item to the cart'], file: 'tests/checkout/cart.spec.ts', pwProject: 'firefox', lastRunAt: ago(41), lastOutcome: 'flaky', linkedCases: [] },
  { testId: 'a3', title: 'applies a coupon', titlePath: ['cart', 'coupons', 'applies a coupon'], file: 'tests/checkout/cart.spec.ts', pwProject: 'chromium', lastRunAt: ago(40), lastOutcome: 'failed', linkedCases: ['TC-9'] },
  { testId: 'a4', title: 'logs in with a password', titlePath: ['auth', 'logs in with a password'], file: 'tests/auth/login.spec.ts', pwProject: 'chromium', lastRunAt: ago(40), lastOutcome: 'passed', linkedCases: ['TC-1'] },
];

/** Flat suite options, as the editor's suite picker lists them. */
export const suiteOptions: SuiteOption[] = [
  { value: 's-auth', label: 'Authentication', depth: 0 },
  { value: 's-login', label: 'Login', depth: 1 },
  { value: 's-signup', label: 'Registration', depth: 1 },
  { value: 's-checkout', label: 'Checkout', depth: 0 },
  { value: 's-payment', label: 'Payment', depth: 1 },
  { value: 's-cards', label: 'Cards', depth: 2 },
  { value: 's-search', label: 'Search', depth: 0 },
];
