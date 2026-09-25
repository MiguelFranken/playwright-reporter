import { createOpenAPI } from 'fumadocs-openapi/server';

/**
 * The REST API's OpenAPI document, generated from the router in apps/web
 * (`nub run api:docs` there) and checked in at the repository root.
 */
export const openapi = createOpenAPI({
  input: ['../../docs/openapi.json'],
});
