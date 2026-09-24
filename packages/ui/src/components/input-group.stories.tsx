import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Search, X } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from './input-group';

const meta = {
  title: 'Primitives/InputGroup',
  component: InputGroup,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Search_: Story = {
  name: 'Search',
  render: () => (
    <InputGroup className="w-96">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search tests…" aria-label="Search tests" />
    </InputGroup>
  ),
};

export const WithTrailingButton: Story = {
  args: { onClick: fn() },
  render: (args) => (
    <InputGroup className="w-96">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput defaultValue="guest cart" aria-label="Search tests" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Clear search" onClick={(event) => args.onClick?.(event as never)}>
          <X />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /clear search/i }));
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const WithPrefixText: Story = {
  render: () => (
    <InputGroup className="w-96">
      <InputGroupAddon>
        <InputGroupText>reporter.dev/</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput defaultValue="acme/web-e2e" aria-label="Project URL" />
    </InputGroup>
  ),
};

export const Textarea_: Story = {
  name: 'Textarea',
  render: () => (
    <InputGroup className="w-96">
      <InputGroupTextarea placeholder="Why mute this test?" aria-label="Reason" />
      <InputGroupAddon align="block-end">
        <InputGroupText>Markdown is not rendered.</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/** Clicking the addon focuses the input — that is the whole reason it is a group. */
export const AddonFocusesInput: Story = {
  render: () => (
    <InputGroup className="w-96">
      <InputGroupAddon data-testid="addon">
        <Search />
      </InputGroupAddon>
      <InputGroupInput aria-label="Search tests" />
    </InputGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const addon = canvasElement.querySelector<HTMLElement>('[data-slot="input-group-addon"]')!;
    await userEvent.click(addon);
    await expect(canvas.getByRole('textbox', { name: /search tests/i })).toHaveFocus();
  },
};
