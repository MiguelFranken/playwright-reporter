'use server';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { actionError, denied, projectForAction } from '@/lib/auth/access';
import { audit } from '@/lib/auth/audit';
import { db } from '@/lib/db/drizzle';
import { isUuid } from '@/lib/db/queries/shared';
import { apiTokens, projects } from '@/lib/db/schema';
import { MAX_TOLERANCE_PERCENT, MAX_TOLERANCE_PIXELS, THRESHOLD_RANGE, visualDiffSettings } from '@/lib/review/diff/settings';
import { MAX_POLICY_RULES, visualAiSettings, visualPolicies } from '@/lib/review/diff/policy';
import { allowedModels } from '@/lib/review/analysis/config';
import { generateToken, hashToken } from '@/lib/tokens';

export type RenameState = { ok: boolean; message?: string } | null;

export async function renameProject(_prev: RenameState, formData: FormData): Promise<RenameState> {
  const teamSlug = String(formData.get('team') ?? '');
  const projectSlug = String(formData.get('project') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!teamSlug || !projectSlug) return { ok: false, message: 'Missing project.' };
  if (name.length < 1 || name.length > 80) return { ok: false, message: 'Name must be between 1 and 80 characters.' };

  const access = await projectForAction(teamSlug, projectSlug, { project: ['update'] });
  if (denied(access)) return access;

  if (access.project.name === name) return { ok: true, message: 'No changes.' };
  await db.update(projects).set({ name, updatedAt: new Date() }).where(eq(projects.id, access.project.id));
  await audit('project.update', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { slug: access.project.slug, name },
  });
  revalidatePath(`/teams/${teamSlug}`, 'layout');
  return { ok: true, message: 'Project renamed.' };
}

export type DefaultBranchState = { ok: boolean; message?: string } | null;

/**
 * Sets `projects.settings.defaultBranch`, the branch AI assistants compare
 * against to tell a new failure from one already failing on the base branch
 * (see `defaultBranch` in lib/db/queries/mcp.ts). An empty value removes the
 * key, which hands the choice back to the fallback (main/master, then the
 * busiest branch) rather than pinning a stale guess.
 *
 * The change is a jsonb merge done in SQL, so other settings keys such as
 * `staleTimeoutMs` survive even if they were written concurrently.
 */
export async function updateDefaultBranch(_prev: DefaultBranchState, formData: FormData): Promise<DefaultBranchState> {
  const teamSlug = String(formData.get('team') ?? '');
  const projectSlug = String(formData.get('project') ?? '');
  const branch = String(formData.get('defaultBranch') ?? '').trim();
  if (!teamSlug || !projectSlug) return { ok: false, message: 'Missing project.' };
  if (branch.length > 200) return { ok: false, message: 'Branch name must be at most 200 characters.' };

  const access = await projectForAction(teamSlug, projectSlug, { project: ['update'] });
  if (denied(access)) return access;

  const current = typeof access.project.settings.defaultBranch === 'string' ? access.project.settings.defaultBranch : '';
  if (current === branch) return { ok: true, message: 'No changes.' };

  const settings = branch
    ? sql`${projects.settings} || jsonb_build_object('defaultBranch', ${branch}::text)`
    : sql`${projects.settings} - 'defaultBranch'`;
  await db.update(projects).set({ settings, updatedAt: new Date() }).where(eq(projects.id, access.project.id));
  await audit('project.update', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { slug: access.project.slug, defaultBranch: branch || null },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}/settings`);
  return { ok: true, message: branch ? `Base branch set to ${branch}.` : 'Base branch cleared.' };
}

export type VisualDiffState = { ok: boolean; message?: string } | null;

/**
 * Sets `projects.settings.visualDiff`: the colour threshold of the pixel
 * comparison and the tolerance under which a changed review image is
 * approved automatically. Merged in SQL like the base branch, so other
 * settings keys survive. Raising the tolerance does not revisit images
 * already reviewed; it applies to the next measurements.
 */
export async function updateVisualDiff(_prev: VisualDiffState, formData: FormData): Promise<VisualDiffState> {
  const teamSlug = String(formData.get('team') ?? '');
  const projectSlug = String(formData.get('project') ?? '');
  if (!teamSlug || !projectSlug) return { ok: false, message: 'Missing project.' };
  const num = (name: string) => {
    const raw = String(formData.get(name) ?? '').trim();
    return raw === '' ? 0 : Number(raw);
  };
  const threshold = num('threshold');
  const maxChangedPixels = num('maxChangedPixels');
  const maxChangedPercent = num('maxChangedPercent');
  if (!Number.isFinite(threshold) || threshold < THRESHOLD_RANGE.min || threshold > THRESHOLD_RANGE.max) return { ok: false, message: `The colour threshold is between ${THRESHOLD_RANGE.min} and ${THRESHOLD_RANGE.max}.` };
  if (!Number.isInteger(maxChangedPixels) || maxChangedPixels < 0 || maxChangedPixels > MAX_TOLERANCE_PIXELS) return { ok: false, message: `Changed pixels are a whole number up to ${MAX_TOLERANCE_PIXELS.toLocaleString('en')}.` };
  if (!Number.isFinite(maxChangedPercent) || maxChangedPercent < 0 || maxChangedPercent > MAX_TOLERANCE_PERCENT) return { ok: false, message: `The share is between 0 and ${MAX_TOLERANCE_PERCENT}%.` };
  const next = { threshold, autoApprove: formData.get('autoApprove') === 'on', maxChangedPixels, maxChangedPercent };

  const access = await projectForAction(teamSlug, projectSlug, { project: ['update'] });
  if (denied(access)) return access;
  const current = visualDiffSettings(access.project.settings);
  if (JSON.stringify(current) === JSON.stringify(next)) return { ok: true, message: 'No changes.' };

  await db
    .update(projects)
    .set({ settings: sql`${projects.settings} || jsonb_build_object('visualDiff', ${JSON.stringify(next)}::jsonb)`, updatedAt: new Date() })
    .where(eq(projects.id, access.project.id));
  await audit('project.update', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { slug: access.project.slug, visualDiff: next },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}`, 'layout');
  return { ok: true, message: 'Visual comparison saved.' };
}

