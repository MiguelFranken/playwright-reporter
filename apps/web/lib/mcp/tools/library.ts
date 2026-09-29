/**
 * The library for assistants: which branches and pull requests are kept as
 * visual documentation, and the screens of each — so an agent can show a
 * stakeholder how a flow looks on the product today, or on a pull request,
 * with the links to open it, and (write-scoped) keep a pull request in the
 * library or pin the run that documents it.
 */
import { z } from 'zod';
import { checkpointLabel } from '@miguelfranken/ui/lib/review';
import { libraryRefLabel, libraryRefParam, shownRun, type LibraryRefKey } from '@miguelfranken/ui/lib/library';
import { defaultBranch } from '@/lib/db/queries/mcp';
import { casesOfTests } from '@/lib/review/cases';
import { defaultLibraryRef, getLibraryReference, LibraryError, libraryFlows, listLibraryReferences, setLibraryReference } from '@/lib/review/library';
import { invalid } from '../errors';
import { commonParams } from '../params';
import { defineTool, output } from '../registry';
import { link } from '../render/markdown';

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const refParams = {
  branch: z.string().min(1).max(512).optional().describe('A branch, e.g. "main". Leave both out for the library’s default reference.'),
  pullRequest: z.number().int().positive().optional().describe('A pull (merge) request number, e.g. 212.'),
};

function refOf(args: { branch?: string; pullRequest?: number }): LibraryRefKey | null {
  if (args.branch && args.pullRequest) throw invalid('Pass "branch" or "pullRequest", not both.');
  if (args.pullRequest) return { kind: 'pull_request', prNumber: args.pullRequest };
  if (args.branch) return { kind: 'branch', branch: args.branch };
  return null;
}

// ---------------------------------------------------------------- list_library

const referenceOut = z.object({
  reference: z.string().describe('"branch:main" or "pr:212".'),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  kept: z.boolean(),
  pinnedRun: z.number().nullable(),
  shownRun: z.number().nullable(),
  latestRun: z.number().nullable(),
  needsReview: z.number().describe('Changed and new images of the newest run.'),
  url: z.string(),
});

export const listLibrary = defineTool({
  name: 'list_library',
  title: 'List the library',
  toolset: 'core',
  description:
    'The visual documentation of the product: the branches and pull requests kept in the library (and the default branch), which run of each is shown — the newest, or a pinned one — and how many of the newest run’s images still wait for review. Read a reference’s screens with get_library_flows.',
  input: z.object({ ...commonParams }),
  output: output({ project: z.string(), defaultReference: z.string(), url: z.string(), references: z.array(referenceOut) }),
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const branch = await defaultBranch(project.project.id, project.project.settings);
    const refs = await listLibraryReferences(project.project.id, branch);
    const references = refs.map((r) => ({
      reference: libraryRefParam(r.key),
      name: libraryRefLabel(r),
      description: r.description,
      isDefault: r.isDefault,
      kept: r.kept,
      pinnedRun: r.pinnedRun?.number ?? null,
      shownRun: shownRun(r)?.number ?? null,
      latestRun: r.latestRun?.number ?? null,
      needsReview: r.latestCounts ? r.latestCounts.changed + r.latestCounts.new : 0,
      url: project.links.library(r.key),
    }));
    const def = refs.find((r) => r.isDefault) ?? refs[0];
    return {
      data: { project: project.ref, defaultReference: def ? libraryRefParam(def.key) : `branch:${branch}`, url: project.links.library(), references },
      render(md, d) {
        md.heading('Library', 2);
        md.line(`Opens on ${d.defaultReference}. ${link('Open the library', d.url)}`);
        md.table(
          ['Reference', 'Name', 'Shows', 'Waiting for review'],
          d.references.map((r) => [r.reference + (r.isDefault ? ' (default)' : ''), r.name, r.shownRun ? `run #${r.shownRun}${r.pinnedRun ? ' (pinned)' : ''}` : '–', r.needsReview]),
        );
      },
    };
  },
});

// ---------------------------------------------------------------- get_library_flows

const flowsInput = z.object({
  ...commonParams,
  ...refParams,
  test: z.string().optional().describe('Part of a test title, file or test case key (TC-12), to narrow the flows.'),
  limit: z.number().int().min(1).max(500).optional().describe('At most this many flows (default 50).'),
});

const flowsOutput = output({
  project: z.string(),
  reference: z.string(),
  name: z.string(),
  pinnedRun: z.number().nullable(),
  url: z.string(),
  total: z.number(),
  more: z.boolean().describe('More flows match than were returned: raise limit or narrow with test.'),
  flows: z.array(
    z.object({
      title: z.string(),
      file: z.string(),
      project: z.string(),
      run: z.number(),
      cases: z.array(z.object({ key: z.string(), title: z.string() })),
      checkpoints: z.array(
        z.object({
          order: z.number(),
          title: z.string(),
          description: z.string().nullable(),
          url: z.string().nullable(),
          captures: z.array(z.object({ captureId: z.string(), variant: z.string(), viewport: z.string().nullable() })),
        }),
      ),
    }),
  ),
});

