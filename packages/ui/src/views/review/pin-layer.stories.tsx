import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { drawingThread, NOW, reviewThreads, VIEWER_ID } from '../../fixtures/review-threads';
import { placeOrderFlow } from '../../fixtures/review';
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
  args: { captureId: tall.id, threads: reviewThreads, label: 'Checkout, desktop', now: NOW, viewerId: VIEWER_ID, canComment: true, onCreateThread: fn(), onReply: fn(), onSetThreadStatus: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OnAScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

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

export const Hidden: Story = {
  args: { hidden: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('button', { name: /^Thread/ })).toHaveLength(0);
  },
};

/** A drawing in four colours on the screen, its pin at the corner of the area it covers. */
export const WithADrawing: Story = {
  args: { threads: [...reviewThreads, drawingThread] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /^Thread 7, with a drawing/ })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="markup-shapes"]')).not.toBeNull();
  },
};

/** With the pen: a stroke, then a comment, and the thread carries the drawing. */
export const DrawWithThePen: Story = {
  args: { commenting: true, tool: 'pen', color: 'blue' },
  play: async ({ args, canvasElement }) => {
    const surface = within(canvasElement).getByRole('application', { name: /Draw on Checkout, desktop with the pen/ });
    const r = surface.getBoundingClientRect();
    const at = (x: number, y: number) => ({ clientX: r.left + x, clientY: r.top + y });
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: at(40, 40) },
      { target: surface, coords: at(80, 60) },
      { target: surface, coords: at(140, 50) },
      { keys: '[/MouseLeft]', target: surface, coords: at(180, 90) },
    ]);
    const body = within(document.body);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'The blue line should be straight{Enter}');
    await expect(args.onCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: tall.id,
        body: 'The blue line should be straight',
        anchor: expect.objectContaining({ kind: 'area' }),
        markup: [expect.objectContaining({ tool: 'pen', color: 'blue' })],
      }),
    );
  },
};

/** An arrow and a box in one comment: the composer stays open while drawing the second shape. */
export const DrawTwoShapes: Story = {
  render: function Render(args) {
    const [draft, setDraft] = useState<ThreadDraft | null>(null);
    const [tool, setTool] = useState<'arrow' | 'rect'>('arrow');
    return (
      <div className="flex flex-col items-center gap-2">
        <MarkupToolbar tool={tool} onToolChange={(t) => setTool(t as 'arrow' | 'rect')} color="green" onColorChange={() => {}} shapes={draft?.markup?.length ?? 0} />
        <ScreenFrame
          image={tall.image}
          frame={{ width: 1280, height: 720 }}
          zoom={0.5}
          alt="Checkout — desktop"
          overlay={() => <PinLayer {...args} commenting tool={tool} color="green" draft={draft} onDraftChange={setDraft} />}
        />
      </div>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const surface = canvas.getByRole('application');
    const r = surface.getBoundingClientRect();
    const at = (x: number, y: number) => ({ clientX: r.left + x, clientY: r.top + y });
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: at(60, 200) },
      { target: surface, coords: at(120, 150) },
      { keys: '[/MouseLeft]', target: surface, coords: at(160, 120) },
    ]);
    const body = within(document.body);
    await body.findByRole('textbox', { name: 'New comment' });
    await userEvent.click(canvas.getByRole('button', { name: 'Rectangle' }));
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: at(200, 60) },
      { target: surface, coords: at(260, 100) },
      { keys: '[/MouseLeft]', target: surface, coords: at(300, 140) },
    ]);
    await userEvent.type(await body.findByRole('textbox', { name: 'New comment' }), 'Move it into the green box{Enter}');
    const [input] = (args.onCreateThread as ReturnType<typeof fn>).mock.lastCall!;
    await expect(input.markup.map((s: { tool: string }) => s.tool)).toEqual(['arrow', 'rect']);
  },
};
