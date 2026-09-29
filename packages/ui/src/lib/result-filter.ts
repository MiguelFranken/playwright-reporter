/**
 * The summary tab's facet filters: what a test left behind and where it ran,
 * on top of the outcome pills and the title search.
 *
 * Plain data and pure functions, like `spec-filter`, so the server page that
 * reads them out of the URL and the client view that renders the menu share
 * one vocabulary and one predicate.
 */

/** The attachment kinds worth filtering by; an `image` attachment counts as a screenshot. */
export const ARTIFACT_KINDS = ['screenshot', 'video', 'trace'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** `screenshot` keeps tests with one, `no-screenshot` tests without. */
export type ArtifactFilter = ArtifactKind | `no-${ArtifactKind}`;

export const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  screenshot: 'screenshot',
  video: 'video',
  trace: 'trace',
};

export interface ResultFacets {
  /** Every entry must hold (with a screenshot *and* without a video). */
  artifact?: ArtifactFilter[];
  /** Playwright projects; a test in any of them matches. */
  pwProject?: string[];
  /** A test carrying any of these tags matches. */
  tag?: string[];
  /** Only tests that needed more than one attempt. */
  retried?: boolean;
}

/** The URL params the facets live in. */
export const RESULT_FACET_PARAMS = ['artifact', 'pwProject', 'tag', 'retried'] as const;

const ARTIFACT_FILTERS = new Set<string>(ARTIFACT_KINDS.flatMap((k) => [k, `no-${k}`]));

/** Reads the facets from search params, however the caller holds them. */
export function parseResultFacets(getAll: (key: string) => string[]): ResultFacets {
  const artifact = getAll('artifact').filter((v): v is ArtifactFilter => ARTIFACT_FILTERS.has(v));
  const pwProject = getAll('pwProject').filter(Boolean);
  const tag = getAll('tag').filter(Boolean);
  const retried = getAll('retried').some((v) => v === '1' || v === 'true');
  return {
    ...(artifact.length ? { artifact } : {}),
    ...(pwProject.length ? { pwProject } : {}),
    ...(tag.length ? { tag } : {}),
    ...(retried ? { retried } : {}),
  };
}

/** The facets as search params, for links that keep them. */
export function resultFacetParams(f: ResultFacets): Record<string, string | string[] | undefined> {
  return { artifact: f.artifact, pwProject: f.pwProject, tag: f.tag, retried: f.retried ? '1' : undefined };
}

export function hasResultFacets(f: ResultFacets): boolean {
  return countResultFacets(f) > 0;
}

/** How many facet values are set: what the closed menu's badge says. */
export function countResultFacets(f: ResultFacets): number {
  return (f.artifact?.length ?? 0) + (f.pwProject?.length ?? 0) + (f.tag?.length ?? 0) + (f.retried ? 1 : 0);
}

export function hasArtifact(kinds: string[], kind: ArtifactKind): boolean {
  return kind === 'screenshot' ? kinds.includes('screenshot') || kinds.includes('image') : kinds.includes(kind);
}

export function matchesResultFacets(
  row: { attachmentKinds: string[]; pwProject: string; tags: string[]; attemptCount: number },
  f: ResultFacets,
): boolean {
  for (const a of f.artifact ?? []) {
    const without = a.startsWith('no-');
    const kind = (without ? a.slice(3) : a) as ArtifactKind;
    if (hasArtifact(row.attachmentKinds, kind) === without) return false;
  }
  if (f.pwProject?.length && !f.pwProject.includes(row.pwProject)) return false;
  if (f.tag?.length && !row.tags.some((t) => f.tag!.includes(t))) return false;
  if (f.retried && row.attemptCount <= 1) return false;
  return true;
}
