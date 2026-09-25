import type { AttachmentKind } from '@miguelfranken/protocol';

/**
 * Artifact kinds as the admin screens name them. Here rather than beside the
 * retention form, which is a client module: server-rendered views read the
 * labels too (trap 2 in AGENTS.md).
 */
export type ArtifactKind = AttachmentKind;

export const ARTIFACT_KIND_LABELS: Record<ArtifactKind, string> = {
  screenshot: 'Screenshots',
  video: 'Videos',
  trace: 'Traces',
  image: 'Images',
  text: 'Text',
  other: 'Other',
};
