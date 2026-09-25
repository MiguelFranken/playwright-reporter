import { Cloud, Database, HardDrive } from 'lucide-react';
import { Badge } from '../../components/badge';

/** The drivers the product ships. A UI union, not an import from the app. */
export type StorageDriver = 'local' | 'vercel-blob' | 's3';

/** Where an S3 driver writes. Never credentials: this is shown to project admins. */
export interface S3StorageDetails {
  bucket: string;
  region: string;
  /** A custom endpoint (R2, MinIO, …), or `null` for AWS. */
  endpoint: string | null;
  /** `''` when objects are stored at the bucket root. */
  keyPrefix: string;
  /** Bucket lifecycle rules expire artifacts, rather than the app's sweep. */
  lifecycle: boolean;
}

export interface StorageCardProps {
  driver: StorageDriver;
  localDir: string;
  blobConfigured: boolean;
  /** The S3 settings, when `driver` is `s3` and they are valid. */
  s3?: S3StorageDetails | null;
  /** Why the S3 settings are unusable, when they are not. */
  s3Error?: string | null;
}

const ICONS = { local: HardDrive, 'vercel-blob': Cloud, s3: Database } as const;

export function StorageCard({ driver, localDir, blobConfigured, s3, s3Error }: StorageCardProps) {
  const Icon = ICONS[driver];
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium">Active driver</span>
        <Badge variant="secondary" className="font-mono">
          {driver}
        </Badge>
      </div>
      {driver === 'local' ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Directory</dt>
          <dd className="break-all font-mono">{localDir}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd className="text-muted-foreground">
            Attachments (screenshots, videos, traces) are written to the local filesystem of the server. Set{' '}
            <code className="font-mono">STORAGE_DRIVER=s3</code> for an S3-compatible bucket, or{' '}
            <code className="font-mono">STORAGE_DRIVER=vercel-blob</code> and <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> for Vercel
            Blob.
          </dd>
        </dl>
      ) : driver === 's3' ? (
        <S3Details s3={s3} error={s3Error} />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Token</dt>
          <dd>{blobConfigured ? 'BLOB_READ_WRITE_TOKEN is set' : <span className="text-destructive">BLOB_READ_WRITE_TOKEN is missing</span>}</dd>
          <dt className="text-muted-foreground">Note</dt>
          <dd className="text-muted-foreground">
            Attachments are uploaded to Vercel Blob. Set <code className="font-mono">STORAGE_DRIVER=local</code> to store them on disk instead.
          </dd>
        </dl>
      )}
    </div>
  );
}

function S3Details({ s3, error }: { s3?: S3StorageDetails | null; error?: string | null }) {
  if (!s3) {
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Configuration</dt>
        <dd className="text-destructive">{error ?? 'The S3 settings are incomplete.'}</dd>
      </dl>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Bucket</dt>
      <dd className="break-all font-mono">{s3.bucket}</dd>
      <dt className="text-muted-foreground">Region</dt>
      <dd className="font-mono">{s3.region}</dd>
      <dt className="text-muted-foreground">Endpoint</dt>
      <dd className="break-all font-mono">{s3.endpoint ?? 'AWS S3'}</dd>
      {s3.keyPrefix ? (
        <>
          <dt className="text-muted-foreground">Key prefix</dt>
          <dd className="break-all font-mono">{s3.keyPrefix}</dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">Retention</dt>
      <dd>{s3.lifecycle ? 'Bucket lifecycle rules, written by this app' : 'Deleted by this app, during a sweep'}</dd>
      <dt className="text-muted-foreground">Note</dt>
      <dd className="text-muted-foreground">
        The reporter uploads attachments straight to the bucket with presigned URLs; the browser reads media the same way.
      </dd>
    </dl>
  );
}