/**
 * Sets `projects.settings.visualPolicies` (where rules and AI analyses are
 * allowed) and `projects.settings.visualAi` (mode, model, budget). Merged in
 * SQL like the other settings keys. A policy change takes effect on the next
 * write it governs; it revokes nothing already saved.
 */
export async function updateVisualPolicies(_prev: VisualDiffState, formData: FormData): Promise<VisualDiffState> {
  const teamSlug = String(formData.get('team') ?? '');
  const projectSlug = String(formData.get('project') ?? '');
  if (!teamSlug || !projectSlug) return { ok: false, message: 'Missing project.' };
  let parsedRules: unknown;
  try {
    parsedRules = JSON.parse(String(formData.get('rules') ?? '[]'));
  } catch {
    return { ok: false, message: 'The rules could not be read.' };
  }
  if (!Array.isArray(parsedRules) || parsedRules.length > MAX_POLICY_RULES) return { ok: false, message: `At most ${MAX_POLICY_RULES} rules.` };
  const rules = visualPolicies({ visualPolicies: parsedRules });
  if (rules.length !== parsedRules.length) return { ok: false, message: 'A rule is incomplete.' };
  const mode = String(formData.get('aiMode') ?? 'off');
  if (!['off', 'manual', 'proactive'].includes(mode)) return { ok: false, message: 'Unknown AI mode.' };
  const model = String(formData.get('aiModel') ?? '').trim() || null;
  const models = allowedModels();
  if (model && models.length && !models.includes(model)) return { ok: false, message: 'The model is not on this deployment’s allow list.' };
  const money = (name: string, max: number) => {
    const raw = String(formData.get(name) ?? '').trim();
    if (raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > max) return NaN;
    return Math.round(n * 1_000_000);
  };
  const monthly = money('aiMonthlyBudgetUsd', 10_000);
  const perJob = money('aiPerJobMaxUsd', 10);
  if (Number.isNaN(monthly) || Number.isNaN(perJob)) return { ok: false, message: 'Budgets are amounts in USD.' };
  if (perJob !== null && perJob < 1_000) return { ok: false, message: 'An analysis reserves at least $0.001.' };
  const ai = { mode, model, monthlyBudgetMicroUsd: monthly, perJobMaxMicroUsd: perJob ?? 50_000 };

  const access = await projectForAction(teamSlug, projectSlug, { project: ['update'] });
  if (denied(access)) return access;
  if (JSON.stringify(visualPolicies(access.project.settings)) === JSON.stringify(rules) && JSON.stringify(visualAiSettings(access.project.settings)) === JSON.stringify(ai)) return { ok: true, message: 'No changes.' };
  await db
    .update(projects)
    .set({ settings: sql`${projects.settings} || jsonb_build_object('visualPolicies', ${JSON.stringify(rules)}::jsonb, 'visualAi', ${JSON.stringify(ai)}::jsonb)`, updatedAt: new Date() })
    .where(eq(projects.id, access.project.id));
  await audit('project.update', { actorId: access.user.id, teamId: access.team.id, projectId: access.project.id, target: { slug: access.project.slug, visualPolicies: rules.length, visualAi: ai } });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}`, 'layout');
  return { ok: true, message: 'Visual policies saved.' };
}

export type CreateTokenResult = { ok: true; token: string; name: string } | { ok: false; message: string };

export async function createToken(teamSlug: string, projectSlug: string, rawName: string): Promise<CreateTokenResult> {
  const name = rawName.trim() || 'Reporter token';
  if (name.length > 80) return actionError('Name must be at most 80 characters.');

  const access = await projectForAction(teamSlug, projectSlug, { token: ['create'] });
  if (denied(access)) return access;

  const { token, prefix } = generateToken();
  const id = randomUUID();
  await db.insert(apiTokens).values({
    id,
    projectId: access.project.id,
    tokenHash: hashToken(token),
    tokenPrefix: prefix,
    name,
    createdBy: access.user.id,
  });
  await audit('token.create', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { tokenId: id, name, prefix },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}/settings`);
  return { ok: true, token, name };
}

export async function revokeToken(teamSlug: string, projectSlug: string, tokenId: string): Promise<{ ok: boolean; message?: string }> {
  const access = await projectForAction(teamSlug, projectSlug, { token: ['revoke'] });
  if (denied(access)) return access;
  if (!isUuid(tokenId)) return actionError('Token not found.');

  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.projectId, access.project.id)))
    .returning({ id: apiTokens.id, name: apiTokens.name });
  if (!row) return actionError('Token not found.');
  await audit('token.revoke', {
    actorId: access.user.id,
    teamId: access.team.id,
    projectId: access.project.id,
    target: { tokenId: row.id, name: row.name },
  });
  revalidatePath(`/teams/${teamSlug}/projects/${projectSlug}/settings`);
  return { ok: true };
}
