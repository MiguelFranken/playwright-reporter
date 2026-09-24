import type { Access, FieldAccess } from 'payload';

/** Anyone, signed in or not. Media and published pages. */
export const anyone: Access = () => true;

/** Any signed-in CMS user. The baseline for writing content. */
export const authenticated: Access = ({ req }) => Boolean(req.user);

/** Only users with the `admin` role. Users and redirects. */
export const admins: Access = ({ req }) => req.user?.role === 'admin';

export const adminFieldAccess: FieldAccess = ({ req }) => req.user?.role === 'admin';

/** Admins, or the user acting on their own document. */
export const adminsOrSelf: Access = ({ req }) => {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  return { id: { equals: req.user.id } };
};

/**
 * Signed-in users see everything including drafts; anonymous visitors see only
 * published documents. The frontend passes `overrideAccess: false` so this is
 * what actually keeps unpublished pages off the public site.
 */
export const authenticatedOrPublished: Access = ({ req }) => {
  if (req.user) return true;
  return { _status: { equals: 'published' } };
};
