import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea } from './scroll-area';

const meta = {
  title: 'Primitives/ScrollArea',
  component: ScrollArea,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

const LINES = Array.from(
  { length: 40 },
  (_, i) => `  at Object.<anonymous> (tests/checkout.spec.ts:${40 + i}:${(i % 30) + 4})`,
);

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-64 w-full max-w-xl rounded-lg border border-border">
      <pre className="p-4 text-code-xs whitespace-pre">{LINES.join('\n')}</pre>
    </ScrollArea>
  ),
};

/** Stack traces are wide as well as tall, which is the case that catches layouts out. */
export const BothAxes: Story = {
  render: () => (
    <ScrollArea className="h-48 w-full max-w-md rounded-lg border border-border">
      <pre className="p-4 text-code-xs whitespace-pre">
        {LINES.map((l) => `${l}   —— and a very long trailing annotation to force horizontal overflow`).join('\n')}
      </pre>
    </ScrollArea>
  ),
};
