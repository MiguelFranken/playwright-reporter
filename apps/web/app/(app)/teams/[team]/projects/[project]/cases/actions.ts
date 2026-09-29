'use server';

import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction, type Denied } from '@/lib/auth/access';
import type { Permission } from '@/lib/auth/permissions';
import { caseKey } from '@miguelfranken/ui/lib/test-cases';
import type { CaseFieldDef } from '@miguelfranken/ui/lib/test-cases';
import {
  adoptTests as adoptTestsService,
  bulkUpdate,
  CaseError,
  createCase as createCaseService,
  createSuite as createSuiteService,
  deleteCases as deleteCasesService,
  deleteSuite as deleteSuiteService,
  linkTests as linkTestsService,
  reorderCase as reorderCaseService,
  reorderSuite as reorderSuiteService,
  restoreVersion as restoreVersionService,
  saveFieldDefs as saveFieldDefsService,
  unlinkTest as unlinkTestService,
  updateCase as updateCaseService,
  updateSuite as updateSuiteService,
  type BulkPatch,
  type CaseContext,
} from '@/lib/test-cases/service';
import type { CreateCaseInput, UpdateCaseInput } from '@/lib/test-cases/model';

/**
 * The test case library's server actions. Each one re-checks access, calls
 * the service (which validates and versions), and returns a result the UI can
 * show. The client sent the team and project; they are never trusted.
 */

type Result<T = object> = ({ ok: true; message?: string } & T) | Denied;
interface ProjectRef {
  team: string;
  project: string;
}

async function run<T extends object>(ref: ProjectRef, permission: Permission, fn: (ctx: CaseContext) => Promise<T & { message?: string }>): Promise<Result<T>> {
  const access = await projectForAction(ref.team, ref.project, permission);
  if (denied(access)) return access;
  try {
    const result = await fn({ projectId: access.project.id, teamId: access.team.id, actorId: access.user.id });
    // The project layout is the nearest one above every case page (the list, a case, its history).
    revalidatePath(`/teams/${ref.team}/projects/${ref.project}`, 'layout');
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof CaseError) return actionError(error.message);
    throw error;
  }
}

const CREATE: Permission = { testCase: ['create'] };
const UPDATE: Permission = { testCase: ['update'] };
const DELETE: Permission = { testCase: ['delete'] };

// ---------------------------------------------------------------- cases

export async function createCase(ref: ProjectRef, values: CreateCaseInput) {
  return run(ref, CREATE, async (ctx) => {
    const row = await createCaseService(ctx, values);
    return { number: row.number, message: `${caseKey(row.number)} created.` };
  });
}

export async function updateCase(ref: ProjectRef, caseId: string, values: UpdateCaseInput, expectedVersion?: number) {
  return run(ref, UPDATE, async (ctx) => {
    const row = await updateCaseService(ctx, caseId, values, { expectedVersion });
    return { number: row.number, message: `${caseKey(row.number)} saved.` };
  });
}

export async function deleteCases(ref: ProjectRef, caseIds: string[]) {
  return run(ref, DELETE, async (ctx) => {
    const n = await deleteCasesService(ctx, caseIds);
    return { deleted: n, message: `${n} test ${n === 1 ? 'case' : 'cases'} deleted.` };
  });
}

export async function bulkEditCases(ref: ProjectRef, caseIds: string[], patch: BulkPatch) {
  return run(ref, UPDATE, async (ctx) => {
    const { updated } = await bulkUpdate(ctx, caseIds, patch);
    return { updated, message: updated ? `${updated} test ${updated === 1 ? 'case' : 'cases'} updated.` : 'Nothing to change.' };
  });
}

export async function reorderCase(ref: ProjectRef, caseId: string, direction: 'up' | 'down') {
  return run(ref, UPDATE, async (ctx) => {
    await reorderCaseService(ctx, caseId, direction);
    return {};
  });
}

export async function restoreVersion(ref: ProjectRef, caseId: string, version: number) {
  return run(ref, UPDATE, async (ctx) => {
    const row = await restoreVersionService(ctx, caseId, version);
    return { version: row.version, message: `Version ${version} restored as version ${row.version}.` };
  });
}

// ---------------------------------------------------------------- links

export async function linkTests(ref: ProjectRef, caseId: string, testIds: string[]) {
  return run(ref, UPDATE, async (ctx) => {
    const { linked } = await linkTestsService(ctx, caseId, testIds);
    return { linked, message: linked ? `${linked} ${linked === 1 ? 'test' : 'tests'} linked.` : 'Those tests were linked already.' };
  });
}

export async function unlinkTest(ref: ProjectRef, caseId: string, testId: string) {
  return run(ref, UPDATE, async (ctx) => {
    const { source } = await unlinkTestService(ctx, caseId, testId);
    return {
      message: source === 'code' ? 'Unlinked. The next run links it again while the test still names this case in its code.' : 'Test unlinked.',
    };
  });
}

export async function adoptTests(ref: ProjectRef, testIds: string[], placement: { mode: 'mirror' } | { mode: 'target'; suiteId: string | null }) {
  return run(ref, CREATE, async (ctx) => {
    const { created, skipped } = await adoptTestsService(ctx, {
      testIds,
      mode: placement.mode,
      suiteId: placement.mode === 'target' ? placement.suiteId : null,
    });
    const n = created.length;
    return {
      created: n,
      message: `${n} test ${n === 1 ? 'case' : 'cases'} created${skipped ? `; ${skipped} ${skipped === 1 ? 'test was' : 'tests were'} covered already` : ''}.`,
    };
  });
}

// ---------------------------------------------------------------- suites

export async function createSuite(ref: ProjectRef, values: { name: string; description: string; parentId: string | null }) {
  return run(ref, CREATE, async (ctx) => {
    const suite = await createSuiteService(ctx, values);
    return { suiteId: suite.id, message: `Suite “${suite.name}” created.` };
  });
}

export async function updateSuite(ref: ProjectRef, suiteId: string, values: { name: string; description: string; parentId: string | null }) {
  return run(ref, UPDATE, async (ctx) => {
    const suite = await updateSuiteService(ctx, suiteId, values);
    return { message: `Suite “${suite.name}” saved.` };
  });
}

export async function reorderSuite(ref: ProjectRef, suiteId: string, direction: 'up' | 'down') {
  return run(ref, UPDATE, async (ctx) => {
    await reorderSuiteService(ctx, suiteId, direction);
    return {};
  });
}

export async function deleteSuite(ref: ProjectRef, suiteId: string) {
  return run(ref, DELETE, async (ctx) => {
    const { cases } = await deleteSuiteService(ctx, suiteId);
    return { message: `Suite deleted${cases ? ` with ${cases} test ${cases === 1 ? 'case' : 'cases'}` : ''}.` };
  });
}

// ---------------------------------------------------------------- fields

export async function saveFieldDefs(ref: ProjectRef, defs: CaseFieldDef[]) {
  return run(ref, UPDATE, async (ctx) => {
    await saveFieldDefsService(ctx, defs);
    return { message: 'Custom fields saved.' };
  });
}
