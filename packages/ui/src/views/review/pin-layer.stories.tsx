import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { drawingThread, NOW, reviewDrawings, reviewThreads, VIEWER_ID } from '../../fixtures/review-threads';
import { placeOrderFlow } from '../../fixtures/review';
import type { CommentTool, MarkupColor, ReviewDrawingView } from '../../lib/review-markup';
import { MarkupToolbar } from './markup-toolbar';
import { PinLayer, type ThreadDraft } from './pin-layer';
import { ScreenFrame } from './screen-frame';

const tall = placeOrderFlow.checkpoints[1].captures[0];

/** A screen at half size with its pins, holding the open thread and the draft the way the viewer does. */
function OnAScreen(props: Omit<React.ComponentProps<typeof PinLayer>, 'openThreadId' | 'onOpenThreadChange' | 'draft' | 'onDraftChange'>) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<ThreadDraft | null>(null);
  return (
    <ScreenFrame
      image={tall.image}
      frame={{ width: 1280, height: 720 }}
      zoom={0.5}
      alt="Checkout — desktop"
      overlay={() => <PinLayer {...props} openThreadId={open} onOpenThreadChange={setOpen} draft={draft} onDraftChange={setDraft} />}
    />
  );
}

const meta = {
  title: 'Views/Review/Comments/PinLayer',
  component: OnAScreen,
  args: { captureId: tall.id, threads: reviewThreads, label: 'Checkout, desktop', now: NOW, viewerId: VIEWER_ID, canComment: true, onCreateThread: fn(), onReply: fn(), onSetThreadStatus: fn(), onDraw: fn(), onErase: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OnAScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Presses and drags on the layer, in its own pixels. */
async function drag(surface: HTMLElement, path: [number, number][]) {
  const r = surface.getBoundingClientRect();
  const at = ([x, y]: [number, number]) => ({ clientX: r.left + x, clientY: r.top + y });
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target: surface, coords: at(path[0]) },
    ...path.slice(1, -1).map((p) => ({ target: surface, coords: at(p) })),
    { keys: '[/MouseLeft]', target: surface, coords: at(path.at(-1)!) },
  ]);
}

/** Open pins (resolved ones hidden), an area, an outdated pin, and a count of the pins below the frame. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: /^Thread 4/ })).toBeNull();
    await waitFor(() => expect(canvas.getByRole('button', { name: /more below/ })).toBeVisible());
  },
};

export const WithResolved: Story = { args: { showResolved: true } };

/** Comment mode: a click drops a draft pin with its composer. */
export const Commenting: Story = {
  args: { commenting: true },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('application'));
    const body = within(document.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Bigger{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(expect.objectContaining({ captureId: tall.id, body: 'Bigger' }));
  },
};

/** The pin tool drops a pin where it was pressed, even when the pointer slips. */
export const PinIgnoresADrag: Story = {
  args: { commenting: true, tool: 'pin' },
  play: async ({ args, canvasElement }) => {
    await drag(within(canvasElement).getByRole('application'), [
      [100, 100],
      [160, 140],
      [220, 200],
    ]);
    const body = within(document.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Here{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(expect.objectContaining({ anchor: expect.objectContaining({ kind: 'point' }) }));
  },
};

/** The area tool: a drag marks the area to comment on; a click alone marks nothing. */
export const CommentOnAnArea: Story = {
  args: { commenting: true, tool: 'area' },
  play: async ({ args, canvasElement }) => {
    const surface = within(canvasElement).getByRole('application', { name: /Comment on an area of Checkout/ });
    await userEvent.click(surface);
    const body = within(document.body);
    await expect(body.queryByRole('textbox', { name: 'New comment' })).toBeNull();
    await drag(surface, [
      [80, 80],
      [160, 120],
      [240, 160],
    ]);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'This block{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(expect.objectContaining({ anchor: expect.objectContaining({ kind: 'area' }), body: 'This block' }));
  },
};

/** The area tool from the keyboard: Enter at one corner, the arrow keys, Enter at the other. */
export const AreaFromTheKeyboard: Story = {
  args: { commenting: true, tool: 'area' },
  play: async ({ args, canvasElement }) => {
    const surface = within(canvasElement).getByRole('application');
    surface.focus();
    await userEvent.keyboard('{Enter}{Enter}{Shift>}{ArrowRight}{ArrowDown}{/Shift}{Enter}');
    const body = within(document.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Here{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(expect.objectContaining({ anchor: expect.objectContaining({ kind: 'area' }) }));
  },
};

export const Hidden: Story = {
  args: { hidden: true, drawings: reviewDrawings },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('button', { name: /^Thread/ })).toHaveLength(0);
    await expect(canvasElement.querySelector('[data-slot="markup-shapes"]')).toBeNull();
  },
};

/** A comment that carries a drawing (made before drawings stood on their own), its pin at the corner of the area it covers. */
export const WithADrawing: Story = {
  args: { threads: [...reviewThreads, drawingThread] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /^Thread 7, with a drawing/ })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="markup-shapes"]')).not.toBeNull();
  },
};

