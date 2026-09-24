import type { GlobalAfterChangeHook } from 'payload';
import { revalidatePath } from 'next/cache';

/**
 * Header, footer and site settings all render in the root layout, so a change
 * to any of them invalidates every page at once.
 */
export const revalidateLayout: GlobalAfterChangeHook = ({ doc, req }) => {
  if (req.context?.disableRevalidate) return doc;
  req.payload.logger.info('Revalidating the layout');
  revalidatePath('/', 'layout');
  return doc;
};
