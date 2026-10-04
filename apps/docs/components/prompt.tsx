import type { ReactNode } from 'react';

/**
 * A prompt to copy into an assistant: the code block inside wraps its lines
 * instead of scrolling, and shows in full — prose, not code.
 */
export function Prompt({ children }: { children?: ReactNode }) {
  return <div className="docs-prompt">{children}</div>;
}