/** Drawings on their own beside the pins: an arrow, a highlight and a circle, with no pin of their own. */
export const WithDrawings: Story = { args: { drawings: reviewDrawings } };

/** With the pen: a stroke is saved as it is let go, and no comment opens. */
export const DrawWithThePen: Story = {
  args: { commenting: true, tool: 'pen', color: 'blue' },
  play: async ({ args, canvasElement }) => {
    const surface = within(canvasElement).getByRole('application', { name: /Draw on Checkout, desktop with the pen/ });
    await drag(surface, [
      [40, 40],
      [60, 50],
      [80, 60],
      [110, 58],
      [140, 50],
      [180, 90],
    ]);
    await expect(args.onDraw).toHaveBeenCalledWith(expect.objectContaining({ tool: 'pen', color: 'blue' }), expect.anything());
    const [shape] = (args.onDraw as ReturnType<typeof fn>).mock.lastCall!;
    // The stroke ends where the pointer let go, whatever the steadying held back.
    await expect(shape.points.length).toBeGreaterThanOrEqual(4);
    await expect(within(document.body).queryByRole('textbox', { name: 'New comment' })).toBeNull();
  },
};

/** A press without a drag draws no arrow: nothing shows, nothing is saved. */
export const AClickDrawsNoArrow: Story = {
  args: { commenting: true, tool: 'arrow' },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('application'));
    await expect(args.onDraw).not.toHaveBeenCalled();
    await expect(canvasElement.querySelector('[data-slot="markup-shapes"]')).toBeNull();
  },
};

/** Held the way the viewer holds them: shapes drawn join the image, and the eraser takes the viewer's own away. */
function Drawing(args: React.ComponentProps<typeof PinLayer>) {
  const [drawings, setDrawings] = useState<ReviewDrawingView[]>(reviewDrawings);
  const [tool, setTool] = useState<CommentTool>('arrow');
  const [color, setColor] = useState<MarkupColor>('green');
  return (
    <div className="flex flex-col items-center gap-2">
      <MarkupToolbar tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />
      <ScreenFrame
        image={tall.image}
        frame={{ width: 1280, height: 720 }}
        zoom={0.5}
        alt="Checkout — desktop"
        overlay={() => (
          <PinLayer
            {...args}
            commenting
            tool={tool}
            color={color}
            drawings={drawings}
            onDraw={(shape, size) => {
              args.onDraw?.(shape, size);
              setDrawings((d) => [...d, { ...shape, id: `new-${d.length}`, authorId: VIEWER_ID }]);
            }}
            onErase={(gone) => {
              args.onErase?.(gone);
              setDrawings((d) => d.filter((x) => !gone.includes(x)));
            }}
          />
        )}
      />
    </div>
  );
}

/** An arrow, then a box: each is saved on its own, and the colours show only for the drawing tools. */
export const DrawShapes: Story = {
  render: (args) => <Drawing {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole('application');
    await drag(surface, [
      [60, 200],
      [120, 150],
      [160, 120],
    ]);
    await userEvent.click(canvas.getByRole('button', { name: 'Rectangle' }));
    await drag(surface, [
      [200, 60],
      [260, 100],
      [300, 140],
    ]);
    await expect((args.onDraw as ReturnType<typeof fn>).mock.calls.map(([s]) => s.tool)).toEqual(['arrow', 'rect']);
    await expect(within(document.body).queryByRole('textbox', { name: 'New comment' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Area' }));
    await expect(canvas.queryByRole('group', { name: 'Colour' })).toBeNull();
  },
};

/** The eraser: a click on the viewer's arrow takes it away; Grace's circle stays, it is hers. */
export const Erase: Story = {
  render: (args) => <Drawing {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Eraser' }));
    const surface = canvas.getByRole('application', { name: /Erase drawings/ });
    const r = surface.getBoundingClientRect();
    // The middle of the red arrow, from (0.3, 0.55) to (0.55, 0.36).
    const mid = { clientX: r.left + r.width * 0.425, clientY: r.top + r.height * 0.455 };
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: mid },
      { keys: '[/MouseLeft]', target: surface, coords: mid },
    ]);
    await expect(args.onErase).toHaveBeenCalledWith([expect.objectContaining({ id: 'drawing-1' })]);
    // Across Grace's circle: not hers to erase.
    const rim = { clientX: r.left + r.width * 0.52, clientY: r.top + r.height * 0.33 };
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: rim },
      { keys: '[/MouseLeft]', target: surface, coords: rim },
    ]);
    await expect(args.onErase).toHaveBeenCalledTimes(1);
  },
};
