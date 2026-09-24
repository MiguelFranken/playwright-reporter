/**
 * Rendering helpers shared by the Foundations stories. Not exported from the
 * package: these are documentation, not design-system surface.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Reads a custom property off the element the story is rendered in. */
export function useResolved(names: string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n).trim()])));
    // The theme toolbar swaps a class on an ancestor, which re-runs this.
  }, [names.join(',')]);
  return values;
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-headline-s">{title}</h2>
      {hint ? <p className="mt-1 max-w-prose text-body-s text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * The chip is painted from an inline `var(--token)` rather than a
 * `bg-<token>` class: Tailwind scans source text for literal class names, and a
 * class assembled at runtime would simply never be generated.
 */
export function Swatch({
  name,
  source,
  style,
  value,
}: {
  name: string;
  source?: string;
  style: CSSProperties;
  value?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="h-12 w-full rounded-lg border border-border" style={style} />
      <div className="min-w-0">
        <div className="truncate text-label-s">{name}</div>
        {source ? <div className="truncate text-code-xs text-muted-foreground">{source}</div> : null}
        {value ? <div className="truncate text-code-xs text-muted-foreground">{value}</div> : null}
      </div>
    </div>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{children}</div>;
}
