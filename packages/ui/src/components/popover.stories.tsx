import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from './button';
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from './popover';

const meta = {
  title: 'Primitives/Overlays/Popover',
  component: Popover,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

const Example = (args: React.ComponentProps<typeof Popover>) => (
  <Popover {...args}>
    <PopoverTrigger render={<Button variant="outline" />}>Share</PopoverTrigger>
    <PopoverContent>
      <div className="flex flex-col gap-2">
        <PopoverTitle>Share this checkpoint</PopoverTitle>
        <PopoverDescription>Anyone in the team can open the link.</PopoverDescription>
        <PopoverClose render={<Button size="sm" className="self-end" />}>Done</PopoverClose>
      </div>
    </PopoverContent>
  </Popover>
);

export const Default: Story = { render: Example };

export const OpensAndCloses: Story = {
  render: Example,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Share' }));
    const body = within(document.body);
    await waitFor(() => expect(body.getByText('Share this checkpoint')).toBeVisible());
    await userEvent.click(body.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(body.queryByText('Share this checkpoint')).toBeNull());
  },
};
