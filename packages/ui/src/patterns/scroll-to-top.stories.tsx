import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ScrollToTop } from './scroll-to-top';

const meta = {
  title: 'Patterns/Navigation/ScrollToTop',
  component: ScrollToTop,
  args: { threshold: 200 },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="bg-surface p-6">
        <p className="text-body-m text-muted-foreground">Scroll down: the button appears at the bottom right.</p>
        <div className="h-[300vh]" />
        {Story()}
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollToTop>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hidden at the top of the page; scrolled down, it appears and takes the page back up. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: 'Scroll to top' })).toBeNull();
    window.scrollTo({ top: 600 });
    await userEvent.click(await canvas.findByRole('button', { name: 'Scroll to top' }));
    // A smooth scroll: give a slow machine time to glide all the way up.
    await waitFor(() => expect(window.scrollY).toBe(0), { timeout: 5000 });
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Scroll to top' })).toBeNull());
  },
};
