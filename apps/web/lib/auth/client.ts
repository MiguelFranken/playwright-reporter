'use client';

import { adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Client usage is deliberately narrow: the login form, the sign-out button and
 * the account page. Everything else goes through Server Actions that call
 * `auth.api.*` next to the authorization checks in `lib/auth/access.ts`.
 */
export const authClient = createAuthClient({ plugins: [adminClient()] });
