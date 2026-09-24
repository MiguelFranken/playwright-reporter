import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { Textarea } from './textarea';

const meta = {
  title: 'Primitives/Textarea',
  component: Textarea,
  args: { placeholder: 'Why is this test being muted?', 'aria-label': 'Reason' },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => <Textarea {...args} className="w-96" /> };
export const Disabled: Story = { args: { disabled: true, value: 'Flaky on webkit only.' } };
export const Invalid: Story = { args: { 'aria-invalid': true } };

export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole('textbox', { name: /reason/i });
    await userEvent.type(box, 'Times out on CI under load.');
    await expect(box).toHaveValue('Times out on CI under load.');
  },
};
