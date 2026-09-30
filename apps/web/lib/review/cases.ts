/**
 * The test cases review flows belong to: a Playwright test linked to TC-12
 * shows under TC-12's suite in the visual review, and links to the case.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { caseKey } from '@miguelfranken/ui/lib/test-cases';
import type { ReviewCaseRef } from '@miguelfranken/ui/lib/review';
import { db } from '@/lib/db/drizzle';
import { listSuites, suitePaths } from '@/lib/db/queries/test-cases';
import { testCaseLinks, testCases } from '@/lib/db/schema';

/**
 * The cases each test is linked to, by test id: active ones before deprecated
 * ones, then by key. The first one decides the flow's folder.
 */
export async function casesOfTests(projectId: string, testIds: readonly string[]): Promise<Record<string, Omit<ReviewCaseRef, 'href'>[]>> {
  const out: Record<string, Omit<ReviewCaseRef, 'href'>[]> = {};
  const ids = [...new Set(testIds)];
  if (ids.length === 0) return out;
  const [rows, suites] = await Promise.all([
    db
      .select({ testId: testCaseLinks.testId, number: testCases.number, title: testCases.title, suiteId: testCases.suiteId, status: testCases.status, priority: testCases.priority })
      .from(testCaseLinks)
      .innerJoin(testCases, eq(testCases.id, testCaseLinks.caseId))
      .where(and(eq(testCases.projectId, projectId), inArray(testCaseLinks.testId, ids)))
      .orderBy(testCases.number),
    listSuites(projectId),
  ]);
  const paths = suitePaths(suites);
  const rank = (s: string) => (s === 'deprecated' ? 1 : 0);
  for (const r of [...rows].sort((a, b) => rank(a.status) - rank(b.status) || a.number - b.number)) {
    (out[r.testId] ??= []).push({ key: caseKey(r.number), title: r.title, suitePath: r.suiteId ? (paths.get(r.suiteId) ?? []) : [], priority: r.priority });
  }
  return out;
}
