/**
 * Absolute links into the app, so an assistant can hand the human the page
 * with the full picture. Built from the same href helpers the UI uses.
 */
import { baseUrl } from '@/lib/auth/config';
import { commitUrl, projectHrefs } from '@/lib/view-models';

export { commitUrl };

export function projectBase(teamSlug: string, projectSlug: string) {
  return `${baseUrl()}/teams/${encodeURIComponent(teamSlug)}/projects/${encodeURIComponent(projectSlug)}`;
}

export function projectLinks(teamSlug: string, projectSlug: string) {
  const base = projectBase(teamSlug, projectSlug);
  return { base, ...projectHrefs(base) };
}

export type ProjectLinks = ReturnType<typeof projectLinks>;

/** A diff between two commits on GitHub or GitLab; other hosts get none rather than a wrong one. */
export function compareUrl(repoUrl: string | null, fromSha: string | null, toSha: string | null): string | null {
  if (!repoUrl || !fromSha || !toSha || fromSha === toSha) return null;
  const base = repoUrl.replace(/\.git$/, '').replace(/\/+$/, '');
  if (/gitlab/i.test(base)) return `${base}/-/compare/${fromSha}...${toSha}`;
  if (/github/i.test(base)) return `${base}/compare/${fromSha}...${toSha}`;
  return null;
}
