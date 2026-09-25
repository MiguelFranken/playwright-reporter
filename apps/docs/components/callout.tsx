import { AlertTriangle, CircleX, Info, Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';

const TONES = {
  info: { icon: Info, box: 'border-info-border bg-info-subtle', text: 'text-info-text' },
  warn: { icon: AlertTriangle, box: 'border-warning-border bg-warning-subtle', text: 'text-warning-text' },
  warning: { icon: AlertTriangle, box: 'border-warning-border bg-warning-subtle', text: 'text-warning-text' },
  error: { icon: CircleX, box: 'border-danger-border bg-danger-subtle', text: 'text-danger-text' },
  idea: { icon: Lightbulb, box: 'border-accent-border bg-accent-subtle', text: 'text-accent-text' },
} as const;

/** A callout in the design system's tones: subtle fill, tone border, tone icon and title. */
export function Callout({ type = 'info', title, children }: { type?: keyof typeof TONES; title?: ReactNode; children?: ReactNode }) {
  const tone = TONES[type] ?? TONES.info;
  const Icon = tone.icon;
  return (
    <div className={`not-prose my-6 flex gap-3 rounded-xl border px-4 py-3.5 ${tone.box}`}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone.text}`} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1 text-body-m text-foreground/85 [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:bg-surface/70 [&_code]:px-1 [&_code]:text-code-s [&_p]:leading-relaxed">
        {title ? <p className={`font-semibold ${tone.text}`}>{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
