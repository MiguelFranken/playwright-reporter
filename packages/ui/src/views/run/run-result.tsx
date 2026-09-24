/**
 * What one test's result looks like to every view that renders it, and the
 * one href each of them needs.
 *
 * The shape lives here rather than in the database layer so it lists exactly
 * what the UI reads — the query that feeds it is then checked against the view
 * instead of the other way round.
 */
import { Camera, FileText, Film, Paperclip, Route } from 'lucide-react';

/** One test's result inside a run. */
export interface RunResultRow {
  id: string;
  testId: string;
  outcome: string;
  durationMs: number;
  attemptCount: number;
  errorMessage: string | null;
  errorSignature: string | null;
  annotations: { type: string; description?: string }[];
  tags: string[];
  title: string;
  titlePath: string[];
  file: string;
  pwProject: string;
  line: number;
  history: string[];
  attachmentKinds: string[];
}

export interface RunResultsHrefs {
  result: (resultId: string) => string;
}

const kindIcon: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  screenshot: { icon: Camera, label: 'Screenshot' },
  image: { icon: Camera, label: 'Image' },
  video: { icon: Film, label: 'Video' },
  trace: { icon: Route, label: 'Trace' },
  text: { icon: FileText, label: 'Text' },
  other: { icon: Paperclip, label: 'Attachment' },
};

export function ArtifactIcons({ kinds }: { kinds: string[] }) {
  if (kinds.length === 0) return <span className="text-muted-foreground">–</span>;
  const order = ['screenshot', 'image', 'video', 'trace', 'text', 'other'];
  const sorted = [...new Set(kinds)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      {sorted.map((k) => {
        const meta = kindIcon[k] ?? kindIcon.other;
        const Icon = meta.icon;
        return (
          <span key={k} title={meta.label}>
            <Icon className="size-3.5" />
          </span>
        );
      })}
    </span>
  );
}
