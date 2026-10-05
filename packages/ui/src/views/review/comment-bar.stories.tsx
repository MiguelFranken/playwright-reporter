import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { cn } from '../../lib/cn';
import type { CommentTool, MarkupColor } from '../../lib/review-markup';
import { CommentBar } from './markup-toolbar';

const meta = {
  title: 'Views/Review/Comments/CommentBar',
  component: CommentBar,
  args: { commenting: false, onCommentingChange: fn(), tool: 'pin', color: 'red', onToolChange: fn(), onColorChange: fn(), onUndo: fn() },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CommentBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Folded: one button that turns comment mode on. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('toolbar', { name: 'Comment tools' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await expect(args.onCommentingChange).toHaveBeenCalledWith(true);
  },
};

/** Folded, with the open comments on the screen counted. */
export const WithOpenComments: Story = { args: { openCount: 4 } };

/** Unfolded: the tools, and the button that folds the bar again. */
export const Commenting: Story = {
  args: { commenting: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(args.onCommentingChange).toHaveBeenCalledWith(false);
  },
};

/** The way the viewer holds it: a click unfolds it, Stop commenting folds it. */
export const Interactive: Story = {
  render: (args) => {
    const [commenting, setCommenting] = useState(false);
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting={commenting} onCommentingChange={setCommenting} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Pen' }));
    await expect(canvas.getByRole('button', { name: 'Pen' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(await canvas.findByRole('button', { name: 'Comment' })).toBeInTheDocument();
  },
};

const POSITION_KEY = 'story:comment-bar-position';

/** A stage for the bar to move about on: the bar stays inside it, and docks to its sides. */
function Stage({ children, short = false }: { children: React.ReactNode; short?: boolean }) {
  return (
    <div data-float-bounds className={cn('relative flex w-[22rem] items-end justify-center rounded-lg border border-dashed border-border pb-4', short ? 'h-40' : 'h-[46rem]')}>
      {children}
    </div>
  );
}

/** The bar the way the viewer holds it, on a stage, remembering its place under the story's own key. */
function Held(args: React.ComponentProps<typeof CommentBar> & { short?: boolean }) {
  const { short, ...rest } = args;
  const [commenting, setCommenting] = useState(rest.commenting);
  const [tool, setTool] = useState<CommentTool>(rest.tool);
  const [color, setColor] = useState<MarkupColor>(rest.color);
  return (
    <Stage short={short}>
      <CommentBar {...rest} positionKey={POSITION_KEY} commenting={commenting} onCommentingChange={setCommenting} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />
    </Stage>
  );
}

const stored = () => JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as { dock: string | null; x: number; y: number } | null;
const bar = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('[data-slot="comment-bar"]')!;
const anchor = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('[data-slot="comment-bar-anchor"]')!;

/** Starts each story with nothing remembered, or with the place given, and forgets it afterwards. */
const remembering = (placement?: { dock: 'left' | 'right' | null; x: number; y: number }) => () => {
  if (placement) localStorage.setItem(POSITION_KEY, JSON.stringify({ v: 2, ...placement }));
  else localStorage.removeItem(POSITION_KEY);
  return () => localStorage.removeItem(POSITION_KEY);
};

/** Moved off what it covers by its grip, with the keys here; the browser remembers where, and Home puts it back. */
export const Moved: Story = {
  render: (args) => <Held {...args} />,
  beforeEach: remembering(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Move the comment bar' }).focus();
    await userEvent.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}');
    await waitFor(() => expect(stored()).toMatchObject({ dock: null }));
    await expect(stored()!.y).toBeLessThan(0.8);
    await expect(bar(canvasElement)).not.toHaveAttribute('data-dock');
    await userEvent.keyboard('{Home}');
    await expect(stored()).toBeNull();
  },
};

/**
 * Against the left edge it docks, and stands upright: the tools run top to
 * bottom, their tooltips open to the right. → pulls it off the edge again.
 */
export const DockWithTheKeyboard: Story = {
  args: { commenting: true },
  render: (args) => <Held {...args} />,
  beforeEach: remembering(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Move the comment bar' }).focus();
    // Along to the edge, and one more: into it.
    for (let i = 0; i < 8 && !bar(canvasElement).dataset.dock; i++) await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await waitFor(() => expect(bar(canvasElement)).toHaveAttribute('data-dock', 'left'));
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toHaveAttribute('aria-orientation', 'vertical');
    await expect(stored()).toMatchObject({ dock: 'left' });
    // The grip keeps the focus through the turn, so the keys go on working.
    await expect(canvas.getByRole('button', { name: 'Move the comment bar' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(bar(canvasElement)).not.toHaveAttribute('data-dock'));
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toHaveAttribute('aria-orientation', 'horizontal');
  },
};

/** Dragged by its grip to the right edge it docks there, upright; dragged back into the middle it lies down. */
export const DockByDragging: Story = {
  render: (args) => <Held {...args} />,
  beforeEach: remembering(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // One pointer for the whole story: the button is still held from one step to the next.
    const user = userEvent.setup();
    const grip = canvas.getByRole('button', { name: 'Move the comment bar' });
    const stage = canvasElement.querySelector<HTMLElement>('[data-float-bounds]')!.getBoundingClientRect();
    const g = grip.getBoundingClientRect();
    const start = { clientX: g.left + g.width / 2, clientY: g.top + g.height / 2 };
    await user.pointer([
      { keys: '[MouseLeft>]', target: grip, coords: start },
      { target: grip, coords: { clientX: stage.left + stage.width / 2, clientY: stage.top + stage.height / 2 } },
      { target: grip, coords: { clientX: stage.right - 12, clientY: stage.top + stage.height / 2 } },
    ]);
    await waitFor(() => expect(bar(canvasElement)).toHaveAttribute('data-dock', 'right'));
    // Held, it is where the pointer has it at once: its place (the anchor's) does not ease after it, docking or not.
    await expect(anchor(canvasElement)).toHaveAttribute('data-dragging');
    await expect(getComputedStyle(anchor(canvasElement)).transitionProperty).not.toMatch(/translate|all/);
    await user.pointer({ keys: '[/MouseLeft]', target: grip, coords: { clientX: stage.right - 12, clientY: stage.top + stage.height / 2 } });
    await expect(anchor(canvasElement)).not.toHaveAttribute('data-dragging');
    await waitFor(() => expect(stored()).toMatchObject({ dock: 'right' }));
    const docked = grip.getBoundingClientRect();
    const at = { clientX: docked.left + docked.width / 2, clientY: docked.top + docked.height / 2 };
    await user.pointer([
      { keys: '[MouseLeft>]', target: grip, coords: at },
      { target: grip, coords: { clientX: stage.left + stage.width / 2, clientY: at.clientY } },
      { keys: '[/MouseLeft]', target: grip, coords: { clientX: stage.left + stage.width / 2, clientY: at.clientY } },
    ]);
    await waitFor(() => expect(bar(canvasElement)).not.toHaveAttribute('data-dock'));
    await expect(stored()).toMatchObject({ dock: null });
  },
};

/**
 * What the bar eases when `button` is pressed: each property, from where to
 * where. Read from its CSS transitions as they start, not frame by frame — a
 * story in a hidden frame gets no animation frames to count.
 */
async function eased(el: HTMLElement, button: HTMLElement) {
  button.click();
  // A moment in, well inside the ease: what is easing is easing from where it started.
  await new Promise((r) => setTimeout(r, 60));
  const out: Record<string, [number, number]> = {};
  for (const a of el.getAnimations()) {
    // A transition, not the bar's entrance; by shape, since the story's realm is not the page's.
    if (!('transitionProperty' in a)) continue;
    const property = (a as CSSTransition).transitionProperty;
    const [from, to] = (a.effect as KeyframeEffect).getKeyframes();
    out[property] = [Number.parseFloat(String(from[property])), Number.parseFloat(String(to[property]))];
  }
  // Let it arrive before the next step.
  await new Promise((r) => setTimeout(r, 400));
  return out;
}

/**
 * Folding and unfolding grow the bar along its run only: wider lying down,
 * taller upright — and upright, from its own folded size, never from the
 * shape it had lying down.
 */
export const GrowsAlongItsRun: Story = {
  render: (args) => <Held {...args} />,
  beforeEach: remembering(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const el = bar(canvasElement);
    // Lying down: unfolding and folding ease its width only.
    const unfolded = await eased(el, canvas.getByRole('button', { name: 'Comment' }));
    await expect(Object.keys(unfolded), 'unfolded: what eases').toEqual(['width']);
    await expect(unfolded.width[1] - unfolded.width[0]).toBeGreaterThan(100);
    const folded = await eased(el, canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(Object.keys(folded), 'folded: what eases').toEqual(['width']);
    // Docked upright, folded: the same along its height, from its own folded height.
    canvas.getByRole('button', { name: 'Move the comment bar' }).focus();
    for (let i = 0; i < 8 && !el.dataset.dock; i++) await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await waitFor(() => expect(el).toHaveAttribute('data-dock', 'left'));
    await new Promise((r) => setTimeout(r, 450));
    const foldedHeight = el.getBoundingClientRect().height;
    const upright = await eased(el, canvas.getByRole('button', { name: 'Comment' }));
    await expect(Object.keys(upright), 'upright: what eases').toEqual(['height']);
    await expect(Math.abs(upright.height[0] + 2 - foldedHeight)).toBeLessThan(1);
    await expect(upright.height[1] - upright.height[0]).toBeGreaterThan(100);
    const uprightFolded = await eased(el, canvas.getByRole('button', { name: 'Stop commenting' }));
    await expect(Object.keys(uprightFolded), 'uprightFolded: what eases').toEqual(['height']);
  },
};

/** Remembered docked to the right while drawing: upright, the colours open below the tools. */
export const DockedDrawing: Story = {
  args: { commenting: true, tool: 'pen', color: 'blue', canUndo: true },
  render: (args) => <Held {...args} />,
  beforeEach: remembering({ dock: 'right', x: 1, y: 0.5 }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(bar(canvasElement)).toHaveAttribute('data-dock', 'right');
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toHaveAttribute('aria-orientation', 'vertical');
    await expect(canvas.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Remembered docked to the left, folded: the icon alone, with the open comments counted on its corner. */
export const DockedFolded: Story = {
  args: { openCount: 3 },
  render: (args) => <Held {...args} />,
  beforeEach: remembering({ dock: 'left', x: 0, y: 0.4 }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(bar(canvasElement)).toHaveAttribute('data-dock', 'left');
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    await expect(await canvas.findByRole('toolbar', { name: 'Comment tools' })).toHaveAttribute('aria-orientation', 'vertical');
  },
};

/** Where it would not fit upright — a stage lower than the bar is long — it stays on its side at the edge. */
export const NoRoomToDock: Story = {
  args: { commenting: true },
  render: (args) => <Held {...args} short />,
  beforeEach: remembering(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    canvas.getByRole('button', { name: 'Move the comment bar' }).focus();
    for (let i = 0; i < 8; i++) await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    await expect(bar(canvasElement)).not.toHaveAttribute('data-dock');
    await expect(canvas.getByRole('toolbar', { name: 'Comment tools' })).toHaveAttribute('aria-orientation', 'horizontal');
  },
};

/** Drawing: the colours have slid open beside the tools, and the bar has eased wider to hold them. */
export const Drawing: Story = {
  render: (args) => {
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Blue' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Pen' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Blue' }));
    await expect(canvas.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  },
};

/**
 * Unfolding grows the bar from its middle, so its tools slide along under a pointer that has not moved: none
 * of them flashes its tooltip on the way. The tooltips are back once the pointer itself moves again.
 */
export const NoTooltipsWhileItGrows: Story = {
  render: (args) => {
    const [commenting, setCommenting] = useState(false);
    const [tool, setTool] = useState<CommentTool>('pin');
    const [color, setColor] = useState<MarkupColor>('red');
    return <CommentBar {...args} commenting={commenting} onCommentingChange={setCommenting} tool={tool} onToolChange={setTool} color={color} onColorChange={setColor} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tooltip = () => document.body.querySelector('[data-slot="tooltip-content"]');
    // The pointer, at the middle of an element: the bar tells a real movement from a still pointer by its coordinates.
    const pointAt = (name: string) => {
      const target = canvas.getByRole('button', { name });
      const r = target.getBoundingClientRect();
      return userEvent.pointer({ target, coords: { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 } });
    };
    await pointAt('Comment');
    await userEvent.click(canvas.getByRole('button', { name: 'Comment' }));
    // A tool slides in under the pointer while the bar grows.
    await canvas.findByRole('button', { name: 'Area' });
    await pointAt('Area');
    await new Promise((r) => setTimeout(r, 700));
    await expect(tooltip()).toBeNull();
    // Settled, the reviewer moves the pointer: the tooltips answer again.
    await pointAt('Pen');
    await pointAt('Arrow');
    await waitFor(() => expect(tooltip()).toHaveTextContent('Arrow'));
  },
};
