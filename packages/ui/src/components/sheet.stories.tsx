import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from './sheet';
import { Button } from './button';

const meta = {
  title: 'Primitives/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
  args: { onOpenChange: fn() },
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const TestSheet = (side: 'left' | 'right' | 'top' | 'bottom') =>
  function Render(args: React.ComponentProps<typeof Sheet>) {
    return (
      <Sheet {...args}>
        <SheetTrigger render={<Button variant="outline" />}>Open details</SheetTrigger>
        <SheetContent side={side}>
          <SheetHeader>
            <SheetTitle>checkout keeps a guest cart</SheetTitle>
            <SheetDescription>tests/checkout.spec.ts · 48 runs · 3 flaky</SheetDescription>
          </SheetHeader>
          <div className="px-4 text-body-s text-muted-foreground">
            The drawer the test explorer opens when a row is selected.
          </div>
          <SheetFooter>
            {/* Named "Done" rather than "Close": SheetContent already renders
                its own dismiss button labelled Close. */}
            <SheetClose render={<Button variant="outline" />}>Done</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  };

export const Right: Story = { render: TestSheet('right') };
export const Left: Story = { render: TestSheet('left') };
export const Bottom: Story = { render: TestSheet('bottom') };

export const OpensAndCloses: Story = {
  render: TestSheet('right'),
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: /open details/i }));

    const dialog = await body.findByRole('dialog');
    await expect(dialog).toHaveTextContent(/guest cart/i);
    await expect(args.onOpenChange).toHaveBeenCalled();

    await userEvent.click(body.getByRole('button', { name: /^done$/i }));
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());
  },
};
