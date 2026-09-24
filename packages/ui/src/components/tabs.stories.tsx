import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

const meta = {
  title: 'Primitives/Tabs',
  component: Tabs,
  parameters: { layout: 'padded' },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const RunTabs = (args: React.ComponentProps<typeof Tabs>) => (
  <Tabs defaultValue="summary" {...args}>
    <TabsList>
      <TabsTrigger value="summary">Summary</TabsTrigger>
      <TabsTrigger value="specs">Specs</TabsTrigger>
      <TabsTrigger value="errors">Errors</TabsTrigger>
      <TabsTrigger value="config">Config</TabsTrigger>
    </TabsList>
    <TabsContent value="summary">Counts, duration and the outcome bar.</TabsContent>
    <TabsContent value="specs">One row per spec file.</TabsContent>
    <TabsContent value="errors">Failures grouped by error signature.</TabsContent>
    <TabsContent value="config">The Playwright config this run reported.</TabsContent>
  </Tabs>
);

export const Default: Story = { render: RunTabs };

const LineTabs = (args: React.ComponentProps<typeof Tabs>) => (
  <Tabs defaultValue="summary" {...args}>
    <TabsList variant="line">
      <TabsTrigger value="summary">Summary</TabsTrigger>
      <TabsTrigger value="specs">Specs</TabsTrigger>
      <TabsTrigger value="errors">Errors</TabsTrigger>
      <TabsTrigger value="config">Configuration</TabsTrigger>
    </TabsList>
    <TabsContent value="summary">Counts, duration and the outcome bar.</TabsContent>
    <TabsContent value="specs">One row per spec file.</TabsContent>
    <TabsContent value="errors">Failures grouped by error signature.</TabsContent>
    <TabsContent value="config">The Playwright config this run reported.</TabsContent>
  </Tabs>
);

export const Line: Story = { render: LineTabs };

/**
 * The strip renders its own underline, and it travels rather than blinking from
 * one tab to the next. Base UI measures the selected tab and publishes the
 * result as CSS variables, so the assertion is that those land on the tab that
 * is actually selected.
 */
export const LineIndicatorTracksSelection: Story = {
  render: LineTabs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvasElement.querySelector('[data-slot="tabs-list"]')!;
    const indicator = canvasElement.querySelector('[data-slot="tabs-indicator"]')!;
    const spans = (tab: HTMLElement) => {
      const a = indicator.getBoundingClientRect();
      const b = tab.getBoundingClientRect();
      // Within a pixel: the indicator is laid out from the strip's scroll box.
      return Math.abs(a.left - b.left) <= 1 && Math.abs(a.width - b.width) <= 1;
    };

    await expect(list).toContainElement(indicator as HTMLElement);
    await waitFor(() => expect(spans(canvas.getByRole('tab', { name: 'Summary' }))).toBe(true));

    await userEvent.click(canvas.getByRole('tab', { name: 'Configuration' }));
    await waitFor(() => expect(spans(canvas.getByRole('tab', { name: 'Configuration' }))).toBe(true));
  },
};

/** The default variant marks its choice with a pill, so it grows no underline. */
export const DefaultHasNoIndicator: Story = {
  render: RunTabs,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="tabs-indicator"]')).toBeNull();
  },
};

export const Vertical: Story = {
  render: (args) => (
    <Tabs defaultValue="summary" orientation="vertical" {...args}>
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="specs">Specs</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">Counts, duration and the outcome bar.</TabsContent>
      <TabsContent value="specs">One row per spec file.</TabsContent>
    </Tabs>
  ),
};

export const SwitchesOnClick: Story = {
  render: RunTabs,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Errors' }));
    await expect(args.onValueChange).toHaveBeenCalledWith('errors', expect.anything());
    await expect(canvas.getByRole('tab', { name: 'Errors' })).toHaveAttribute('aria-selected', 'true');
    // Every panel stays mounted, so the assertion is about which one is shown.
    await expect(canvas.getByText(/grouped by error signature/i)).toBeVisible();
  },
};

/** Arrow keys move between tabs; that is the whole point of the tab role. */
export const SwitchesWithArrowKeys: Story = {
  render: RunTabs,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const first = canvas.getByRole('tab', { name: 'Summary' });
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    // Arrow keys move the roving tabindex; Enter or Space is what selects.
    await expect(canvas.getByRole('tab', { name: 'Specs' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(args.onValueChange).toHaveBeenCalledWith('specs', expect.anything()));
  },
};
