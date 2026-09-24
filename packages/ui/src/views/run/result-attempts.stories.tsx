import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { attempts, cleanAttempt, failedAttempt } from '../../fixtures/attempts';
import { ResultAttempts } from './result-attempts';

const meta = {
  title: 'Views/Run/ResultAttempts',
  component: ResultAttempts,
  args: { attempts },
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta<typeof ResultAttempts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The flaky shape: two failures then a pass. */
export const Flaky: Story = {};

export const SinglePass: Story = { args: { attempts: [cleanAttempt] } };

export const Failed: Story = { args: { attempts: [failedAttempt] } };

/** An attempt whose trace is still uploading offers no dead download link. */
export const UploadPending: Story = { args: { attempts: [attempts[1]!] } };

/** A failing attempt opens on its error, because that is what you came for. */
export const OpensOnTheError: Story = {
  args: { attempts: [failedAttempt] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: /error/i })).toHaveAttribute('aria-selected', 'true');
  },
};

/** …and a passing one opens on its steps, since it has no error to show. */
export const PassingOpensOnSteps: Story = {
  args: { attempts: [cleanAttempt] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('tab', { name: /steps/i })).toHaveAttribute('aria-selected', 'true');
  },
};

export const ShowsAttachments: Story = {
  args: { attempts: [failedAttempt] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: /attachments/i }));
    await expect(canvas.getByText('test-failed-1.png')).toBeVisible();
    await expect(canvas.getByText('trace.zip')).toBeVisible();
  },
};

export const NoAttempts: Story = { args: { attempts: [] } };
