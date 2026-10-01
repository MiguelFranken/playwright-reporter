/**
 * What a project allows where, for the two abilities that change what a
 * comparison means or cost money: leaving areas out of a comparison, and
 * asking a model about one. Rules live in `projects.settings.visualPolicies`
 * (scoped to the project, a spec folder, a test case suite, a test, a screen
 * or a variant); the AI mode and budget in `projects.settings.visualAi`.
 *
 * Resolution is the shared vocabulary's: a deny anywhere up the chain wins,
 * then the most specific allow, then the default. Every write path checks
 * here, on the server, right before it acts.
 */
import { eq, inArray } from 'drizzle-orm';
import { AI_MODES, resolvePolicy, type AiMode, type PolicyCapability, type PolicyDecision, type PolicyRule, type PolicyScope, type PolicyTarget } from '@miguelfranken/ui/lib/visual-diff';
import { db } from '@/lib/db/drizzle';
import { testCaseLinks, testCases, testSuites, tests } from '@/lib/db/schema';

export interface VisualAiSettings {
  mode: AiMode;
  /** The model the gateway is asked for; must be on the deployment's allow list. */
  model: string | null;
  /** This project's share of the team's monthly budget, in micro-dollars; null for no cap below the team's. */
  monthlyBudgetMicroUsd: number | null;
  /** The most one analysis may reserve, in micro-dollars. */
  perJobMaxMicroUsd: number;
}

export const DEFAULT_VISUAL_AI: VisualAiSettings = { mode: 'off', model: null, monthlyBudgetMicroUsd: null, perJobMaxMicroUsd: 50_000 };

const SCOPE_KINDS = new Set(['project', 'file', 'suite', 'test', 'screen', 'variant']);

const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** The rules a project stored, with anything malformed dropped. */
export function visualPolicies(settings: Record<string, unknown> | null | undefined): PolicyRule[] {
  const raw = settings?.visualPolicies;
  if (!Array.isArray(raw)) return [];
  const out: PolicyRule[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown>;
    const scope = r.scope as Record<string, unknown> | undefined;
    const id = str(r.id, 64);
    if (!id || !scope || !SCOPE_KINDS.has(String(scope.kind)) || (r.capability !== 'ignore' && r.capability !== 'ai') || (r.effect !== 'allow' && r.effect !== 'deny')) continue;
    let parsed: PolicyScope | null = null;
    switch (scope.kind) {
      case 'project':
        parsed = { kind: 'project' };
        break;
      case 'file':
        parsed = str(scope.path) ? { kind: 'file', path: str(scope.path)! } : null;
        break;
      case 'suite':
        parsed = str(scope.suiteId) ? { kind: 'suite', suiteId: str(scope.suiteId)!, name: str(scope.name) ?? undefined } : null;
        break;
      case 'test':
        parsed = str(scope.testId) ? { kind: 'test', testId: str(scope.testId)!, title: str(scope.title) ?? undefined } : null;
        break;
      case 'screen':
        parsed = str(scope.testId) && str(scope.checkpointName) ? { kind: 'screen', testId: str(scope.testId)!, checkpointName: str(scope.checkpointName)!, title: str(scope.title) ?? undefined } : null;
        break;
      case 'variant':
        parsed = str(scope.testId) && str(scope.checkpointName) && str(scope.variant) ? { kind: 'variant', testId: str(scope.testId)!, checkpointName: str(scope.checkpointName)!, variant: str(scope.variant)! } : null;
        break;
    }
    if (parsed) out.push({ id, scope: parsed, capability: r.capability as PolicyCapability, effect: r.effect as 'allow' | 'deny' });
  }
  return out;
}

export const MAX_POLICY_RULES = 200;

