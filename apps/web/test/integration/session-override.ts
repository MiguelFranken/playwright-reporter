/**
 * Lets the `actor` fixture answer `auth.api.getSession` without paying for a
 * real password hash on every test. `current === undefined` means "no
 * override": the call goes through to Better Auth, which is what
 * `better-auth.test.ts` relies on.
 */
export type OverrideUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
  image?: string | null;
  emailVerified?: boolean;
  banned?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export const sessionOverride: { current: { user: OverrideUser; session: object } | null | undefined } = {
  current: undefined,
};
