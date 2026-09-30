/**
 * Saved library views: a person's own filters, grouping and order of a
 * project's library, under a name, next to the built-in ones everybody has.
 * Personal — a view is listed, changed and deleted only by its owner.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import {
  BUILT_IN_VIEWS,
  builtInView,
  LIBRARY_VIEW_NAME_MAX,
  MAX_SAVED_VIEWS,
  normalizeViewConfig,
  type LibraryViewConfig,
  type LibraryViewDef,
} from '@miguelfranken/ui/lib/library-views';
import { db } from '@/lib/db/drizzle';
import { libraryViews, type LibraryViewRow } from '@/lib/db/schema';

export class LibraryViewError extends Error {}

const toDef = (row: LibraryViewRow): LibraryViewDef => ({ id: row.id, name: row.name, config: normalizeViewConfig(row.config) });

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (!clean) throw new LibraryViewError('Give the view a name.');
  if (clean.length > LIBRARY_VIEW_NAME_MAX) throw new LibraryViewError(`A view’s name has at most ${LIBRARY_VIEW_NAME_MAX} characters.`);
  if (BUILT_IN_VIEWS.some((v) => v.name.toLowerCase() === clean.toLowerCase())) throw new LibraryViewError(`“${clean}” is a built-in view. Choose another name.`);
  return clean;
}

/** Whether an error is Postgres refusing a duplicate (a view with that name). */
const isDuplicate = (error: unknown) => (error as { code?: string; cause?: { code?: string } })?.code === '23505' || (error as { cause?: { code?: string } })?.cause?.code === '23505';

/** The person's saved views of the project, in the order they keep them. */
export async function listLibraryViews(projectId: string, userId: string): Promise<LibraryViewDef[]> {
  const rows = await db
    .select()
    .from(libraryViews)
    .where(and(eq(libraryViews.projectId, projectId), eq(libraryViews.userId, userId)))
    .orderBy(asc(libraryViews.position), asc(libraryViews.createdAt));
  return rows.map(toDef);
}

/** A view by built-in id, or one of the person's saved views by id or (case-insensitive) name. */
export async function findLibraryView(projectId: string, userId: string | null, ref: string): Promise<LibraryViewDef | null> {
  const value = ref.trim();
  const builtIn = builtInView(value) ?? BUILT_IN_VIEWS.find((v) => v.name.toLowerCase() === value.toLowerCase());
  if (builtIn) return builtIn;
  if (!userId || !value) return null;
  const [row] = await db
    .select()
    .from(libraryViews)
    .where(
      and(
        eq(libraryViews.projectId, projectId),
        eq(libraryViews.userId, userId),
        isId(value) ? eq(libraryViews.id, value) : sql`lower(${libraryViews.name}) = ${value.toLowerCase()}`,
      ),
    );
  return row ? toDef(row) : null;
}

/** Saves a new view, after the person's others. */
export async function createLibraryView(input: { projectId: string; userId: string; name: string; config: unknown }): Promise<LibraryViewDef> {
  const name = cleanName(input.name);
  const config = normalizeViewConfig(input.config);
  const [{ count, last }] = await db
    .select({ count: sql<number>`count(*)::int`, last: sql<number>`coalesce(max(${libraryViews.position}), -1)::int` })
    .from(libraryViews)
    .where(and(eq(libraryViews.projectId, input.projectId), eq(libraryViews.userId, input.userId)));
  if (count >= MAX_SAVED_VIEWS) throw new LibraryViewError(`You can keep at most ${MAX_SAVED_VIEWS} views per project. Delete one first.`);
  try {
    const [row] = await db
      .insert(libraryViews)
      .values({ id: randomUUID(), projectId: input.projectId, userId: input.userId, name, config, position: last + 1 })
      .returning();
    return toDef(row);
  } catch (error) {
    if (isDuplicate(error)) throw new LibraryViewError(`You already have a view called “${name}”.`);
    throw error;
  }
}

/** Renames a view or replaces its settings. Only its owner may. */
export async function updateLibraryView(input: { projectId: string; userId: string; id: string; name?: string; config?: unknown }): Promise<LibraryViewDef> {
  if (!isId(input.id)) throw new LibraryViewError('That view does not exist.');
  const patch: Partial<Pick<LibraryViewRow, 'name' | 'config'>> = {};
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.config !== undefined) patch.config = normalizeViewConfig(input.config) satisfies LibraryViewConfig;
  try {
    const [row] = await db
      .update(libraryViews)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(libraryViews.id, input.id), eq(libraryViews.projectId, input.projectId), eq(libraryViews.userId, input.userId)))
      .returning();
    if (!row) throw new LibraryViewError('That view does not exist.');
    return toDef(row);
  } catch (error) {
    if (isDuplicate(error)) throw new LibraryViewError(`You already have a view called “${patch.name}”.`);
    throw error;
  }
}

export async function deleteLibraryView(input: { projectId: string; userId: string; id: string }): Promise<{ deleted: boolean }> {
  if (!isId(input.id)) return { deleted: false };
  const rows = await db
    .delete(libraryViews)
    .where(and(eq(libraryViews.id, input.id), eq(libraryViews.projectId, input.projectId), eq(libraryViews.userId, input.userId)))
    .returning({ id: libraryViews.id });
  return { deleted: rows.length > 0 };
}
