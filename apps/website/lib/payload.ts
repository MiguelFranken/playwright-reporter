import { getPayload } from 'payload';
import configPromise from '@payload-config';

/**
 * The Local API handle. Payload caches the instance itself, so this is a thin
 * alias that keeps `@payload-config` out of every call site.
 */
export function payloadClient() {
  return getPayload({ config: configPromise });
}
