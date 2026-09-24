import type { Meta, StoryObj } from '@storybook/react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Clock,
  Copy,
  ExternalLink,
  FileCode2,
  Filter,
  GitBranch,
  GitCommitHorizontal,
  Inbox,
  Info,
  Loader2,
  MinusCircle,
  Monitor,
  Play,
  Repeat2,
  Search,
  Settings,
  TriangleAlert,
  Video,
  XCircle,
} from 'lucide-react';
import { Section } from './tokens';

/**
 * Lucide, at the sizes the primitives set for themselves: 4 (`size-4`) inside a
 * default button, 3.5 in a small one, 3 in a badge. Icons are never the only
 * carrier of meaning — every status icon travels with its label.
 */
const meta = {
  title: 'Foundations/Icons',
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
  tags: ['!test'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SETS: { title: string; hint: string; icons: [string, React.ComponentType<{ className?: string }>][] }[] = [
  {
    title: 'Status',
    hint: 'Fixed by lib/tone.ts. Changing one of these changes it everywhere at once.',
    icons: [
      ['passed', CheckCircle2],
      ['failed', XCircle],
      ['flaky', Repeat2],
      ['skipped', MinusCircle],
      ['timed out', AlertTriangle],
      ['interrupted', CircleSlash],
      ['running', Loader2],
    ],
  },
  {
    title: 'Run metadata',
    hint: 'What a run header and a runs table are made of.',
    icons: [
      ['branch', GitBranch],
      ['commit', GitCommitHorizontal],
      ['duration', Clock],
      ['executor', Monitor],
      ['spec file', FileCode2],
      ['video', Video],
    ],
  },
  {
    title: 'Chrome',
    hint: 'Shared across filters, tables and settings.',
    icons: [
      ['search', Search],
      ['filter', Filter],
      ['expand', ChevronDown],
      ['copy', Copy],
      ['external', ExternalLink],
      ['settings', Settings],
      ['hint', Info],
      ['warning', TriangleAlert],
      ['empty', Inbox],
      ['run', Play],
    ],
  },
];

export const Catalogue: Story = {
  render: () => (
    <div className="p-8">
      <h1 className="text-title-m">Icons</h1>
      <p className="mt-2 mb-8 max-w-prose text-body-s text-muted-foreground">
        The working set. Reach for one of these before importing a new glyph — a
        second icon for a concept that already has one is how an interface stops
        being readable at a glance.
      </p>
      {SETS.map((set) => (
        <Section key={set.title} title={set.title} hint={set.hint}>
          <div className="flex flex-wrap gap-6">
            {set.icons.map(([label, Icon]) => (
              <div key={label} className="flex w-28 flex-col items-center gap-2 text-center">
                <Icon className="size-5" />
                <span className="text-body-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="p-8">
      <Section title="Sizes" hint="A primitive sets its own icon size; pass a size-* class only to override it deliberately.">
        <div className="flex items-end gap-8">
          {[
            ['size-3', 'badge'],
            ['size-3.5', 'small button'],
            ['size-4', 'default button'],
            ['size-5', 'standalone'],
          ].map(([cls, use]) => (
            <div key={cls} className="flex flex-col items-center gap-2">
              <GitBranch className={cls} />
              <span className="text-code-xs">{cls}</span>
              <span className="text-body-xs text-muted-foreground">{use}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
};
