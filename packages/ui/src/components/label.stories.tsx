import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Label } from './label';
import { Input } from './input';

const meta = {
  title: 'Primitives/Label',
  component: Label,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { children: 'Project name' } };

/** The point of a label is the association, so that is what the story asserts. */
export const LabelsItsInput: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="project-name">Project name</Label>
      <Input id="project-name" defaultValue="web-e2e" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Project name');
    await expect(input).toHaveValue('web-e2e');
  },
};
