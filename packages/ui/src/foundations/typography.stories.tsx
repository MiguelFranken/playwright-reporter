import type { Meta, StoryObj } from '@storybook/react';
import { Section } from './tokens';

/**
 * Roles, not sizes. A component asks for `text-headline-m` and gets a complete
 * style — size, line-height, weight, tracking, and for some roles case and
 * family. `cn` knows these are a single unit, so `cn('text-headline-m',
 * 'text-muted-foreground')` keeps both instead of dropping the role.
 */
const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
  tags: ['!test'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// `className` is spelled out rather than built from `name`: Tailwind scans for
// literal class names, so `text-${name}` would never be generated.
const ROLES: { group: string; roles: { name: string; className: string; use: string; sample?: string }[] }[] = [
  {
    group: 'Display — marketing only',
    roles: [
      { name: 'display-xl', className: 'text-display-xl', use: 'Hero headline, md and up', sample: 'Every Playwright run, kept.' },
      { name: 'display-l', className: 'text-display-l', use: 'Hero on mobile; section heading, md and up' },
      { name: 'display-m', className: 'text-display-m', use: 'Section heading on mobile; showcase heading' },
      { name: 'lead', className: 'text-lead', use: 'The sentence under a display headline' },
    ],
  },
  {
    group: 'Titles',
    roles: [
      { name: 'title-l', className: 'text-title-l', use: 'Page title, desktop' },
      { name: 'title-m', className: 'text-title-m', use: 'Page title, mobile; section title' },
    ],
  },
  {
    group: 'Headlines',
    roles: [
      { name: 'headline-m', className: 'text-headline-m', use: 'Card title' },
      { name: 'headline-s', className: 'text-headline-s', use: 'Sub-section within a card' },
    ],
  },
  {
    group: 'Body',
    roles: [
      { name: 'body-m', className: 'text-body-m', use: 'Default prose' },
      { name: 'body-s', className: 'text-body-s', use: 'Descriptions, help text' },
      { name: 'body-xs', className: 'text-body-xs', use: 'Dense table meta, counts' },
    ],
  },
  {
    group: 'Labels',
    roles: [
      { name: 'label-m', className: 'text-label-m', use: 'Buttons, tabs' },
      { name: 'label-s', className: 'text-label-s', use: 'Badges, small buttons' },
      { name: 'label-xs', className: 'text-label-xs', use: 'Densest chrome' },
      { name: 'eyebrow', className: 'text-eyebrow', use: 'Metric card caption', sample: 'Pass rate' },
    ],
  },
  {
    group: 'Metrics',
    roles: [
      { name: 'metric', className: 'text-metric', use: 'The number on a metric card', sample: '98.4%' },
      { name: 'metric-s', className: 'text-metric-s', use: 'Secondary figure', sample: '1,204' },
    ],
  },
  {
    group: 'Code',
    roles: [
      { name: 'code-s', className: 'text-code-s', use: 'File paths, SHAs', sample: 'tests/checkout.spec.ts:42' },
      { name: 'code-xs', className: 'text-code-xs', use: 'Stack traces, ANSI output', sample: 'at Page.click (index.js:118:9)' },
    ],
  },
];

const SAMPLE = 'Checkout flow keeps a guest cart';

export const AllRoles: Story = {
  render: () => (
    <div className="p-8">
      <h1 className="text-title-m">Typography roles</h1>
      <p className="mt-2 mb-8 max-w-prose text-body-s text-muted-foreground">
        Nineteen roles. Each is a complete style, so a component never composes
        a size with a weight by hand — and never invents a twentieth. The four
        display roles belong to <code className="text-code-s">src/marketing</code>;
        the app itself tops out at <code className="text-code-s">title-l</code>.
      </p>
      {ROLES.map((group) => (
        <Section key={group.group} title={group.group}>
          <div className="flex flex-col divide-y divide-separator">
            {group.roles.map((role) => (
              <div key={role.name} className="grid gap-2 py-4 md:grid-cols-[14rem_1fr] md:items-baseline">
                <div>
                  <div className="text-code-s">text-{role.name}</div>
                  <div className="text-body-xs text-muted-foreground">{role.use}</div>
                </div>
                <div className={`${role.className} min-w-0 truncate`}>{role.sample ?? SAMPLE}</div>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  ),
};

/** The two families, side by side, at the sizes they are actually used at. */
export const Families: Story = {
  render: () => (
    <div className="p-8">
      <Section title="Sans — Inter" hint="Interface text. Tabular figures wherever numbers align in a column.">
        <p className="text-body-m">{SAMPLE}</p>
        <p className="mt-2 text-body-m tabular-nums">0123456789 — 1,204 runs · 98.4% · 12m 30s</p>
      </Section>
      <Section
        title="Mono — JetBrains Mono"
        hint="Stack traces, SHAs and file paths are a large share of this product's surface, so the mono face is a real one rather than whatever the OS supplies."
      >
        <pre className="text-code-s whitespace-pre-wrap">{`Error: expect(locator).toBeVisible() failed
  at tests/checkout.spec.ts:42:18
  at Page.click (index.js:118:9)`}</pre>
      </Section>
    </div>
  ),
};
