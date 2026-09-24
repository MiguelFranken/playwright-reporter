'use client';

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react';
import { useRouter } from 'next/navigation';

/**
 * Live preview. The admin panel posts a message on every keystroke; this asks
 * Next to re-render the (server-rendered) page, so the preview shows the real
 * page rather than a client-side approximation of it.
 */
export function LivePreviewListener({ serverURL }: { serverURL: string }) {
  const router = useRouter();
  return <RefreshRouteOnSave refresh={() => router.refresh()} serverURL={serverURL} />;
}
