import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/card';
import { ReporterSetup } from './reporter-setup';
import { StorageCard } from './storage-card';

const meta = {
  title: 'Views/Settings',
  parameters: { layout: 'padded' },
  tags: ['themed'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Framed({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export const StorageLocal: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard driver="local" localDir="/var/lib/pw-reporter/.artifacts" blobConfigured={false} />
    </Framed>
  ),
};

export const StorageBlob: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard driver="vercel-blob" localDir="/var/lib/pw-reporter/.artifacts" blobConfigured />
    </Framed>
  ),
};

/** The driver is selected but its token is missing — the misconfiguration case. */
export const StorageBlobMisconfigured: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard driver="vercel-blob" localDir="/var/lib/pw-reporter/.artifacts" blobConfigured={false} />
    </Framed>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/BLOB_READ_WRITE_TOKEN is missing/)).toBeVisible();
  },
};

export const Reporter: Story = {
  render: () => (
    <Framed title="Reporter setup" description="Add this to the project's Playwright config.">
      <ReporterSetup baseUrl="https://reporter.acme.test" />
    </Framed>
  ),
};

/** A self-hosted install on a long internal URL — the snippet must not overflow. */
export const ReporterSelfHosted: Story = {
  render: () => (
    <Framed title="Reporter setup" description="Add this to the project's Playwright config.">
      <ReporterSetup baseUrl="https://playwright-reporter.internal.eu-central-1.acme-corporation.test:8443" />
    </Framed>
  ),
};
