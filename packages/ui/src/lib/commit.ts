/**
 * What a run's commit line says when the reporter sent no commit message.
 *
 * Test images and other runs without a git checkout often know their commit
 * only by hash. "No commit message" then reads as if the commit had none; the
 * hash is what identifies it, so the line names that instead.
 */
export function commitTitle(run: { gitMessage: string | null; gitShortSha: string | null }): { text: string; muted: boolean } {
  const message = run.gitMessage?.split('\n')[0]?.trim();
  if (message) return { text: message, muted: false };
  if (run.gitShortSha) return { text: `Commit ${run.gitShortSha}`, muted: true };
  return { text: 'No commit information', muted: true };
}
