import type { CollectionBeforeChangeHook } from 'payload';

/** Stamps the first publish, and never touches the value again. */
export const populatePublishedAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data._status === 'published' && !data.publishedAt && !originalDoc?.publishedAt) {
    return { ...data, publishedAt: new Date().toISOString() };
  }
  return data;
};
