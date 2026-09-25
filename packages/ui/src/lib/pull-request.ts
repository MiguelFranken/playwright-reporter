/**
 * How a pull request is referred to: GitLab calls it a merge request and writes
 * `!1524`, GitHub and most others `#1524`. The link is the only thing a view
 * knows about the host, so it decides.
 */
export function pullRequestRef(number: number, url: string | null | undefined): string {
  return `${isMergeRequest(url) ? '!' : '#'}${number}`;
}

/** Whether the link is a GitLab merge request (`/-/merge_requests/42`). */
export function isMergeRequest(url: string | null | undefined): boolean {
  return Boolean(url && /\/merge_requests\/\d+/.test(url));
}

/** "Merge request" or "Pull request", after the host's own word. */
export function pullRequestNoun(url: string | null | undefined): string {
  return isMergeRequest(url) ? 'Merge request' : 'Pull request';
}