export function visualAiSettings(settings: Record<string, unknown> | null | undefined): VisualAiSettings {
  const raw = (settings?.visualAi ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  return {
    mode: (AI_MODES as readonly string[]).includes(String(raw.mode)) ? (raw.mode as AiMode) : DEFAULT_VISUAL_AI.mode,
    model: str(raw.model, 120),
    monthlyBudgetMicroUsd: num(raw.monthlyBudgetMicroUsd),
    perJobMaxMicroUsd: num(raw.perJobMaxMicroUsd) ?? DEFAULT_VISUAL_AI.perJobMaxMicroUsd,
  };
}

/** Where captures sit, for the policies: the test's file and the suites (with their ancestors) its cases belong to. */
export async function policyTargetsFor(captures: readonly { id: string; testId: string; checkpointName: string; variant: string }[]): Promise<Map<string, PolicyTarget>> {
  const out = new Map<string, PolicyTarget>();
  const testIds = [...new Set(captures.map((c) => c.testId))];
  if (testIds.length === 0) return out;
  const [files, links] = await Promise.all([
    db.select({ id: tests.id, file: tests.file, projectId: tests.projectId }).from(tests).where(inArray(tests.id, testIds)),
    db.select({ testId: testCaseLinks.testId, suiteId: testCases.suiteId }).from(testCaseLinks).innerJoin(testCases, eq(testCases.id, testCaseLinks.caseId)).where(inArray(testCaseLinks.testId, testIds)),
  ]);
  const projectIds = [...new Set(files.map((f) => f.projectId))];
  const suites = projectIds.length ? await db.select({ id: testSuites.id, parentId: testSuites.parentId }).from(testSuites).where(inArray(testSuites.projectId, projectIds)) : [];
  const parentOf = new Map(suites.map((s) => [s.id, s.parentId]));
  const withAncestors = (id: string) => {
    const chain: string[] = [];
    for (let at: string | null | undefined = id; at && !chain.includes(at); at = parentOf.get(at)) chain.push(at);
    return chain;
  };
  const suitesOfTest = new Map<string, Set<string>>();
  for (const l of links) if (l.suiteId) for (const s of withAncestors(l.suiteId)) (suitesOfTest.get(l.testId) ?? suitesOfTest.set(l.testId, new Set()).get(l.testId)!).add(s);
  const fileOf = new Map(files.map((f) => [f.id, f.file]));
  for (const c of captures) out.set(c.id, { file: fileOf.get(c.testId) ?? '', suiteIds: [...(suitesOfTest.get(c.testId) ?? [])], testId: c.testId, checkpointName: c.checkpointName, variant: c.variant });
  return out;
}

/** The decision for one capture: leaving areas out is allowed by default; AI only when the project's mode is not off. */
export function decidePolicy(settings: Record<string, unknown> | null | undefined, capability: PolicyCapability, target: PolicyTarget): PolicyDecision {
  const rules = visualPolicies(settings);
  const defaultAllowed = capability === 'ignore' ? true : visualAiSettings(settings).mode !== 'off';
  const decision = resolvePolicy(rules, capability, target, defaultAllowed);
  if (capability === 'ai' && !decision.rule && !defaultAllowed) return { ...decision, reason: 'AI analysis is off for this project (Settings → Visual comparison).' };
  return decision;
}

/** What a project's policy rules can name: its suites and (up to 500) tests with review captures. */
export async function policyChoices(projectId: string): Promise<{ suites: { id: string; name: string }[]; tests: { id: string; title: string; file: string }[] }> {
  const { reviewCaptures } = await import('@/lib/db/schema');
  const { and, asc, sql } = await import('drizzle-orm');
  const [suites, testRows] = await Promise.all([
    db.select({ id: testSuites.id, name: testSuites.name }).from(testSuites).where(eq(testSuites.projectId, projectId)).orderBy(asc(testSuites.name)),
    db
      .select({ id: tests.id, title: tests.title, titlePath: tests.titlePath, file: tests.file })
      .from(tests)
      .where(and(eq(tests.projectId, projectId), sql`exists (select 1 from ${reviewCaptures} rc where rc.test_id = ${tests.id})`))
      .orderBy(asc(tests.file), asc(tests.title))
      .limit(500),
  ]);
  return { suites, tests: testRows.map((t) => ({ id: t.id, title: t.titlePath.join(' › ') || t.title, file: t.file })) };
}
