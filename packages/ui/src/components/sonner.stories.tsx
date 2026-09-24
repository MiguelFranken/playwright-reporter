import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { toast } from 'sonner';
import { Toaster } from './sonner';
import { Button } from './button';

/**
 * The preview already renders one `<Toaster />` for every story, exactly as the
 * app's root layout does, so these stories only fire toasts.
 */
const meta = {
  title: 'Primitives/Toaster',
  component: Toaster,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => toast('Run 482 finished')}>
        Message
      </Button>
      <Button variant="outline" onClick={() => toast.success('Token copied')}>
        Success
      </Button>
      <Button variant="outline" onClick={() => toast.error('Could not reach the reporter')}>
        Error
      </Button>
      <Button
        variant="outline"
        onClick={() => toast('Project deleted', { description: 'All runs and artifacts were removed.' })}
      >
        With description
      </Button>
    </div>
  ),
};

export const ShowsAToast: Story = {
  render: () => (
    <Button variant="outline" onClick={() => toast.success('Token copied')}>
      Copy token
    </Button>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /copy token/i }));
    const toastEl = await within(document.body).findByText('Token copied');
    // Sonner animates the toast in from off-screen.
    await waitFor(() => expect(toastEl).toBeVisible());
  },
};