export const getLibraryFlows = defineTool({
  name: 'get_library_flows',
  title: 'Get library flows',
  toolset: 'core',
  description:
    'The screens of a branch or pull request as the library shows them: each flow (test) with its test cases and its checkpoints in journey order, each with its variants’ capture ids. Look at an image with get_review_checkpoint. Defaults to the library’s default reference.',
  input: flowsInput,
  output: flowsOutput,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { run: ['read'] });
    const branch = await defaultBranch(project.project.id, project.project.settings);
    const key = refOf(args) ?? (await defaultLibraryRef(project.project.id, branch));
    const [reference, records] = await Promise.all([getLibraryReference(project.project.id, key, branch), libraryFlows(project.project.id, key)]);
    const cases = await casesOfTests(project.project.id, records.map((r) => r.testId));
    const q = args.test?.toLowerCase();
    const all = records
      .map((f) => ({
        title: f.titlePath.join(' › ') || f.title,
        file: f.file,
        project: f.project,
        run: f.runNumber,
        cases: (cases[f.testId] ?? []).map((c) => ({ key: c.key, title: c.title })),
        checkpoints: f.checkpoints.map((cp) => ({
          order: cp.sequence + 1,
          title: checkpointLabel(cp.name, cp.title),
          description: cp.description,
          url: cp.url,
          captures: cp.captures.map((c) => ({ captureId: c.id, variant: c.variant, viewport: c.viewportWidth ? `${c.viewportWidth}×${c.viewportHeight}` : null })),
        })),
      }))
      .filter((f) => !q || [f.title, f.file, ...f.cases.flatMap((c) => [c.key, c.title])].some((s) => s.toLowerCase().includes(q)));
    const limit = args.limit ?? 50;
    const flows = all.slice(0, limit);
    return {
      data: {
        project: project.ref,
        reference: libraryRefParam(key),
        name: libraryRefLabel(reference),
        pinnedRun: reference.pinnedRun?.number ?? null,
        url: project.links.library(key),
        total: all.length,
        more: all.length > flows.length,
        flows,
      },
      render(md, d) {
        md.heading(`Library: ${d.name}`, 2);
        md.line(`${d.total} flow${d.total === 1 ? '' : 's'}${d.pinnedRun ? `, pinned to run #${d.pinnedRun}` : ', each as its newest run captured it'}. ${link('Open in the library', d.url)}`);
        if (d.more) md.line(`Showing ${d.flows.length}; pass "limit" or "test" for the rest.`);
        for (const f of d.flows) {
          md.heading(`${f.title}${f.cases.length ? ` — ${f.cases.map((c) => c.key).join(', ')}` : ''}`, 3);
          md.table(
            ['#', 'Checkpoint', 'Variants (capture id)'],
            f.checkpoints.map((cp) => [cp.order, cp.title + (cp.description ? ` — ${cp.description}` : ''), cp.captures.map((c) => `${c.variant}: ${c.captureId}`).join(', ')]),
          );
        }
      },
    };
  },
});

// ---------------------------------------------------------------- set_library_reference

const setInput = z.object({
  ...commonParams,
  ...refParams,
  keep: z.boolean().optional().describe('false takes it out of the library. Default: keep it.'),
  pin: z.union([z.number().int().positive(), z.literal('latest')]).optional().describe('A run number to pin as the version shown, or "latest" to follow the newest run.'),
  default: z.boolean().optional().describe('true makes it the reference the library opens on.'),
  title: z.string().max(120).optional().describe('What readers call it, e.g. "Checkout redesign". Empty clears it.'),
  description: z.string().max(1000).optional().describe('A sentence on what it shows. Empty clears it.'),
});

export const setLibraryReferenceTool = defineTool({
  name: 'set_library_reference',
  title: 'Keep or pin a library reference',
  toolset: 'write',
  description:
    'Keep a branch or pull request in the library (a long-lived pull request can stay browsable while it is open), pin the run that documents it, make it the default, name it — or take it out. Needs a branch or pull request.',
  input: setInput,
  output: output({ project: z.string(), reference: z.string(), kept: z.boolean(), url: z.string() }),
  annotations: WRITE,
  async handler(args, ctx) {
    const project = await ctx.project(args.project, { review: ['decide'] });
    const key = refOf(args);
    if (!key) throw invalid('Pass "branch" or "pullRequest".');
    const { kept } = await setLibraryReference({
      projectId: project.project.id,
      key,
      userId: project.user.id,
      patch: {
        keep: args.keep ?? true,
        ...(args.pin !== undefined ? { pin: args.pin } : {}),
        ...(args.default !== undefined ? { isDefault: args.default } : {}),
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.description !== undefined ? { description: args.description } : {}),
      },
    }).catch((error: unknown) => {
      if (error instanceof LibraryError) throw invalid(error.message);
      throw error;
    });
    return {
      data: { project: project.ref, reference: libraryRefParam(key), kept, url: project.links.library(key) },
      render(md, d) {
        md.line(d.kept ? `${d.reference} is in the library. ${link('Open it', d.url)}` : `${d.reference} is no longer in the library.`);
      },
    };
  },
});

export const LIBRARY_TOOLS = [listLibrary, getLibraryFlows, setLibraryReferenceTool];
