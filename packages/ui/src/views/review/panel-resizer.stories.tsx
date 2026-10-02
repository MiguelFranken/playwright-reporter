import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PanelResizer } from './panel-resizer';

/** A panel on the right whose left edge is the resizer. */
function Panel(props: Omit<React.ComponentProps<typeof PanelResizer>, 'width' | 'onResize'> & { initial: number }) {
  const { initial, onResizeEnd, ...rest } = props;
  const [width, setWidth] = useState(initial);
  return (
    <div className="flex h-64 w-[56rem] border border-border">
      <div className="flex-1 bg-surface-sunken" />
      <aside aria-label="Panel" className="relative border-l border-border bg-surface p-4 text-sm" style={{ width }}>
        <PanelResizer {...rest} width={width} onResize={setWidth} onResizeEnd={onResizeEnd} />
        {width}px wide
      </aside>
    </div>
  );
}

const meta = {
  title: 'Views/Review/Viewer/PanelResizer',
  component: Panel,
  args: { initial: 320, min: 280, max: 640, defaultWidth: 320, label: 'Resize the panel', onResizeEnd: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Dragged left, the panel widens; the arrow keys move the edge too, within its limits. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const edge = canvas.getByRole('separator', { name: 'Resize the panel' });
    edge.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(edge).toHaveAttribute('aria-valuenow', '336');
    await expect(args.onResizeEnd).toHaveBeenLastCalledWith(336);
    await userEvent.keyboard('{End}');
    await expect(edge).toHaveAttribute('aria-valuenow', '640');
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await expect(edge).toHaveAttribute('aria-valuenow', '576');
    await userEvent.dblClick(edge);
    await expect(edge).toHaveAttribute('aria-valuenow', '320');
  },
};

/** At its narrowest. */
export const AtTheMinimum: Story = { args: { initial: 280 } };
