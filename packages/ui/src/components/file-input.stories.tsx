import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FileInput } from './file-input';
import { Label } from './label';

const meta = {
  title: 'Primitives/FileInput',
  component: FileInput,
  tags: ['themed'],
  parameters: { layout: 'centered' },
  args: { id: 'file', name: 'file', hint: 'JSON or CSV, up to 4 MB', onFilesChange: fn() },
  render: (args) => (
    <div className="flex w-96 flex-col gap-1.5">
      <Label htmlFor={args.id}>File</Label>
      <FileInput {...args} />
    </div>
  ),
} satisfies Meta<typeof FileInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Picked: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('File');
    const file = new File(['{"cases":[]}'], 'test-cases-2026-09-29-with-a-rather-long-name.json', { type: 'application/json' });
    await userEvent.upload(input, file);
    await expect(args.onFilesChange).toHaveBeenLastCalledWith([file]);
    await expect(canvas.getByText(file.name)).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Remove file' }));
    await expect(args.onFilesChange).toHaveBeenLastCalledWith([]);
    await expect(canvas.getByText('Choose a file or drag it here')).toBeVisible();

    await userEvent.upload(input, file);
  },
};

export const Multiple: Story = {
  args: { multiple: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText('File'), [new File(['a'], 'a.csv'), new File(['bb'], 'b.csv')]);
    await expect(canvas.getByText('2 files')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Remove files' })).toBeVisible();
  },
};

export const Invalid: Story = { args: { 'aria-invalid': true } };

export const Disabled: Story = { args: { disabled: true } };
