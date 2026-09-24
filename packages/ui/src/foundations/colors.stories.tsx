import type { Meta, StoryObj } from '@storybook/react';
import { Grid, Section, Swatch, useResolved } from './tokens';

/**
 * Tier 1 is a value; tier 2 is a meaning. Components only ever name tier 2.
 * The theme toolbar re-renders these tables, so light and dark are the same
 * story viewed twice rather than two drifting copies.
 */
const meta = {
  title: 'Foundations/Colors',
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
  // Documentation tables, not behaviour — they carry no assertions.
  tags: ['!test'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const RAMPS: { label: string; prefix: string; steps: string[] }[] = [
  { label: 'Neutral', prefix: 'n', steps: ['50', '100', '150', '200', '250', '300', '400', '500', '600', '700', '800', '850', '900', '950', '1000'] },
  { label: 'Accent', prefix: 'a', steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] },
  { label: 'Success', prefix: 's', steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] },
  { label: 'Warning', prefix: 'w', steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] },
  { label: 'Danger', prefix: 'd', steps: ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] },
];

const SEMANTIC: { label: string; tokens: string[] }[] = [
  { label: 'Surfaces', tokens: ['background', 'surface', 'surface-sunken', 'card', 'popover', 'overlay', 'sidebar'] },
  { label: 'Text', tokens: ['foreground', 'muted-foreground', 'card-foreground', 'popover-foreground', 'sidebar-foreground'] },
  { label: 'Lines', tokens: ['border', 'border-strong', 'separator', 'input', 'ring'] },
  { label: 'Interactive', tokens: ['primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'accent', 'accent-foreground', 'destructive'] },
  { label: 'Charts', tokens: ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-grid'] },
];

const STATUS_FAMILIES = ['accent', 'success', 'warning', 'danger', 'info', 'neutral'] as const;
const STATUS_SLOTS = ['subtle', 'border', 'solid', 'text'] as const;

function Page({ children }: { children: React.ReactNode }) {
  return <div className="p-8">{children}</div>;
}

/** Tier 2 — the only tier a component is allowed to reference. */
export const Semantic: Story = {
  render: () => {
    const names = SEMANTIC.flatMap((g) => g.tokens).map((t) => `--${t}`);
    const values = useResolved(names);
    return (
      <Page>
        <h1 className="text-title-m">Semantic tokens</h1>
        <p className="mt-2 mb-8 max-w-prose text-body-s text-muted-foreground">
          Every one of these points at a primitive from the ramps below. A component
          names the meaning, never the value, which is what lets the dark theme be a
          re-point rather than a re-design.
        </p>
        {SEMANTIC.map((group) => (
          <Section key={group.label} title={group.label}>
            <Grid>
              {group.tokens.map((token) => (
                <Swatch
                  key={token}
                  name={token}
                  style={{ background: `var(--${token})` }}
                  value={values[`--${token}`]}
                />
              ))}
            </Grid>
          </Section>
        ))}
      </Page>
    );
  },
};

/**
 * The status families, four slots each. A badge uses subtle + border + text
 * together; a dot or a bar segment uses solid alone.
 */
export const Status: Story = {
  render: () => {
    const names = STATUS_FAMILIES.flatMap((f) => STATUS_SLOTS.map((s) => `--${f}-${s}`));
    const values = useResolved(names);
    return (
      <Page>
        <h1 className="text-title-m">Status families</h1>
        <p className="mt-2 mb-8 max-w-prose text-body-s text-muted-foreground">
          Five tones plus <code className="text-code-s">accent</code>, four slots each.
          Colour is never the only signal — see <code className="text-code-s">Patterns/StatusBadge</code>,
          where every tone also carries a label and an icon.
        </p>
        {STATUS_FAMILIES.map((family) => (
          <Section key={family} title={family}>
            <Grid>
              {STATUS_SLOTS.map((slot) => (
                <Swatch
                  key={slot}
                  name={`${family}-${slot}`}
                  style={{ background: `var(--${family}-${slot})` }}
                  value={values[`--${family}-${slot}`]}
                />
              ))}
            </Grid>
          </Section>
        ))}
      </Page>
    );
  },
};

/** Tier 1 — values. Listed so the ramps can be reviewed, never referenced by a component. */
export const Primitives: Story = {
  render: () => {
    const names = RAMPS.flatMap((r) => r.steps.map((s) => `--${r.prefix}-${s}`));
    const values = useResolved(names);
    return (
      <Page>
        <h1 className="text-title-m">Primitive ramps</h1>
        <p className="mt-2 mb-8 max-w-prose text-body-s text-muted-foreground">
          OKLCH, one hue held constant end to end per ramp, vividness peaking mid-ramp,
          steps denser at the light end. These name a value and nothing else.
        </p>
        {RAMPS.map((ramp) => (
          <Section key={ramp.label} title={ramp.label}>
            <div className="flex flex-wrap gap-2">
              {ramp.steps.map((step) => {
                const token = `--${ramp.prefix}-${step}`;
                return (
                  <div key={step} className="flex w-24 flex-col gap-1">
                    <div
                      className="h-12 rounded-lg border border-border"
                      style={{ background: `var(${token})` }}
                    />
                    <div className="text-code-xs text-muted-foreground">{token}</div>
                    <div className="truncate text-code-xs text-muted-foreground/70">{values[token]}</div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
      </Page>
    );
  },
};
