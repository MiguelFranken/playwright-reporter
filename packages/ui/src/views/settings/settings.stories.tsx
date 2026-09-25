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

const S3 = { bucket: 'acme-playwright-artifacts', region: 'eu-central-1', endpoint: null, keyPrefix: '', lifecycle: false };

/** AWS S3: bucket and region, the sweep deletes expired artifacts. */
export const StorageS3: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard driver="s3" localDir="" blobConfigured={false} s3={S3} />
    </Framed>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('acme-playwright-artifacts')).toBeVisible();
    await expect(canvas.getByText('AWS S3')).toBeVisible();
  },
};

/** An S3-compatible store on its own endpoint, with a key prefix and lifecycle rules. */
export const StorageS3Compatible: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard
        driver="s3"
        localDir=""
        blobConfigured={false}
        s3={{
          bucket: 'playwright-reporter-artifacts-production-eu-central-1-acme-corporation',
          region: 'auto',
          endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
          keyPrefix: 'reporter/production/',
          lifecycle: true,
        }}
      />
    </Framed>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/lifecycle rules, written by this app/)).toBeVisible();
  },
};

/** `STORAGE_DRIVER=s3` without a usable configuration. */
export const StorageS3Misconfigured: Story = {
  render: () => (
    <Framed title="Storage" description="Where screenshots, videos and traces are kept.">
      <StorageCard driver="s3" localDir="" blobConfigured={false} s3={null} s3Error="STORAGE_DRIVER=s3 needs S3_BUCKET." />
    </Framed>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('STORAGE_DRIVER=s3 needs S3_BUCKET.')).toBeVisible();
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
