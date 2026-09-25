import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { attempts, cleanAttempt, expiredAttempt, failedAttempt } from '../../fixtures/attempts';
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

/**
 * An old run after the retention policy deleted its artifacts: each one says
 * so and offers no link that would only 410.
 */
export const ArtifactsExpired: Story = {
  args: { attempts: [expiredAttempt] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: /screenshots/i }));
    await expect(canvas.getAllByText('Expired').length).toBeGreaterThan(0);
    await expect(canvas.queryByRole('img')).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: /trace/i }));
    await expect(canvas.queryByText(/full screen|download/i)).toBeNull();
    await expect(canvas.getByText('expired')).toBeInTheDocument();
  },
};

/** An uploaded trace opens embedded, with a way out to a full tab and to the zip. */
export const TraceEmbedded: Story = {
  args: { attempts: [failedAttempt] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: /trace/i }));
    await expect(canvas.getByTitle('Trace Viewer: trace.zip')).toBeInTheDocument();
    // Link-rendered buttons carry role="button", so find them by their label.
    await expect(canvas.getByText(/open full screen/i).closest('a')).toHaveAttribute('target', '_blank');
    await expect(canvas.getByText(/download/i).closest('a')).toHaveAttribute('href', '#trace-download?download');
  },
};

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
