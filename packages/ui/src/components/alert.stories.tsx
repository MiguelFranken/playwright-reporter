import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { TriangleAlert, Info } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';

const meta = {
  title: 'Primitives/Alert',
  component: Alert,
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'destructive'] } },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <Info />
        <AlertTitle>Run is still ingesting</AlertTitle>
        <AlertDescription>Results appear as shards report in. This page refreshes itself.</AlertDescription>
      </>
    ),
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: (
      <>
        <TriangleAlert />
        <AlertTitle>Upload failed</AlertTitle>
        <AlertDescription>
          The trace for attempt 2 could not be stored. Re-running the spec will produce a new one.
        </AlertDescription>
      </>
    ),
  },
};

export const WithAction: Story = {
  args: {
    children: (
      <>
        <Info />
        <AlertTitle>No storage driver configured</AlertTitle>
        <AlertDescription>Screenshots and traces are discarded until one is set.</AlertDescription>
        <AlertAction>
          <Button size="xs" variant="outline">
            Configure
          </Button>
        </AlertAction>
      </>
    ),
  },
};

export const TitleOnly: Story = {
  args: { children: <AlertTitle>Retries are disabled for this project.</AlertTitle> },
};

/** An alert announces itself; assistive tech should find it by role. */
export const HasAlertRole: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const alert = within(canvasElement).getByRole('alert');
    await expect(alert).toHaveTextContent(/run is still ingesting/i);
  },
};
