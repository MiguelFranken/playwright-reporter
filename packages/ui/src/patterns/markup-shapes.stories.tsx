import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { drawingMarkup } from '../fixtures/review-threads';
import { MARKUP_COLORS } from '../lib/review-markup';
import { MarkupShapes, MarkupSwatch } from './markup-shapes';

/** A drawing over a stand-in for a screenshot: light stripes, as busy as a page. */
function OnAPage(props: React.ComponentProps<typeof MarkupShapes>) {
  return (
    <div className="relative h-80 w-[36rem] overflow-hidden rounded-lg bg-[repeating-linear-gradient(0deg,var(--muted),var(--muted)_18px,var(--surface)_18px,var(--surface)_36px)] ring-1 ring-border">
      <MarkupShapes {...props} />
    </div>
  );
}

const meta = {
  title: 'Patterns/Controls/MarkupShapes',
  component: OnAPage,
  args: { shapes: drawingMarkup },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OnAPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every tool: an ellipse, a box, an arrow, a highlighter and a pen stroke, each in its colour. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('[data-slot="markup-shapes"]')!;
    await expect(svg.querySelectorAll('ellipse')).toHaveLength(2);
    await expect(svg.querySelectorAll('marker')).toHaveLength(1);
  },
};

/** Its thread is open: lines a little heavier. */
export const Emphasis: Story = { args: { emphasis: true } };

/** Drawn on an earlier image that changed since. */
export const Outdated: Story = { args: { dashed: true } };

/** Resolved: the drawing recedes. */
export const Resolved: Story = { args: { muted: true } };

/** Nothing drawn: nothing shown. */
export const Empty: Story = { args: { shapes: [] } };

/** The colours, as swatches beside a thread. */
export const Swatches: Story = {
  render: () => (
    <ul className="flex gap-3 text-label-s">
      {MARKUP_COLORS.map((c) => (
        <li key={c} className="flex items-center gap-1.5 capitalize">
          <MarkupSwatch color={c} /> {c}
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(6);
  },
};
