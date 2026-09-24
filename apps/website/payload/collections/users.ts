import type { CollectionConfig } from 'payload';
import { admins, adminFieldAccess, adminsOrSelf } from '../access';

/**
 * CMS users. Deliberately unrelated to the reporter's own users: different
 * auth system, different table, different schema. Nobody who edits the website
 * thereby gets access to test data, and nobody registers themselves — an admin
 * creates the account.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'role', 'updatedAt'],
    group: 'Admin',
  },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  access: {
    read: adminsOrSelf,
    create: admins,
    update: adminsOrSelf,
    delete: admins,
    admin: ({ req }) => Boolean(req.user),
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      // Saved into the JWT so access control needs no extra database read,
      // and writable only by admins so an editor cannot promote themselves.
      saveToJWT: true,
      access: { create: adminFieldAccess, update: adminFieldAccess },
      admin: { position: 'sidebar' },
    },
  ],
  timestamps: true,
};
