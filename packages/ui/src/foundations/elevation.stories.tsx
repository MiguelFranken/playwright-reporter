import type { Meta, StoryObj } from '@storybook/react';
import { Section } from './tokens';

const meta = {
  title: 'Foundations/Radius & Elevation',
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
  tags: ['!test'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const RADII = [
  { name: 'radius-sm', className: 'rounded-sm', use: 'Sparkline cells, tiny chips' },
  { name: 'radius-md', className: 'rounded-md', use: 'Tabs, menu items' },
  { name: 'radius-lg', className: 'rounded-lg', use: 'Buttons, inputs, alerts' },
  { name: 'radius-xl', className: 'rounded-xl', use: 'Cards, dialogs' },
  { name: 'radius-2xl', className: 'rounded-2xl', use: 'Large surfaces' },
  { name: 'radius-3xl', className: 'rounded-3xl', use: 'Hero surfaces' },
];

const ELEVATIONS = [
  { name: 'shadow-e1', className: 'shadow-e1', use: 'Resting card — separates from the page' },
  { name: 'shadow-e2', className: 'shadow-e2', use: 'Popover, dropdown, hover card' },
  { name: 'shadow-e3', className: 'shadow-e3', use: 'Dialog and sheet — the only modal layer' },
];

export const Radius: Story = {
  render: () => (
    <div className="p-8">
      <Section
        title="Radius"
        hint="One --radius drives the scale. Nested corners are concentric: an inner radius is the outer one minus the padding between them, which is why the segmented control computes its thumb radius rather than picking one."
      >
        <div className="flex flex-wrap gap-6">
          {RADII.map((r) => (
            <div key={r.name} className="w-40">
              <div className={`h-20 border border-border bg-surface-sunken ${r.className}`} />
              <div className="mt-2 text-code-xs">{r.name}</div>
              <div className="text-body-xs text-muted-foreground">{r.use}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};

export const Elevation: Story = {
  render: () => (
    <div className="bg-background p-8">
      <Section
        title="Elevation"
        hint="Three steps, and each one means a layer rather than a weight. If something needs a fourth, it probably belongs on one of the three."
      >
        <div className="flex flex-wrap gap-8">
          {ELEVATIONS.map((e) => (
            <div key={e.name} className="w-56">
              <div className={`flex h-24 items-center justify-center rounded-xl border border-border bg-card ${e.className}`}>
                <span className="text-label-s text-muted-foreground">{e.name}</span>
              </div>
              <div className="mt-2 text-body-xs text-muted-foreground">{e.use}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};

export const Motion: Story = {
  render: () => (
    <div className="p-8">
      <Section
        title="Motion"
        hint="Everything that moves uses the same curve — cubic-bezier(0.2, 0, 0, 1) — at 150ms for state changes and 200ms for a travelling element such as the segmented control's thumb. Anything slower reads as lag in a tool people keep open all day."
      >
        <div className="flex flex-col gap-3 text-body-s">
          <div>
            <span className="text-code-s">150ms</span> — colour, border, shadow, scale on press
          </div>
          <div>
            <span className="text-code-s">200ms</span> — position and size of a moving indicator
          </div>
          <div>
            <span className="text-code-s">prefers-reduced-motion</span> — the spinner in{' '}
            <code className="text-code-s">StatusBadge status=&quot;running&quot;</code> is the only
            perpetual animation; everything else is a transition and stops on its own.
          </div>
        </div>
      </Section>
    </div>
  ),
};
