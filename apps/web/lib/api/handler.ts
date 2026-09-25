/**
 * The request pipeline of `/api/v1/*`: oRPC's OpenAPI handler over the v1
 * router, answering from inside the Next.js route handler (no server of its
 * own). Created once per process; every request gets its own context.
 */
import { SmartCoercionHandlerPlugin } from '@orpc/json-schema';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ResponseHeadersHandlerPlugin } from '@orpc/server/plugins';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { ERROR_STATUS, asProblemResponse, problemBody } from './errors';
import { router } from './v1/router';

export const API_PREFIX = '/api/v1';

const handler = new OpenAPIHandler(router, {
  plugins: [
    // Query strings are text; this turns `limit=5` into 5 and `retried=true` into true, from the input schemas.
    new SmartCoercionHandlerPlugin({ converters: [new ZodToJsonSchemaConverter()] }),
    new ResponseHeadersHandlerPlugin(),
  ],
  errorStatusMap: ERROR_STATUS,
  customErrorResponseBodyEncoder: problemBody,
  interceptors: [
    async ({ next, path }) => {
      try {
        return await next();
      } catch (error) {
        if (!process.env.VITEST) console.error(`[api] ${path.join('.')} failed`, error);
        throw error;
      }
    },
  ],
});

const notFound = () =>
  asProblemResponse(
    Response.json(
      { type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND', detail: 'No such endpoint.', hint: 'See /api/v1/openapi.json for the endpoints.' },
      { status: 404 },
    ),
  );

export async function handleApiRequest(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, {
    prefix: API_PREFIX,
    context: { headers: request.headers },
  });
  if (!matched || !response) return notFound();
  const headers = new Headers(response.headers);
  // Every answer is somebody's private test data.
  headers.set('cache-control', 'private, no-store');
  if (response.status === 401) headers.set('www-authenticate', 'Bearer realm="api"');
  return asProblemResponse(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}
