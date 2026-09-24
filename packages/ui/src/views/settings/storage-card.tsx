import { Cloud, HardDrive } from 'lucide-react';
import { Badge } from '../../components/badge';

/** The drivers the product ships. A UI union, not an import from the app. */
export type StorageDriver = 'local' | 'vercel-blob';

export function StorageCard({ driver, localDir, blobConfigured }: { driver: StorageDriver; localDir: string; blobConfigured: boolean }) {
  const Icon = driver === 'local' ? HardDrive : Cloud;
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
            <code className="font-mono">STORAGE_DRIVER=vercel-blob</code> and <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> to use Vercel
            Blob instead.
          </dd>
        </dl>
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
