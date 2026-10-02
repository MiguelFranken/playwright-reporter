import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { placeOrderFlow } from '../../fixtures/review';
import { CheckpointDetails } from './checkpoint-details';

const checkpoint = placeOrderFlow.checkpoints[1];

const meta = {
  title: 'Views/Review/Viewer/CheckpointDetails',
  component: CheckpointDetails,
  args: {
    flow: placeOrderFlow,
    checkpoint,
    capture: checkpoint.captures[0],
    shortcuts: [
      [['←', '→'], 'Previous / next checkpoint'],
      [['D'], 'Details: step, URL, video, trace'],
    ],
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof CheckpointDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Behind a button: where in the test the capture was taken, and the evidence. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Details' }));
    const details = await body.findByRole('dialog', { name: 'Details' });
    await waitFor(() => expect(details).toBeVisible());
    await expect(within(details).getByText('Step')).toBeInTheDocument();
    await expect(within(details).getByRole('link', { name: 'Test result' })).toBeInTheDocument();
  },
};

/** Open, in the library: which run the screen is from. */
export const InTheLibrary: Story = { args: { library: true, open: true } };
