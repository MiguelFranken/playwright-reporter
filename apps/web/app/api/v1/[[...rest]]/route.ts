import { handleApiRequest } from '@/lib/api/handler';

/**
 * The public REST API (`lib/api`). One route handler serves every endpoint:
 * oRPC routes the request to its procedure in the same process.
 */
export const GET = handleApiRequest;
export const HEAD = handleApiRequest;
export const POST = handleApiRequest;
export const PUT = handleApiRequest;
export const PATCH = handleApiRequest;
export const DELETE = handleApiRequest;
