import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from './select';

const BROWSERS = [
  { value: 'all', label: 'All browsers' },
  { value: 'chromium', label: 'Chromium' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'webkit', label: 'WebKit' },
];

const meta = {
  title: 'Primitives/Forms/Select',
  component: Select,
  parameters: { layout: 'centered' },
  args: { onValueChange: fn() },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

const BrowserSelect = (args: React.ComponentProps<typeof Select>) => (
  <Select items={BROWSERS} defaultValue="all" {...args}>
    <SelectTrigger className="min-w-48" aria-label="Browser">
      <SelectValue placeholder="Browser" />
    </SelectTrigger>
    <SelectContent>
      {BROWSERS.map((b) => (
        <SelectItem key={b.value} value={b.value}>
          {b.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const Default: Story = { render: BrowserSelect };

export const Grouped: Story = {
  render: (args) => (
    <Select defaultValue="chromium" {...args}>
      <SelectTrigger className="min-w-48" aria-label="Project">
        <SelectValue placeholder="Project" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Desktop</SelectLabel>
          <SelectItem value="chromium">Chromium</SelectItem>
          <SelectItem value="firefox">Firefox</SelectItem>
          <SelectItem value="webkit">WebKit</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Mobile</SelectLabel>
          <SelectItem value="pixel">Pixel 7</SelectItem>
          <SelectItem value="iphone">iPhone 15</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = { render: BrowserSelect, args: { disabled: true } };

/** Labelled by a `<label for>` instead of `aria-label`: the listbox takes that name too. */
export const WithVisibleLabel: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="browser-select" className="text-label-m">
        Browser
      </label>
      <Select items={BROWSERS} defaultValue="all" {...args}>
        <SelectTrigger id="browser-select" className="min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BROWSERS.map((b) => (
            <SelectItem key={b.value} value={b.value}>
              {b.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Browser' }));
    await expect(await within(document.body).findByRole('listbox', { name: 'Browser' })).toBeInTheDocument();
  },
};

/** Pointer path. The listbox is portalled, so it is queried off the body. */
export const PicksAnOption: Story = {
  render: BrowserSelect,
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: /browser/i }));

    const option = await body.findByRole('option', { name: 'WebKit' });
    await userEvent.click(option);

    await expect(args.onValueChange).toHaveBeenCalledWith('webkit', expect.anything());
  },
};

/** Keyboard path — the one people actually use when filtering a long run list. */
export const PicksByKeyboard: Story = {
  render: BrowserSelect,
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole('combobox', { name: /browser/i });
    trigger.focus();
    await userEvent.keyboard('{Enter}');

    // The listbox carries the trigger's name, so a screen reader announces
    // "Browser, listbox" rather than a bare list.
    const listbox = await within(document.body).findByRole('listbox', { name: 'Browser' });
    await waitFor(() => expect(within(listbox).getAllByRole('option').length).toBeGreaterThan(1));

    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(args.onValueChange).toHaveBeenCalled());
  },
};
