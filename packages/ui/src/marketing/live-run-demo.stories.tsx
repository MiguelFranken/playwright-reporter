import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { BrowserFrame } from './browser-frame';
import { LiveRunDemo } from './live-run-demo';

/**
 * The only thing on the site that moves. It replays a scripted run over the
 * catalogue's own `ActiveRuns` view — the same component the app renders, so
 * the hero is showing the product rather than a drawing of it.
 */
const meta = {
  title: 'Marketing/LiveRunDemo',
  component: LiveRunDemo,
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof LiveRunDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Framed: Story = {
  render: (args) => (
    <BrowserFrame url="reports.example.com/acme/web/runs">
      <div className="p-4">
        <LiveRunDemo {...args} />
      </div>
    </BrowserFrame>
  ),
};

export const Slow: Story = { args: { speed: 0.5 } };

/**
 * Server render and first paint are the finished run, so a reader who never
 * hydrates — or who asked for no motion — still sees a complete one.
 */
export const RendersTheFinalFrameFirst: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/active runs/i)).toBeVisible();
    await expect(canvas.getByText(/of 240 tests finished/)).toBeVisible();
  },
};
